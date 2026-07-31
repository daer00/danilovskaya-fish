"""Outbox для бота (только с X-Bot-Token)."""

from __future__ import annotations

import hmac
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_session
from app.models.messaging import OutboundMessage

router = APIRouter()


def require_bot_token(x_bot_token: Annotated[str | None, Header()] = None) -> None:
    expected = settings.bot_api_token
    if not expected or not x_bot_token or not hmac.compare_digest(x_bot_token, expected):
        raise HTTPException(401, "unauthorized")


class OutboxOut(BaseModel):
    id: int
    channel_user_id: str
    order_id: int | None
    kind: str
    text: str | None

    model_config = {"from_attributes": True}


@router.get("", response_model=list[OutboxOut], dependencies=[Depends(require_bot_token)])
async def pending(
    session: Annotated[AsyncSession, Depends(get_session)],
    channel: str = "tg",
) -> list[OutboundMessage]:
    rows = await session.scalars(
        select(OutboundMessage)
        .where(OutboundMessage.channel == channel, OutboundMessage.sent_at.is_(None))
        .order_by(OutboundMessage.id)
        .limit(50)
    )
    return list(rows)


@router.post("/{msg_id}/sent", dependencies=[Depends(require_bot_token)])
async def mark_sent(msg_id: int, session: Annotated[AsyncSession, Depends(get_session)]) -> dict[str, str]:
    msg = await session.get(OutboundMessage, msg_id)
    if not msg:
        raise HTTPException(404, "not_found")
    msg.sent_at = datetime.now(UTC)
    await session.commit()
    return {"status": "ok"}
