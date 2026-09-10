"""Админ: ручные доходы и траты."""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.admin.deps import CurrentAdmin
from app.core.database import get_session
from app.models.cash_entry import CashEntry

router = APIRouter()

EntryType = Literal["income", "expense"]


class CashIn(BaseModel):
    entry_type: EntryType
    entry_date: date
    title: str
    amount: Decimal
    category: str = "прочее"


class CashOut(CashIn):
    id: int

    model_config = {"from_attributes": True}


@router.get("", response_model=list[CashOut])
async def list_cash(
    _: CurrentAdmin,
    session: Annotated[AsyncSession, Depends(get_session)],
    entry_type: EntryType | None = None,
    month: str | None = None,
) -> list[CashEntry]:
    q = select(CashEntry).order_by(CashEntry.entry_date.desc(), CashEntry.id.desc())
    if entry_type:
        q = q.where(CashEntry.entry_type == entry_type)
    if month:
        y, m = map(int, month.split("-"))
        start = date(y, m, 1)
        end = date(y + 1, 1, 1) if m == 12 else date(y, m + 1, 1)
        q = q.where(CashEntry.entry_date >= start, CashEntry.entry_date < end)
    return list(await session.scalars(q))


@router.post("", response_model=CashOut)
async def create_cash(
    payload: CashIn, _: CurrentAdmin, session: Annotated[AsyncSession, Depends(get_session)]
) -> CashEntry:
    row = CashEntry(**payload.model_dump())
    session.add(row)
    await session.commit()
    await session.refresh(row)
    return row


@router.patch("/{entry_id}", response_model=CashOut)
async def update_cash(
    entry_id: int,
    payload: CashIn,
    _: CurrentAdmin,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> CashEntry:
    row = await session.get(CashEntry, entry_id)
    if not row:
        raise HTTPException(404, "not_found")
    for k, v in payload.model_dump().items():
        setattr(row, k, v)
    await session.commit()
    await session.refresh(row)
    return row


@router.delete("/{entry_id}")
async def delete_cash(
    entry_id: int, _: CurrentAdmin, session: Annotated[AsyncSession, Depends(get_session)]
) -> dict[str, str]:
    row = await session.get(CashEntry, entry_id)
    if not row:
        raise HTTPException(404, "not_found")
    await session.delete(row)
    await session.commit()
    return {"status": "ok"}
