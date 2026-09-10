"""Расчёт закупки и P&L."""

from __future__ import annotations

from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.enums import OrderStatus
from app.models.batch_product import BatchProduct
from app.models.expense import Expense
from app.models.order import Order, OrderItem
from app.models.product import Product


def item_purchase_kg(item: OrderItem, products: dict[int, Product]) -> Decimal:
    if item.actual_weight_kg is not None:
        return item.actual_weight_kg
    p = products.get(item.product_id)
    if p and (p.unit or "pcs") == "kg":
        return Decimal(item.quantity)
    if p and p.weight_kg:
        return (item.quantity * p.weight_kg).quantize(Decimal("0.001"))
    return Decimal("0")


def item_purchase_cost(
    item: OrderItem,
    products: dict[int, Product],
    batch_prices: dict[int, BatchProduct],
) -> Decimal:
    bp = batch_prices.get(item.product_id)
    if bp:
        return (bp.purchase_price * item.quantity).quantize(Decimal("0.01"))
    p = products.get(item.product_id)
    if not p or not p.purchase_price_per_kg:
        return Decimal("0")
    kg = item_purchase_kg(item, products)
    return (kg * p.purchase_price_per_kg).quantize(Decimal("0.01"))


async def batch_purchase_cost(session: AsyncSession, batch_id: int) -> Decimal:
    products = {p.id: p for p in await session.scalars(select(Product))}
    batch_prices = {
        bp.product_id: bp
        for bp in await session.scalars(select(BatchProduct).where(BatchProduct.batch_id == batch_id))
    }
    items = await session.scalars(
        select(OrderItem)
        .join(Order)
        .where(Order.batch_id == batch_id, Order.status != OrderStatus.CANCELLED)
    )
    return sum((item_purchase_cost(i, products, batch_prices) for i in items), Decimal("0")).quantize(
        Decimal("0.01")
    )


async def batch_revenue(session: AsyncSession, batch_id: int) -> Decimal:
    total = await session.scalar(
        select(func.coalesce(func.sum(Order.total), 0)).where(
            Order.batch_id == batch_id, Order.status != OrderStatus.CANCELLED
        )
    )
    return Decimal(total or 0).quantize(Decimal("0.01"))


async def batch_expenses(session: AsyncSession, batch_id: int) -> Decimal:
    total = await session.scalar(
        select(func.coalesce(func.sum(Expense.amount), 0)).where(Expense.batch_id == batch_id)
    )
    return Decimal(total or 0).quantize(Decimal("0.01"))


async def month_revenue(session: AsyncSession, start, end) -> Decimal:
    total = await session.scalar(
        select(func.coalesce(func.sum(Order.total), 0)).where(
            Order.status != OrderStatus.CANCELLED,
            Order.created_at >= start,
            Order.created_at < end,
        )
    )
    return Decimal(total or 0).quantize(Decimal("0.01"))


async def month_expenses(session: AsyncSession, start, end) -> Decimal:
    total = await session.scalar(
        select(func.coalesce(func.sum(Expense.amount), 0)).where(
            Expense.spent_at >= start.date(),
            Expense.spent_at < end.date(),
        )
    )
    return Decimal(total or 0).quantize(Decimal("0.01"))
