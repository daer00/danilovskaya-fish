"""Промокоды: расчёт скидки и учёт использований."""

from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.enums import OrderStatus
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


async def get_active_promo(session: AsyncSession, code: str, *, for_update: bool = False) -> PromoCode:
    raw = normalize_code(code)
    if not raw:
        raise HTTPException(400, "Введите промокод")
    q = select(PromoCode).where(func.upper(PromoCode.code) == raw)
    if for_update:
        q = q.with_for_update()
    promo = await session.scalar(q)
    if not promo or not promo.is_active:
        raise HTTPException(400, "Промокод не найден или неактивен")
    if promo.max_uses is not None and promo.used_count >= promo.max_uses:
        raise HTTPException(400, "Промокод уже исчерпан")
    if promo.discount_value <= 0:
        raise HTTPException(400, "Промокод настроен неверно")
    now = datetime.now(UTC)
    vf = promo.valid_from
    vu = promo.valid_until
    if vf and vf.tzinfo is None:
        vf = vf.replace(tzinfo=UTC)
    if vu and vu.tzinfo is None:
        vu = vu.replace(tzinfo=UTC)
    if vf and now < vf:
        raise HTTPException(400, "Промокод ещё не действует")
    if vu and now > vu:
        raise HTTPException(400, "Срок действия промокода истёк")
    return promo


async def apply_promo(
    session: AsyncSession, code: str | None, subtotal: Decimal, *, for_update: bool = False
) -> tuple[PromoCode | None, Decimal, Decimal]:
    """Вернуть (promo, discount, total). Без кода — скидка 0."""
    if not (code or "").strip():
        return None, Decimal("0.00"), subtotal.quantize(Decimal("0.01"))
    promo = await get_active_promo(session, code or "", for_update=for_update)
    discount = calc_discount(promo, subtotal)
    total = (subtotal - discount).quantize(Decimal("0.01"))
    return promo, discount, total


async def consume_promo(session: AsyncSession, promo: PromoCode | None) -> None:
    """Списать одно использование (только при подтверждении заказа)."""
    if not promo:
        return
    locked = await get_active_promo(session, promo.code, for_update=True)
    locked.used_count = int(locked.used_count or 0) + 1


async def bump_promo_use(session: AsyncSession, code: str | None) -> None:
    """Списать использование по уже привязанному коду (без проверки срока — заказ уже с ним)."""
    raw = normalize_code(code or "")
    if not raw:
        return
    promo = await session.scalar(
        select(PromoCode).where(func.upper(PromoCode.code) == raw).with_for_update()
    )
    if not promo:
        raise HTTPException(400, "Промокод не найден")
    if promo.max_uses is not None and int(promo.used_count or 0) >= promo.max_uses:
        raise HTTPException(400, "Промокод уже исчерпан")
    promo.used_count = int(promo.used_count or 0) + 1


async def release_promo(session: AsyncSession, code: str | None) -> None:
    """Вернуть использование при отмене подтверждённого заказа."""
    raw = normalize_code(code or "")
    if not raw:
        return
    await session.execute(
        update(PromoCode)
        .where(func.upper(PromoCode.code) == raw, PromoCode.used_count > 0)
        .values(used_count=PromoCode.used_count - 1)
    )


def promo_was_consumed(status: str) -> bool:
    """Счётчик крутится с момента NEW и дальше (не на черновике PROCESSING)."""
    return status not in (OrderStatus.PROCESSING, OrderStatus.CANCELLED)


async def sync_promo_on_status_change(
    session: AsyncSession, code: str | None, prev_status: str, next_status: str
) -> None:
    """Синхронизировать used_count при любой смене статуса."""
    was = promo_was_consumed(prev_status)
    now = promo_was_consumed(next_status)
    if was == now:
        return
    if was and not now:
        await release_promo(session, code)
        return
    if not (code or "").strip():
        raise HTTPException(400, "Укажите промокод — без него заказ не оформить")
    await bump_promo_use(session, code)
