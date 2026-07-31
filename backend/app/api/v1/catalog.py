"""Каталог товаров для бота."""

from __future__ import annotations

from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.models.product import Product

router = APIRouter()


class ProductOut(BaseModel):
    id: int
    name: str
    price: Decimal
    description: str | None
    photo_url: str | None
    allow_halves: bool

    model_config = {"from_attributes": True}


@router.get("", response_model=list[ProductOut])
async def list_products(session: Annotated[AsyncSession, Depends(get_session)]) -> list[Product]:
    rows = await session.scalars(
        select(Product).where(Product.is_active.is_(True)).order_by(Product.sort_order, Product.id)
    )
    return list(rows)
