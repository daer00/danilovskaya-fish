"""Промокоды: расчёт скидки."""

from __future__ import annotations

from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.promo_code import PromoCode


def normalize_code(raw: str) -> str:
    return (raw or "").strip().upper().replace(" ", "")


def calc_discount(promo: PromoCode, subtotal: Decimal) -> Decimal:
    if subtotal <= 0:
        return Decimal("0.00")
    if promo.discount_type == "percent":
        d = (subtotal * promo.discount_value / Decimal("100")).quantize(Decimal("0.01"))
    else:
        d = Decimal(promo.discount_value).quantize(Decimal("0.01"))
    if d < 0:
        d = Decimal("0.00")
    return min(d, subtotal)


async def get_active_promo(session: AsyncSession, code: str) -> PromoCode:
    raw = normalize_code(code)
    if not raw:
        raise HTTPException(400, "Введите промокод")
    promo = await session.scalar(select(PromoCode).where(func.upper(PromoCode.code) == raw))
    if not promo or not promo.is_active:
        raise HTTPException(400, "Промокод не найден или неактивен")
    if promo.max_uses is not None and promo.used_count >= promo.max_uses:
        raise HTTPException(400, "Промокод уже исчерпан")
    if promo.discount_value <= 0:
        raise HTTPException(400, "Промокод настроен неверно")
    return promo


async def apply_promo(
    session: AsyncSession, code: str | None, subtotal: Decimal
) -> tuple[PromoCode | None, Decimal, Decimal]:
    """Вернуть (promo, discount, total). Без кода — скидка 0."""
    if not (code or "").strip():
        return None, Decimal("0.00"), subtotal.quantize(Decimal("0.01"))
    promo = await get_active_promo(session, code or "")
    discount = calc_discount(promo, subtotal)
    total = (subtotal - discount).quantize(Decimal("0.01"))
    return promo, discount, total
