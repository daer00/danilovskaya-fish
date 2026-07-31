"""Тексты бота (чтение)."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.models.messaging import BotMessage

router = APIRouter()


class MsgOut(BaseModel):
    code: str
    text: str
    buttons: list | None = None

    model_config = {"from_attributes": True}


@router.get("", response_model=list[MsgOut])
async def list_messages(session: Annotated[AsyncSession, Depends(get_session)]) -> list[BotMessage]:
    return list(await session.scalars(select(BotMessage)))
