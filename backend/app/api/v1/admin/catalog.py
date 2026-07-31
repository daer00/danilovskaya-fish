"""Админ: каталог."""

from __future__ import annotations

from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.admin.deps import CurrentAdmin
from app.core.database import get_session
from app.models.product import Product

router = APIRouter()


class ProductIn(BaseModel):
    name: str
    price: Decimal
    description: str | None = None
    photo_url: str | None = None
    allow_halves: bool = True
    is_active: bool = True
    sort_order: int = 0


class ProductOut(ProductIn):
    id: int

    model_config = {"from_attributes": True}


@router.get("", response_model=list[ProductOut])
async def list_products(_: CurrentAdmin, session: Annotated[AsyncSession, Depends(get_session)]) -> list[Product]:
    return list(await session.scalars(select(Product).order_by(Product.sort_order, Product.id)))


@router.post("", response_model=ProductOut)
async def create_product(
    payload: ProductIn, _: CurrentAdmin, session: Annotated[AsyncSession, Depends(get_session)]
) -> Product:
    row = Product(**payload.model_dump())
    session.add(row)
    await session.commit()
    await session.refresh(row)
    return row


@router.patch("/{product_id}", response_model=ProductOut)
async def update_product(
    product_id: int,
    payload: ProductIn,
    _: CurrentAdmin,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> Product:
    row = await session.get(Product, product_id)
    if not row:
        raise HTTPException(404, "not_found")
    for k, v in payload.model_dump().items():
        setattr(row, k, v)
    await session.commit()
    await session.refresh(row)
    return row


@router.delete("/{product_id}")
async def delete_product(
    product_id: int, _: CurrentAdmin, session: Annotated[AsyncSession, Depends(get_session)]
) -> dict[str, str]:
    row = await session.get(Product, product_id)
    if not row:
        raise HTTPException(404, "not_found")
    row.is_active = False
    await session.commit()
    return {"status": "ok"}
