"""Админ: каталог."""

from __future__ import annotations

import uuid
from decimal import Decimal
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.admin.deps import CurrentAdmin
from app.core.config import settings
from app.core.database import get_session
from app.models.batch_product import BatchProduct
from app.models.product import Product

router = APIRouter()

_ALLOWED = {".jpg", ".jpeg", ".png", ".webp", ".gif"}


class ProductIn(BaseModel):
    name: str
    price: Decimal
    purchase_price: Decimal | None = None
    weight_kg: Decimal | None = None
    purchase_price_per_kg: Decimal | None = None
    description: str | None = None
    photo_url: str | None = None
    unit: str = "pcs"
    allow_halves: bool = True
    is_active: bool = True
    sort_order: int = 0


class ProductOut(ProductIn):
    id: int

    model_config = {"from_attributes": True}


def _normalize_unit(payload: ProductIn) -> dict:
    data = payload.model_dump()
    unit = data.get("unit") or "pcs"
    if unit not in ("pcs", "kg"):
        unit = "pcs"
    data["unit"] = unit
    if unit == "kg":
        data["allow_halves"] = True
    purchase = data.get("purchase_price")
    weight = data.get("weight_kg")
    if purchase is not None and purchase < 0:
        purchase = None
        data["purchase_price"] = None
    # Синхронизируем ₽/кг для финансов, если есть вес или товар в кг
    if purchase is not None:
        if unit == "kg":
            data["purchase_price_per_kg"] = purchase
        elif weight and weight > 0:
            data["purchase_price_per_kg"] = (Decimal(purchase) / Decimal(weight)).quantize(Decimal("0.01"))
    return data


@router.get("", response_model=list[ProductOut])
async def list_products(_: CurrentAdmin, session: Annotated[AsyncSession, Depends(get_session)]) -> list[Product]:
    return list(await session.scalars(select(Product).order_by(Product.sort_order, Product.id)))


@router.post("/upload")
async def upload_photo(_: CurrentAdmin, file: UploadFile = File(...)) -> dict[str, str]:
    ext = Path(file.filename or "photo.jpg").suffix.lower() or ".jpg"
    if ext not in _ALLOWED:
        raise HTTPException(400, "Допустимы jpg, png, webp, gif")
    name = f"{uuid.uuid4().hex}{ext}"
    dest = Path(settings.media_root) / name
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(await file.read())
    return {"url": f"/media/{name}"}


@router.post("", response_model=ProductOut)
async def create_product(
    payload: ProductIn, _: CurrentAdmin, session: Annotated[AsyncSession, Depends(get_session)]
) -> Product:
    row = Product(**_normalize_unit(payload))
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
    for k, v in _normalize_unit(payload).items():
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
    for bp in await session.scalars(select(BatchProduct).where(BatchProduct.product_id == product_id)):
        bp.enabled = False
    await session.commit()
    return {"status": "ok"}
