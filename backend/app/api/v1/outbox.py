"""Outbox для бота."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.models.messaging import OutboundMessage

router = APIRouter()


class OutboxOut(BaseModel):
    id: int
    channel_user_id: str
    order_id: int | None
    kind: str
    text: str | None

    model_config = {"from_attributes": True}


@router.get("", response_model=list[OutboxOut])
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


@router.post("/{msg_id}/sent")
async def mark_sent(msg_id: int, session: Annotated[AsyncSession, Depends(get_session)]) -> dict[str, str]:
    msg = await session.get(OutboundMessage, msg_id)
    if not msg:
        raise HTTPException(404, "not_found")
    msg.sent_at = datetime.now(UTC)
    await session.commit()
    return {"status": "ok"}
