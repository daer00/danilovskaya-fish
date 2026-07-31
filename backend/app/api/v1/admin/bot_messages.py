"""Админ: тексты бота."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.admin.deps import CurrentAdmin
from app.core.database import get_session
from app.models.messaging import BotMessage

router = APIRouter()


class MsgOut(BaseModel):
    id: int
    code: str
    trigger: str
    text: str

    model_config = {"from_attributes": True}


class MsgUpdate(BaseModel):
    text: str


@router.get("", response_model=list[MsgOut])
async def list_msgs(_: CurrentAdmin, session: Annotated[AsyncSession, Depends(get_session)]) -> list[BotMessage]:
    return list(await session.scalars(select(BotMessage).order_by(BotMessage.code)))


@router.patch("/{code}", response_model=MsgOut)
async def update_msg(
    code: str, payload: MsgUpdate, _: CurrentAdmin, session: Annotated[AsyncSession, Depends(get_session)]
) -> BotMessage:
    row = await session.scalar(select(BotMessage).where(BotMessage.code == code))
    if not row:
        raise HTTPException(404, "not_found")
    row.text = payload.text
    await session.commit()
    await session.refresh(row)
    return row
