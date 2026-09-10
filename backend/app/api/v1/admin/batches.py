"""Админ: партии."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.v1.admin.deps import CurrentAdmin
from app.core.database import get_session
from app.enums import STATUS_LABELS, OrderStatus
from app.models.batch import Batch
from app.models.batch_product import BatchProduct
from app.models.expense import Expense
from app.models.order import Order
from app.models.product import Product
from app.services.finance import batch_expenses, batch_purchase_cost, batch_revenue

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


@router.delete("/{batch_id}")
async def delete_batch(
    batch_id: int, _: CurrentAdmin, session: Annotated[AsyncSession, Depends(get_session)]
) -> dict[str, str]:
    row = await session.get(Batch, batch_id)
    if not row:
        raise HTTPException(404, "not_found")
    orders = list(await session.scalars(select(Order).where(Order.batch_id == batch_id)))
    for o in orders:
        await session.delete(o)
    await session.execute(delete(BatchProduct).where(BatchProduct.batch_id == batch_id))
    await session.execute(delete(Expense).where(Expense.batch_id == batch_id))
    await session.delete(row)
    await session.commit()
    return {"status": "ok"}


class BatchProductLine(BaseModel):
    product_id: int
    name: str
    allow_halves: bool
    unit: str = "pcs"
    weight_kg: Decimal | None = None
    enabled: bool
    sale_price: Decimal
    purchase_price: Decimal
    photo_url: str | None = None


class BatchProductPutItem(BaseModel):
    product_id: int
    enabled: bool
    sale_price: Decimal
    purchase_price: Decimal


class BatchProductsPut(BaseModel):
    items: list[BatchProductPutItem] = Field(min_length=1)


class BatchProductCreate(BaseModel):
    name: str
    sale_price: Decimal
    purchase_price: Decimal
    unit: str = "pcs"
    allow_halves: bool = True
    weight_kg: Decimal | None = None
    description: str | None = None


def _suggest_purchase(p: Product) -> Decimal:
    if p.purchase_price is not None and p.purchase_price >= 0:
        return Decimal(p.purchase_price).quantize(Decimal("0.01"))
    if (p.unit or "pcs") == "kg" and p.purchase_price_per_kg:
        return Decimal(p.purchase_price_per_kg).quantize(Decimal("0.01"))
    if p.weight_kg and p.purchase_price_per_kg:
        return (p.weight_kg * p.purchase_price_per_kg).quantize(Decimal("0.01"))
    return (p.price * Decimal("0.6")).quantize(Decimal("0.01"))


async def _batch_product_lines(
    session: AsyncSession, batch_id: int, *, enabled_only: bool = False
) -> list[BatchProductLine]:
    products = list(
        await session.scalars(
            select(Product).where(Product.is_active.is_(True)).order_by(Product.sort_order, Product.id)
        )
    )
    existing = {
        bp.product_id: bp
        for bp in await session.scalars(select(BatchProduct).where(BatchProduct.batch_id == batch_id))
    }
    out: list[BatchProductLine] = []
    for p in products:
        bp = existing.get(p.id)
        enabled = bool(bp.enabled) if bp else False
        if enabled_only and not enabled:
            continue
        out.append(
            BatchProductLine(
                product_id=p.id,
                name=p.name,
                allow_halves=p.allow_halves,
                unit=p.unit or "pcs",
                weight_kg=p.weight_kg,
                enabled=enabled,
                sale_price=bp.sale_price if bp else p.price,
                purchase_price=bp.purchase_price if bp else _suggest_purchase(p),
                photo_url=p.photo_url,
            )
        )
    return out


@router.get("/{batch_id}/products", response_model=list[BatchProductLine])
async def list_batch_products(
    batch_id: int,
    _: CurrentAdmin,
    session: Annotated[AsyncSession, Depends(get_session)],
    enabled_only: bool = False,
) -> list[BatchProductLine]:
    batch = await session.get(Batch, batch_id)
    if not batch:
        raise HTTPException(404, "not_found")
    return await _batch_product_lines(session, batch_id, enabled_only=enabled_only)


@router.put("/{batch_id}/products", response_model=list[BatchProductLine])
async def save_batch_products(
    batch_id: int,
    payload: BatchProductsPut,
    _: CurrentAdmin,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[BatchProductLine]:
    batch = await session.get(Batch, batch_id)
    if not batch:
        raise HTTPException(404, "not_found")
    existing = {
        bp.product_id: bp
        for bp in await session.scalars(select(BatchProduct).where(BatchProduct.batch_id == batch_id))
    }
    for item in payload.items:
        product = await session.get(Product, item.product_id)
        if not product:
            raise HTTPException(400, f"product {item.product_id}")
        if item.sale_price < 0 or item.purchase_price < 0:
            raise HTTPException(400, "Цена не может быть отрицательной")
        bp = existing.get(item.product_id)
        if bp:
            bp.enabled = item.enabled
            bp.sale_price = item.sale_price
            bp.purchase_price = item.purchase_price
        else:
            session.add(
                BatchProduct(
                    batch_id=batch_id,
                    product_id=item.product_id,
                    enabled=item.enabled,
                    sale_price=item.sale_price,
                    purchase_price=item.purchase_price,
                )
            )
        if item.enabled:
            product.price = item.sale_price
    await session.commit()
    return await _batch_product_lines(session, batch_id)


@router.post("/{batch_id}/products", response_model=BatchProductLine)
async def add_product_to_batch(
    batch_id: int,
    payload: BatchProductCreate,
    _: CurrentAdmin,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> BatchProductLine:
    batch = await session.get(Batch, batch_id)
    if not batch:
        raise HTTPException(404, "not_found")
    name = payload.name.strip()
    if not name:
        raise HTTPException(400, "Название обязательно")
    if payload.sale_price <= 0 or payload.purchase_price < 0:
        raise HTTPException(400, "Проверьте цены")
    unit = payload.unit if payload.unit in ("pcs", "kg") else "pcs"
    product = Product(
        name=name,
        price=payload.sale_price,
        purchase_price=payload.purchase_price if payload.purchase_price > 0 else None,
        weight_kg=payload.weight_kg if unit == "pcs" else None,
        purchase_price_per_kg=(
            (payload.purchase_price / payload.weight_kg).quantize(Decimal("0.01"))
            if unit == "pcs" and payload.weight_kg and payload.weight_kg > 0
            else (payload.purchase_price if unit == "kg" and payload.purchase_price > 0 else None)
        ),
        description=payload.description,
        unit=unit,
        allow_halves=True if unit == "kg" else payload.allow_halves,
        is_active=True,
        sort_order=0,
    )
    session.add(product)
    await session.flush()
    session.add(
        BatchProduct(
            batch_id=batch_id,
            product_id=product.id,
            enabled=True,
            sale_price=payload.sale_price,
            purchase_price=payload.purchase_price,
        )
    )
    await session.commit()
    return BatchProductLine(
        product_id=product.id,
        name=product.name,
        allow_halves=product.allow_halves,
        unit=product.unit,
        weight_kg=product.weight_kg,
        enabled=True,
        sale_price=payload.sale_price,
        purchase_price=payload.purchase_price,
        photo_url=None,
    )


@router.get("/{batch_id}/pickup-summary")
async def pickup_summary(
    batch_id: int, _: CurrentAdmin, session: Annotated[AsyncSession, Depends(get_session)]
) -> dict:
    """Сводка по собраниям для планирования выдачи."""
    from app.enums import PICKUP_LABELS

    batch = await session.get(Batch, batch_id)
    if not batch:
        raise HTTPException(404, "not_found")
    orders = list(
        await session.scalars(
            select(Order)
            .where(Order.batch_id == batch_id, Order.status != OrderStatus.CANCELLED)
            .order_by(Order.number)
        )
    )
    first = [o for o in orders if o.pickup_slot == "first"]
    second = [o for o in orders if o.pickup_slot == "second"]
    unknown = [o for o in orders if o.pickup_slot not in ("first", "second")]

    def pack(rows: list[Order]) -> list[dict]:
        return [
            {
                "id": o.id,
                "number": o.number,
                "full_name": o.full_name,
                "phone": o.phone,
                "total": o.total,
                "status": o.status,
                "pickup_label": PICKUP_LABELS.get(o.pickup_slot or "", "не указано"),
            }
            for o in rows
        ]

    return {
        "batch_id": batch_id,
        "title": batch.title,
        "pickup_date": batch.pickup_date.isoformat(),
        "first_count": len(first),
        "second_count": len(second),
        "unknown_count": len(unknown),
        "first": pack(first),
        "second": pack(second),
        "unknown": pack(unknown),
    }


class BatchOrderLine(BaseModel):
    product_name: str
    quantity: Decimal
    line_total: Decimal


class BatchOrderOut(BaseModel):
    id: int
    number: int
    full_name: str
    phone: str
    status: str
    status_label: str
    total: Decimal
    items: list[BatchOrderLine]


class BatchDetailOut(BatchOut):
    order_count: int
    revenue: Decimal
    purchase_cost: Decimal
    expenses: Decimal
    margin: Decimal
    margin_pct: Decimal | None
    orders: list[BatchOrderOut]


@router.get("/{batch_id}/detail", response_model=BatchDetailOut)
async def batch_detail(
    batch_id: int, _: CurrentAdmin, session: Annotated[AsyncSession, Depends(get_session)]
) -> BatchDetailOut:
    row = await session.get(Batch, batch_id)
    if not row:
        raise HTTPException(404, "not_found")
    orders = list(
        await session.scalars(
            select(Order).options(selectinload(Order.items)).where(Order.batch_id == batch_id).order_by(Order.number)
        )
    )
    active = [o for o in orders if o.status != OrderStatus.CANCELLED]
    revenue = await batch_revenue(session, batch_id)
    purchase = await batch_purchase_cost(session, batch_id)
    expenses = await batch_expenses(session, batch_id)
    margin = (revenue - purchase - expenses).quantize(Decimal("0.01"))
    margin_pct = (margin / revenue * 100).quantize(Decimal("0.1")) if revenue > 0 else None
    return BatchDetailOut(
        id=row.id,
        title=row.title,
        deadline=row.deadline,
        pickup_date=row.pickup_date,
        pickup_place=row.pickup_place,
        is_open=row.is_open,
        notes=row.notes,
        order_count=len(active),
        revenue=revenue,
        purchase_cost=purchase,
        expenses=expenses,
        margin=margin,
        margin_pct=margin_pct,
        orders=[
            BatchOrderOut(
                id=o.id,
                number=o.number,
                full_name=o.full_name,
                phone=o.phone,
                status=o.status,
                status_label=STATUS_LABELS.get(o.status, o.status),
                total=o.total,
                items=[
                    BatchOrderLine(product_name=i.product_name, quantity=i.quantity, line_total=i.line_total)
                    for i in o.items
                ],
            )
            for o in active
        ],
    )
