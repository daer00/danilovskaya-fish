"""Входящие сообщения от клиентов (бот → backend)."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.outbox import require_bot_token
from app.core.database import get_session
from app.models.client_message import ClientMessage
from app.services.clients import find_by_telegram
from app.services.orders import notify_admins

router = APIRouter()


class InboundIn(BaseModel):
    telegram_id: str
    text: str = Field(min_length=1, max_length=4000)
    username: str | None = None


class InboundOut(BaseModel):
    id: int
    client_id: int
    status: str = "ok"


@router.post("/inbound", response_model=InboundOut, dependencies=[Depends(require_bot_token)])
async def inbound_message(
    payload: InboundIn, session: Annotated[AsyncSession, Depends(get_session)]
) -> InboundOut:
    text = payload.text.strip()
    if not text:
        raise HTTPException(400, "empty")
    client = await find_by_telegram(session, payload.telegram_id)
    if client is None:
        from app.models.client import Client

        client = Client(telegram_id=str(payload.telegram_id), username=payload.username)
        session.add(client)
        await session.flush()
    elif payload.username and not client.username:
        client.username = payload.username

    row = ClientMessage(client_id=client.id, direction="in", text=text)
    session.add(row)
    await session.flush()

    name = (client.full_name or "").strip() or (client.username and f"@{client.username}") or f"id {client.id}"
    preview = text if len(text) <= 120 else text[:117] + "…"
    await notify_admins(session, f"Сообщение от {name}:\n{preview}")
    await session.commit()
    return InboundOut(id=row.id, client_id=client.id)
