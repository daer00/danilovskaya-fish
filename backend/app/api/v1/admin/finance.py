"""Админ: месячная сводка для главной."""

from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.admin.deps import CurrentAdmin
from app.core.database import get_session
from app.enums import OrderStatus
from app.models.cash_entry import CashEntry
from app.models.expense import Expense
from app.models.order import Order, OrderItem
from app.services.finance import month_revenue

router = APIRouter()


def _month_bounds(month: str) -> tuple[date, date, datetime, datetime]:
    y, m = map(int, month.split("-"))
    start_d = date(y, m, 1)
    end_d = date(y + 1, 1, 1) if m == 12 else date(y, m + 1, 1)
    start_dt = datetime(y, m, 1, tzinfo=timezone.utc)
    end_dt = datetime(end_d.year, end_d.month, 1, tzinfo=timezone.utc)
    return start_d, end_d, start_dt, end_dt


class ProductLine(BaseModel):
    product_name: str
    quantity: Decimal
    total: Decimal


class MonthOverviewOut(BaseModel):
    month: str
    revenue: Decimal
    manual_income: Decimal
    received: Decimal
    expenses_legacy: Decimal
    manual_expense: Decimal
    spent: Decimal
    orders_count: int
    products: list[ProductLine]


@router.get("/overview", response_model=MonthOverviewOut)
async def month_overview(
    _: CurrentAdmin,
    session: Annotated[AsyncSession, Depends(get_session)],
    month: str | None = None,
) -> MonthOverviewOut:
    if not month:
        today = date.today()
        month = f"{today.year}-{today.month:02d}"
    start_d, end_d, start_dt, end_dt = _month_bounds(month)

    revenue = await month_revenue(session, start_dt, end_dt)

    manual_income = Decimal(
        await session.scalar(
            select(func.coalesce(func.sum(CashEntry.amount), 0)).where(
                CashEntry.entry_type == "income",
                CashEntry.entry_date >= start_d,
                CashEntry.entry_date < end_d,
            )
        )
        or 0
    ).quantize(Decimal("0.01"))

    manual_expense = Decimal(
        await session.scalar(
            select(func.coalesce(func.sum(CashEntry.amount), 0)).where(
                CashEntry.entry_type == "expense",
                CashEntry.entry_date >= start_d,
                CashEntry.entry_date < end_d,
            )
        )
        or 0
    ).quantize(Decimal("0.01"))

    expenses_legacy = Decimal(
        await session.scalar(
            select(func.coalesce(func.sum(Expense.amount), 0)).where(
                Expense.spent_at >= start_d,
                Expense.spent_at < end_d,
            )
        )
        or 0
    ).quantize(Decimal("0.01"))

    orders_count = int(
        await session.scalar(
            select(func.count()).select_from(Order).where(
                Order.status != OrderStatus.CANCELLED,
                Order.created_at >= start_dt,
                Order.created_at < end_dt,
            )
        )
        or 0
    )

    product_rows = await session.execute(
        select(OrderItem.product_name, func.sum(OrderItem.quantity), func.sum(OrderItem.line_total))
        .join(Order)
        .where(
            Order.status != OrderStatus.CANCELLED,
            Order.created_at >= start_dt,
            Order.created_at < end_dt,
        )
        .group_by(OrderItem.product_name)
        .order_by(OrderItem.product_name)
    )

    return MonthOverviewOut(
        month=month,
        revenue=revenue,
        manual_income=manual_income,
        received=(revenue + manual_income).quantize(Decimal("0.01")),
        expenses_legacy=expenses_legacy,
        manual_expense=manual_expense,
        spent=(manual_expense + expenses_legacy).quantize(Decimal("0.01")),
        orders_count=orders_count,
        products=[ProductLine(product_name=n, quantity=q, total=t) for n, q, t in product_rows.all()],
    )
