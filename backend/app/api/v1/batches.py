"""Партии для бота."""

from __future__ import annotations

from datetime import date, datetime
from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.services.orders import active_batch

router = APIRouter()


class BatchOut(BaseModel):
    id: int
    title: str
    deadline: datetime
    pickup_date: date
    pickup_place: str
    is_open: bool

    model_config = {"from_attributes": True}


@router.get("/active", response_model=BatchOut | None)
async def get_active(session: Annotated[AsyncSession, Depends(get_session)]) -> BatchOut | None:
    b = await active_batch(session)
    return BatchOut.model_validate(b) if b else None
