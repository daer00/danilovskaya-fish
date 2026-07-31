"""Админ: заказы и сводка."""

from __future__ import annotations

from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.v1.admin.deps import CurrentAdmin
from app.core.database import get_session
from app.enums import STATUS_LABELS, OrderStatus
from app.models.client import Client
from app.models.order import Order, OrderItem
from app.services.orders import compose_items, load_order, notify_order_status

router = APIRouter()

ALLOWED = {
    OrderStatus.NEW: {OrderStatus.CONFIRMED, OrderStatus.CANCELLED},
    OrderStatus.CONFIRMED: {OrderStatus.READY, OrderStatus.CANCELLED},
    OrderStatus.READY: {OrderStatus.COMPLETED, OrderStatus.CANCELLED},
    OrderStatus.COMPLETED: set(),
    OrderStatus.CANCELLED: set(),
}


class OrderItemOut(BaseModel):
    id: int
    product_name: str
    quantity: Decimal
    unit_price: Decimal
    line_total: Decimal
    actual_weight_kg: Decimal | None = None

    model_config = {"from_attributes": True}


class OrderOut(BaseModel):
    id: int
    number: int
    batch_id: int
    status: str
    status_label: str
    full_name: str
    phone: str
    comment: str | None
    total: Decimal
    cancel_reason: str | None
    состав: str
    items: list[OrderItemOut] = []

    model_config = {"from_attributes": True}


class StatusIn(BaseModel):
    status: OrderStatus
    cancel_reason: str | None = None


class ItemPatch(BaseModel):
    id: int
    actual_weight_kg: Decimal | None = None
    unit_price: Decimal | None = None
    line_total: Decimal | None = None


class ItemsIn(BaseModel):
    items: list[ItemPatch] = Field(min_length=1)


class SummaryLine(BaseModel):
    product_name: str
    quantity: Decimal
    total: Decimal


def _out(o: Order) -> OrderOut:
    return OrderOut(
        id=o.id,
        number=o.number,
        batch_id=o.batch_id,
        status=o.status,
        status_label=STATUS_LABELS.get(o.status, o.status),
        full_name=o.full_name,
        phone=o.phone,
        comment=o.comment,
        total=o.total,
        cancel_reason=o.cancel_reason,
        состав=compose_items(o.items),
        items=[OrderItemOut.model_validate(i) for i in o.items],
    )


@router.get("", response_model=list[OrderOut])
async def list_orders(
    _: CurrentAdmin,
    session: Annotated[AsyncSession, Depends(get_session)],
    batch_id: int | None = None,
) -> list[OrderOut]:
    q = select(Order).options(selectinload(Order.items)).order_by(Order.id.desc())
    if batch_id:
        q = q.where(Order.batch_id == batch_id)
    return [_out(o) for o in await session.scalars(q)]


@router.patch("/{order_id}/items", response_model=OrderOut)
async def update_items(
    order_id: int,
    payload: ItemsIn,
    _: CurrentAdmin,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> OrderOut:
    """Вес перед выдачей + цена/сумма позиции → пересчёт итога заказа."""
    order = await load_order(session, order_id)
    if not order:
        raise HTTPException(404, "not_found")
    if order.status == OrderStatus.CANCELLED:
        raise HTTPException(400, "cancelled")
    by_id = {i.id: i for i in order.items}
    for patch in payload.items:
        item = by_id.get(patch.id)
        if not item:
            raise HTTPException(400, f"item {patch.id}")
        if patch.actual_weight_kg is not None:
            item.actual_weight_kg = patch.actual_weight_kg
        if patch.unit_price is not None:
            item.unit_price = patch.unit_price
        if patch.line_total is not None:
            item.line_total = patch.line_total
        elif patch.unit_price is not None:
            item.line_total = (item.unit_price * item.quantity).quantize(Decimal("0.01"))
    order.total = sum((i.line_total for i in order.items), Decimal("0")).quantize(Decimal("0.01"))
    await session.commit()
    order = await load_order(session, order_id)
    assert order
    return _out(order)


@router.patch("/{order_id}/status", response_model=OrderOut)
async def set_status(
    order_id: int,
    payload: StatusIn,
    _: CurrentAdmin,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> OrderOut:
    order = await load_order(session, order_id)
    if not order:
        raise HTTPException(404, "not_found")
    allowed = ALLOWED.get(OrderStatus(order.status), set())
    if payload.status not in allowed:
        raise HTTPException(400, f"Нельзя {order.status} → {payload.status}")
    order.status = payload.status
    if payload.status == OrderStatus.CANCELLED:
        order.cancel_reason = payload.cancel_reason
    client = await session.get(Client, order.client_id)
    if client:
        await notify_order_status(session, order, client)
    await session.commit()
    order = await load_order(session, order_id)
    assert order
    return _out(order)


@router.get("/summary/{batch_id}", response_model=list[SummaryLine])
async def purchase_summary(
    batch_id: int, _: CurrentAdmin, session: Annotated[AsyncSession, Depends(get_session)]
) -> list[SummaryLine]:
    rows = await session.execute(
        select(OrderItem.product_name, func.sum(OrderItem.quantity), func.sum(OrderItem.line_total))
        .join(Order)
        .where(Order.batch_id == batch_id, Order.status != OrderStatus.CANCELLED)
        .group_by(OrderItem.product_name)
        .order_by(OrderItem.product_name)
    )
    return [SummaryLine(product_name=n, quantity=q, total=t) for n, q, t in rows.all()]
