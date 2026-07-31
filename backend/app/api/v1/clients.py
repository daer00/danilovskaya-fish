"""Клиенты (бот)."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.models.client import Client

router = APIRouter()


class ClientUpsert(BaseModel):
    telegram_id: str
    username: str | None = None
    full_name: str | None = None
    phone: str | None = None


class ClientOut(BaseModel):
    id: int
    telegram_id: str
    full_name: str | None
    phone: str | None
    username: str | None
    has_orders: bool = False

    model_config = {"from_attributes": True}


@router.post("/upsert", response_model=ClientOut)
async def upsert(payload: ClientUpsert, session: Annotated[AsyncSession, Depends(get_session)]) -> ClientOut:
    from app.models.order import Order

    c = await session.scalar(select(Client).where(Client.telegram_id == payload.telegram_id))
    if c is None:
        c = Client(telegram_id=payload.telegram_id)
        session.add(c)
    if payload.username is not None:
        c.username = payload.username
    if payload.full_name is not None:
        c.full_name = payload.full_name
    if payload.phone is not None:
        c.phone = payload.phone
    await session.commit()
    await session.refresh(c)
    has = await session.scalar(select(Order.id).where(Order.client_id == c.id).limit(1))
    return ClientOut(
        id=c.id,
        telegram_id=c.telegram_id,
        full_name=c.full_name,
        phone=c.phone,
        username=c.username,
        has_orders=has is not None,
    )
