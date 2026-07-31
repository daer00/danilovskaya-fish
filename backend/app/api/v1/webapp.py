"""Корзина из Telegram Mini App (без sendData — работает из меню и inline)."""

from __future__ import annotations

import hashlib
import hmac
import json
import time
from datetime import UTC, datetime, timedelta
from typing import Annotated, Any
from urllib.parse import parse_qsl

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_session
from app.models.messaging import OutboundMessage

router = APIRouter()

_INIT_TTL_SEC = 600
_CART_COOLDOWN_SEC = 15
_MAX_ITEMS = 30


class CartItemIn(BaseModel):
    product_id: int
    name: str = Field(max_length=200)
    price: str = Field(max_length=32)
    quantity: str = Field(max_length=32)


class CheckoutIn(BaseModel):
    init_data: str = Field(min_length=1)
    items: list[CartItemIn] = Field(min_length=1, max_length=_MAX_ITEMS)


def _validate_webapp_init(init_data: str) -> dict[str, Any]:
    token = settings.tg_bot_token
    if not token:
        raise HTTPException(503, "bot_not_configured")
    parsed = dict(parse_qsl(init_data, keep_blank_values=True))
    received = parsed.pop("hash", None)
    if not received:
        raise HTTPException(401, "bad_init_data")
    check = "\n".join(f"{k}={v}" for k, v in sorted(parsed.items()))
    secret = hmac.new(b"WebAppData", token.encode(), hashlib.sha256).digest()
    calc = hmac.new(secret, check.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(calc, received):
        raise HTTPException(401, "bad_init_data")
    try:
        auth_date = int(parsed.get("auth_date") or 0)
    except ValueError as e:
        raise HTTPException(401, "bad_init_data") from e
    if not auth_date or time.time() - auth_date > _INIT_TTL_SEC:
        raise HTTPException(401, "init_data_expired")
    user_raw = parsed.get("user")
    if not user_raw:
        raise HTTPException(401, "no_user")
    try:
        return json.loads(user_raw)
    except json.JSONDecodeError as e:
        raise HTTPException(401, "bad_user") from e


@router.post("/cart")
async def submit_cart(
    body: CheckoutIn,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict[str, str]:
    user = _validate_webapp_init(body.init_data)
    tg_id = str(user["id"])
    since = datetime.now(UTC) - timedelta(seconds=_CART_COOLDOWN_SEC)
    recent = await session.scalar(
        select(OutboundMessage.id)
        .where(
            OutboundMessage.channel == "tg",
            OutboundMessage.channel_user_id == tg_id,
            OutboundMessage.kind == "webapp_cart",
            OutboundMessage.created_at >= since,
        )
        .limit(1)
    )
    if recent:
        raise HTTPException(429, "too_many_requests")
    payload = {
        "items": [i.model_dump() for i in body.items],
        "username": user.get("username"),
    }
    session.add(
        OutboundMessage(
            channel="tg",
            channel_user_id=tg_id,
            kind="webapp_cart",
            text=json.dumps(payload, ensure_ascii=False),
        )
    )
    await session.commit()
    return {"status": "ok"}
