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
from app.enums import PICKUP_LABELS, STATUS_LABELS, OrderStatus, PickupSlot
from app.models.batch import Batch
from app.models.batch_product import BatchProduct
from app.models.client import Client
from app.models.order import Order, OrderItem
from app.models.product import Product
from app.services.orders import compose_items, load_order, next_order_number, notify_order_ready, notify_order_status

router = APIRouter()

# В админке можно поставить любой статус (корректировка), не только «вперёд».
ALL_STATUSES = set(OrderStatus)


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
    pickup_slot: str | None = None
    pickup_label: str | None = None
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


class CartLineIn(BaseModel):
    product_id: int
    quantity: Decimal


class AdminOrderCreate(BaseModel):
    client_id: int
    batch_id: int
    comment: str | None = None
    pickup_slot: PickupSlot = PickupSlot.FIRST
    items: list[CartLineIn] = Field(min_length=1)
    status: OrderStatus = OrderStatus.CONFIRMED


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
        pickup_slot=o.pickup_slot,
        pickup_label=PICKUP_LABELS.get(o.pickup_slot or "", None),
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
    product: str | None = None,
    q: str | None = None,
) -> list[OrderOut]:
    from sqlalchemy import or_

    query = select(Order).options(selectinload(Order.items)).order_by(Order.id.desc())
    if batch_id:
        query = query.where(Order.batch_id == batch_id)
    if q:
        like = f"%{q.strip()}%"
        query = query.where(or_(Order.full_name.ilike(like), Order.phone.ilike(like)))
    rows = list(await session.scalars(query))
    if product:
        needle = product.strip().lower()
        rows = [o for o in rows if any(needle in i.product_name.lower() for i in o.items)]
    return [_out(o) for o in rows]


@router.post("", response_model=OrderOut)
async def create_order(
    payload: AdminOrderCreate,
    _: CurrentAdmin,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> OrderOut:
    """Ручной заказ из админки: клиент + партия + позиции."""
    client = await session.get(Client, payload.client_id)
    if not client:
        raise HTTPException(404, "client_not_found")
    batch = await session.get(Batch, payload.batch_id)
    if not batch:
        raise HTTPException(404, "batch_not_found")

    items: list[OrderItem] = []
    total = Decimal("0")
    for row in payload.items:
        product = await session.get(Product, row.product_id)
        if not product or not product.is_active:
            raise HTTPException(400, f"Товар недоступен: {row.product_id}")
        bp = await session.scalar(
            select(BatchProduct).where(
                BatchProduct.batch_id == batch.id,
                BatchProduct.product_id == product.id,
                BatchProduct.enabled.is_(True),
            )
        )
        if not bp:
            raise HTTPException(400, f"Товар «{product.name}» не включён в эту партию")
        qty = Decimal(row.quantity)
        if qty <= 0:
            raise HTTPException(400, "Количество должно быть больше 0")
        if product.unit == "kg" or product.allow_halves:
            if (qty * 2) != (qty * 2).to_integral_value():
                raise HTTPException(400, f"Для «{product.name}» шаг 0,5")
        elif qty != qty.to_integral_value():
            raise HTTPException(400, f"«{product.name}» — только целыми")
        line = (bp.sale_price * qty).quantize(Decimal("0.01"))
        total += line
        items.append(
            OrderItem(
                product_id=product.id,
                product_name=product.name,
                unit_price=bp.sale_price,
                quantity=qty,
                line_total=line,
            )
        )

    name = (client.full_name or "").strip() or "Без имени"
    phone = (client.phone or "").strip() or "—"
    order = Order(
        number=await next_order_number(session, batch.id),
        batch_id=batch.id,
        client_id=client.id,
        status=payload.status if payload.status in ALL_STATUSES else OrderStatus.CONFIRMED,
        full_name=name,
        phone=phone,
        comment=payload.comment,
        pickup_slot=payload.pickup_slot,
        total=total,
        items=items,
    )
    session.add(order)
    await session.commit()
    order = await load_order(session, order.id)
    assert order
    return _out(order)


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
    if payload.status not in ALL_STATUSES:
        raise HTTPException(400, f"Неизвестный статус: {payload.status}")
    order.status = payload.status
    if payload.status == OrderStatus.CANCELLED:
        order.cancel_reason = payload.cancel_reason
    elif order.cancel_reason:
        order.cancel_reason = None
    client = await session.get(Client, order.client_id)
    if client:
        await notify_order_status(session, order, client)
    await session.commit()
    order = await load_order(session, order_id)
    assert order
    return _out(order)


@router.post("/{order_id}/notify", response_model=OrderOut)
async def notify_client(
    order_id: int, _: CurrentAdmin, session: Annotated[AsyncSession, Depends(get_session)]
) -> OrderOut:
    """Отправить клиенту в Telegram: «заказ готов»."""
    order = await load_order(session, order_id)
    if not order:
        raise HTTPException(404, "not_found")
    client = await session.get(Client, order.client_id)
    if not client:
        raise HTTPException(400, "no_client")
    if client.telegram_id.startswith("manual-"):
        raise HTTPException(400, "У клиента нет Telegram — уведомление недоступно")
    await notify_order_ready(session, order, client)
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
