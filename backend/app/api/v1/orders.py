"""Заказы (бот + общие операции)."""

from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal, InvalidOperation
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_session
from app.enums import STATUS_LABELS, OrderStatus
from app.models.client import Client
from app.models.order import Order, OrderItem
from app.models.product import Product
from app.services.orders import (
    active_batch,
    batch_placeholders,
    compose_items,
    fmt_money,
    get_msg,
    next_order_number,
    notify_admins,
    render,
)

router = APIRouter()


class CartItemIn(BaseModel):
    product_id: int
    quantity: Decimal


class OrderCreate(BaseModel):
    telegram_id: str
    full_name: str = Field(min_length=2)
    phone: str
    comment: str | None = None
    items: list[CartItemIn] = Field(min_length=1)


class OrderItemOut(BaseModel):
    product_id: int
    product_name: str
    unit_price: Decimal
    quantity: Decimal
    line_total: Decimal

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
    items: list[OrderItemOut]
    состав: str = ""
    сумма: str = ""

    model_config = {"from_attributes": True}


def _out(o: Order) -> OrderOut:
    items = [OrderItemOut.model_validate(i) for i in o.items]
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
        items=items,
        состав=compose_items(o.items),
        сумма=fmt_money(o.total),
    )


def _validate_qty(product: Product, qty: Decimal) -> Decimal:
    try:
        q = Decimal(qty)
    except InvalidOperation as e:
        raise HTTPException(400, "Неверное количество") from e
    if q <= 0:
        raise HTTPException(400, "Количество должно быть больше 0")
    if product.allow_halves:
        if (q * 2) != (q * 2).to_integral_value():
            raise HTTPException(400, "half_step")
    else:
        if q != q.to_integral_value():
            raise HTTPException(400, "whole_only")
    return q


@router.post("", response_model=OrderOut)
async def create_order(payload: OrderCreate, session: Annotated[AsyncSession, Depends(get_session)]) -> OrderOut:
    batch = await active_batch(session)
    if not batch:
        raise HTTPException(400, "no_batch")
    now = datetime.now(UTC)
    dl = batch.deadline if batch.deadline.tzinfo else batch.deadline.replace(tzinfo=UTC)
    if now > dl:
        raise HTTPException(400, "deadline_passed")

    client = await session.scalar(select(Client).where(Client.telegram_id == payload.telegram_id))
    if not client:
        raise HTTPException(404, "client_not_found")

    items: list[OrderItem] = []
    total = Decimal("0")
    for row in payload.items:
        product = await session.get(Product, row.product_id)
        if not product or not product.is_active:
            raise HTTPException(400, "product_gone")
        qty = _validate_qty(product, row.quantity)
        line = (product.price * qty).quantize(Decimal("0.01"))
        total += line
        items.append(
            OrderItem(
                product_id=product.id,
                product_name=product.name,
                unit_price=product.price,
                quantity=qty,
                line_total=line,
            )
        )

    client.full_name = payload.full_name
    client.phone = payload.phone
    order = Order(
        number=await next_order_number(session, batch.id),
        batch_id=batch.id,
        client_id=client.id,
        status=OrderStatus.NEW,
        full_name=payload.full_name,
        phone=payload.phone,
        comment=payload.comment,
        total=total,
        items=items,
    )
    session.add(order)
    await session.flush()

    ph = {
        "номер": str(order.number),
        "имя": order.full_name,
        "телефон": order.phone,
        "состав": compose_items(items),
        "сумма": fmt_money(total),
        "комментарий": order.comment or "—",
        **batch_placeholders(batch),
    }
    await notify_admins(session, render(await get_msg(session, "admin_new_order"), **ph))
    await session.commit()
    order = await session.scalar(select(Order).where(Order.id == order.id).options(selectinload(Order.items)))
    assert order
    return _out(order)


@router.get("/by-telegram/{telegram_id}", response_model=list[OrderOut])
async def list_by_tg(telegram_id: str, session: Annotated[AsyncSession, Depends(get_session)]) -> list[OrderOut]:
    client = await session.scalar(select(Client).where(Client.telegram_id == telegram_id))
    if not client:
        return []
    batch = await active_batch(session)
    q = select(Order).where(Order.client_id == client.id).options(selectinload(Order.items)).order_by(Order.id.desc())
    if batch:
        q = q.where(Order.batch_id == batch.id)
    rows = await session.scalars(q)
    return [_out(o) for o in rows]


@router.post("/{order_id}/cancel", response_model=OrderOut)
async def cancel_by_client(
    order_id: int,
    telegram_id: str,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> OrderOut:
    order = await session.scalar(select(Order).where(Order.id == order_id).options(selectinload(Order.items)))
    if not order:
        raise HTTPException(404, "not_found")
    client = await session.get(Client, order.client_id)
    if not client or client.telegram_id != telegram_id:
        raise HTTPException(403, "forbidden")

    from app.models.batch import Batch

    batch = await session.get(Batch, order.batch_id)
    assert batch
    now = datetime.now(UTC)
    dl = batch.deadline if batch.deadline.tzinfo else batch.deadline.replace(tzinfo=UTC)
    if now > dl:
        raise HTTPException(400, "deadline_passed")
    if order.status != OrderStatus.NEW:
        raise HTTPException(400, "already_confirmed")

    order.status = OrderStatus.CANCELLED
    ph = {
        "номер": str(order.number),
        "имя": order.full_name,
        "сумма": fmt_money(order.total),
        **batch_placeholders(batch),
    }
    await notify_admins(session, render(await get_msg(session, "admin_client_cancel"), **ph))
    await session.commit()
    await session.refresh(order)
    return _out(order)
