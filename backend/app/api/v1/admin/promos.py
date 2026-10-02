"""Админ: промокоды."""

from __future__ import annotations

from decimal import Decimal
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.admin.deps import CurrentAdmin
from app.core.database import get_session
from app.models.promo_code import PromoCode
from app.services.promos import normalize_code

router = APIRouter()

DiscountType = Literal["percent", "fixed"]


class PromoIn(BaseModel):
    code: str = Field(min_length=1, max_length=64)
    title: str | None = None
    discount_type: DiscountType = "percent"
    discount_value: Decimal
    is_active: bool = True
    max_uses: int | None = None
    notes: str | None = None


class PromoOut(PromoIn):
    id: int
    used_count: int

    model_config = {"from_attributes": True}


def _validate(payload: PromoIn) -> dict:
    code = normalize_code(payload.code)
    if not code:
        raise HTTPException(400, "Укажите код")
    if payload.discount_value <= 0:
        raise HTTPException(400, "Скидка должна быть больше 0")
    if payload.discount_type == "percent" and payload.discount_value > 100:
        raise HTTPException(400, "Процент не больше 100")
    if payload.max_uses is not None and payload.max_uses < 0:
        raise HTTPException(400, "Лимит использований некорректный")
    data = payload.model_dump()
    data["code"] = code
    data["title"] = (payload.title or "").strip() or None
    data["notes"] = (payload.notes or "").strip() or None
    return data


@router.get("", response_model=list[PromoOut])
async def list_promos(_: CurrentAdmin, session: Annotated[AsyncSession, Depends(get_session)]) -> list[PromoCode]:
    return list(await session.scalars(select(PromoCode).order_by(PromoCode.id.desc())))


@router.post("", response_model=PromoOut)
async def create_promo(
    payload: PromoIn, _: CurrentAdmin, session: Annotated[AsyncSession, Depends(get_session)]
) -> PromoCode:
    data = _validate(payload)
    if await session.scalar(select(PromoCode.id).where(PromoCode.code == data["code"])):
        raise HTTPException(400, "Такой промокод уже есть")
    row = PromoCode(**data)
    session.add(row)
    await session.commit()
    await session.refresh(row)
    return row


@router.patch("/{promo_id}", response_model=PromoOut)
async def update_promo(
    promo_id: int,
    payload: PromoIn,
    _: CurrentAdmin,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> PromoCode:
    row = await session.get(PromoCode, promo_id)
    if not row:
        raise HTTPException(404, "not_found")
    data = _validate(payload)
    other = await session.scalar(
        select(PromoCode.id).where(PromoCode.code == data["code"], PromoCode.id != promo_id)
    )
    if other:
        raise HTTPException(400, "Такой промокод уже есть")
    for k, v in data.items():
        setattr(row, k, v)
    await session.commit()
    await session.refresh(row)
    return row


@router.delete("/{promo_id}")
async def delete_promo(
    promo_id: int, _: CurrentAdmin, session: Annotated[AsyncSession, Depends(get_session)]
) -> dict[str, str]:
    row = await session.get(PromoCode, promo_id)
    if not row:
        raise HTTPException(404, "not_found")
    await session.delete(row)
    await session.commit()
    return {"status": "ok"}
