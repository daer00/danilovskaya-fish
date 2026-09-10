"""Каталог товаров для бота / миниаппа — только из открытой партии, продажная цена."""

from __future__ import annotations

from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.models.batch_product import BatchProduct
from app.models.product import Product
from app.services.orders import active_batch

router = APIRouter()


class ProductOut(BaseModel):
    id: int
    name: str
    price: Decimal
    description: str | None
    photo_url: str | None
    allow_halves: bool
    unit: str = "pcs"


@router.get("", response_model=list[ProductOut])
async def list_products(session: Annotated[AsyncSession, Depends(get_session)]) -> list[ProductOut]:
    batch = await active_batch(session)
    if not batch:
        return []
    rows = await session.execute(
        select(BatchProduct, Product)
        .join(Product, Product.id == BatchProduct.product_id)
        .where(
            BatchProduct.batch_id == batch.id,
            BatchProduct.enabled.is_(True),
            Product.is_active.is_(True),
        )
        .order_by(Product.sort_order, Product.id)
    )
    out: list[ProductOut] = []
    for bp, p in rows.all():
        out.append(
            ProductOut(
                id=p.id,
                name=p.name,
                price=bp.sale_price,
                description=p.description,
                photo_url=p.photo_url,
                allow_halves=p.allow_halves if p.unit != "kg" else True,
                unit=p.unit or "pcs",
            )
        )
    return out
