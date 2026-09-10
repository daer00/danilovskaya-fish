"""Админ: расходники."""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.admin.deps import CurrentAdmin
from app.core.database import get_session
from app.models.expense import Expense

router = APIRouter()

CATEGORIES = ("лёд", "упаковка", "транспорт", "прочее")


class ExpenseIn(BaseModel):
    spent_at: date
    category: str
    title: str
    amount: Decimal
    batch_id: int | None = None


class ExpenseOut(ExpenseIn):
    id: int

    model_config = {"from_attributes": True}


@router.get("", response_model=list[ExpenseOut])
async def list_expenses(
    _: CurrentAdmin,
    session: Annotated[AsyncSession, Depends(get_session)],
    batch_id: int | None = None,
    month: str | None = None,
) -> list[Expense]:
    q = select(Expense).order_by(Expense.spent_at.desc(), Expense.id.desc())
    if batch_id:
        q = q.where(Expense.batch_id == batch_id)
    if month:
        y, m = map(int, month.split("-"))
        start = date(y, m, 1)
        end = date(y + 1, 1, 1) if m == 12 else date(y, m + 1, 1)
        q = q.where(Expense.spent_at >= start, Expense.spent_at < end)
    return list(await session.scalars(q))


@router.post("", response_model=ExpenseOut)
async def create_expense(
    payload: ExpenseIn, _: CurrentAdmin, session: Annotated[AsyncSession, Depends(get_session)]
) -> Expense:
    row = Expense(**payload.model_dump())
    session.add(row)
    await session.commit()
    await session.refresh(row)
    return row


@router.patch("/{expense_id}", response_model=ExpenseOut)
async def update_expense(
    expense_id: int,
    payload: ExpenseIn,
    _: CurrentAdmin,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> Expense:
    row = await session.get(Expense, expense_id)
    if not row:
        raise HTTPException(404, "not_found")
    for k, v in payload.model_dump().items():
        setattr(row, k, v)
    await session.commit()
    await session.refresh(row)
    return row


@router.delete("/{expense_id}")
async def delete_expense(
    expense_id: int, _: CurrentAdmin, session: Annotated[AsyncSession, Depends(get_session)]
) -> dict[str, str]:
    row = await session.get(Expense, expense_id)
    if not row:
        raise HTTPException(404, "not_found")
    await session.delete(row)
    await session.commit()
    return {"status": "ok"}
