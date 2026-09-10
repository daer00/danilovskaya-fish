"""Корзина из Telegram Mini App (без sendData — работает из меню и inline)."""

from __future__ import annotations

import hashlib
import hmac
import json
import time
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Annotated, Any
from urllib.parse import parse_qsl

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_session
from app.enums import OrderStatus
from app.models.client import Client
from app.models.messaging import OutboundMessage
from app.models.order import Order
from app.models.batch import Batch
from sqlalchemy.orm import selectinload
from app.api.v1.orders import CartItemIn, _out, build_order_items
from app.services.orders import active_batch, next_order_number

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


class InitIn(BaseModel):
    init_data: str = Field(min_length=1)


class WebappOrderOut(BaseModel):
    id: int
    number: int
    status: str
    status_label: str
    total: str
    сумма: str
    состав: str
    pickup_date: str
    created_at: str
    items: list[dict[str, object]]


class CheckoutOut(BaseModel):
    status: str
    order: WebappOrderOut


def _to_webapp_order(order: Order, batch: Batch | None) -> WebappOrderOut:
    base = _out(order)
    return WebappOrderOut(
        id=base.id,
        number=base.number,
        status=base.status,
        status_label=base.status_label,
        total=str(base.total),
        сумма=base.сумма,
        состав=base.состав,
        pickup_date=batch.pickup_date.isoformat() if batch else "",
        created_at=order.created_at.isoformat(),
        items=[
            {
                "product_id": i.product_id,
                "product_name": i.product_name,
                "quantity": str(i.quantity),
                "line_total": str(i.line_total),
            }
            for i in order.items
        ],
    )


async def _upsert_client(session: AsyncSession, user: dict[str, Any]) -> Client:
    from app.services.clients import find_by_telegram, merge_nicks

    tg_id = str(user["id"])
    client = await find_by_telegram(session, tg_id)
    if client is None:
        client = Client(telegram_id=tg_id)
        session.add(client)
    if user.get("username"):
        client.username = merge_nicks(client.username, str(user["username"]))
    name = f"{user.get('first_name') or ''} {user.get('last_name') or ''}".strip()
    if name and not client.full_name:
        client.full_name = name
    await session.flush()
    return client


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


@router.post("/cart", response_model=CheckoutOut)
async def submit_cart(
    body: CheckoutIn,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> CheckoutOut:
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

    batch = await active_batch(session)
    if not batch:
        raise HTTPException(400, "no_batch")
    now = datetime.now(UTC)
    dl = batch.deadline if batch.deadline.tzinfo else batch.deadline.replace(tzinfo=UTC)
    if now > dl:
        raise HTTPException(400, "deadline_passed")

    client = await _upsert_client(session, user)
    rows = [CartItemIn(product_id=i.product_id, quantity=Decimal(i.quantity)) for i in body.items]
    items, total = await build_order_items(session, rows, batch.id)

    for old in await session.scalars(
        select(Order).where(
            Order.client_id == client.id,
            Order.batch_id == batch.id,
            Order.status == OrderStatus.PROCESSING,
        )
    ):
        old.status = OrderStatus.CANCELLED

    full_name = client.full_name or f"{user.get('first_name') or ''} {user.get('last_name') or ''}".strip() or "Клиент"
    phone = client.phone or "—"
    order = Order(
        number=await next_order_number(session, batch.id),
        batch_id=batch.id,
        client_id=client.id,
        status=OrderStatus.PROCESSING,
        full_name=full_name,
        phone=phone,
        comment=None,
        total=total,
        items=items,
    )
    session.add(order)
    await session.flush()

    payload = {
        "items": [i.model_dump() for i in body.items],
        "username": user.get("username"),
        "order_id": order.id,
    }
    session.add(
        OutboundMessage(
            channel="tg",
            channel_user_id=tg_id,
            kind="webapp_cart",
            order_id=order.id,
            text=json.dumps(payload, ensure_ascii=False),
        )
    )
    await session.commit()
    order = await session.scalar(select(Order).where(Order.id == order.id).options(selectinload(Order.items)))
    assert order
    return CheckoutOut(status="ok", order=_to_webapp_order(order, batch))


@router.post("/orders", response_model=list[WebappOrderOut])
async def list_my_orders(
    body: InitIn,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[WebappOrderOut]:
    from app.services.clients import find_by_telegram

    user = _validate_webapp_init(body.init_data)
    tg_id = str(user["id"])
    client = await find_by_telegram(session, tg_id)
    if not client:
        return []
    rows = await session.scalars(
        select(Order)
        .where(Order.client_id == client.id)
        .options(selectinload(Order.items))
        .order_by(Order.id.desc())
        .limit(30)
    )
    out: list[WebappOrderOut] = []
    for o in rows:
        batch = await session.get(Batch, o.batch_id)
        out.append(_to_webapp_order(o, batch))
    return out
