"""Админ: партии."""

from __future__ import annotations

from datetime import date, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.admin.deps import CurrentAdmin
from app.core.database import get_session
from app.models.batch import Batch

router = APIRouter()


class BatchIn(BaseModel):
    title: str
    deadline: datetime
    pickup_date: date
    pickup_place: str = "холл"
    is_open: bool = True
    notes: str | None = None


class BatchOut(BatchIn):
    id: int

    model_config = {"from_attributes": True}


@router.get("", response_model=list[BatchOut])
async def list_batches(_: CurrentAdmin, session: Annotated[AsyncSession, Depends(get_session)]) -> list[Batch]:
    return list(await session.scalars(select(Batch).order_by(Batch.deadline.desc())))


@router.post("", response_model=BatchOut)
async def create_batch(
    payload: BatchIn, _: CurrentAdmin, session: Annotated[AsyncSession, Depends(get_session)]
) -> Batch:
    if payload.is_open:
        for b in await session.scalars(select(Batch).where(Batch.is_open.is_(True))):
            b.is_open = False
    row = Batch(**payload.model_dump())
    session.add(row)
    await session.commit()
    await session.refresh(row)
    return row


@router.patch("/{batch_id}", response_model=BatchOut)
async def update_batch(
    batch_id: int,
    payload: BatchIn,
    _: CurrentAdmin,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> Batch:
    row = await session.get(Batch, batch_id)
    if not row:
        raise HTTPException(404, "not_found")
    if payload.is_open:
        for b in await session.scalars(select(Batch).where(Batch.is_open.is_(True), Batch.id != batch_id)):
            b.is_open = False
    for k, v in payload.model_dump().items():
        setattr(row, k, v)
    await session.commit()
    await session.refresh(row)
    return row
