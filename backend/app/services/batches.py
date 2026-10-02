"""Партии: открытие следующей раз в 2 недели."""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.batch import Batch
from app.models.batch_product import BatchProduct

_MONTHS = (
    "января",
    "февраля",
    "марта",
    "апреля",
    "мая",
    "июня",
    "июля",
    "августа",
    "сентября",
    "октября",
    "ноября",
    "декабря",
)
CYCLE_DAYS = 14


def batch_title(pickup: date) -> str:
    return f"{pickup.day} {_MONTHS[pickup.month - 1]}"


async def open_successor_batch(session: AsyncSession, source: Batch) -> Batch | None:
    """После закрытия партии открыть следующую (+2 недели) с тем же составом товаров."""
    if await session.scalar(select(Batch.id).where(Batch.is_open.is_(True)).limit(1)):
        return None

    pickup = source.pickup_date + timedelta(days=CYCLE_DAYS)
    deadline = source.deadline + timedelta(days=CYCLE_DAYS)
    if deadline.tzinfo is None:
        deadline = deadline.replace(tzinfo=UTC)

    nxt = Batch(
        title=batch_title(pickup),
        deadline=deadline,
        pickup_date=pickup,
        pickup_place=source.pickup_place or "холл",
        is_open=True,
        notes=source.notes,
    )
    session.add(nxt)
    await session.flush()

    for bp in await session.scalars(select(BatchProduct).where(BatchProduct.batch_id == source.id)):
        session.add(
            BatchProduct(
                batch_id=nxt.id,
                product_id=bp.product_id,
                enabled=bp.enabled,
                sale_price=bp.sale_price,
                purchase_price=bp.purchase_price,
            )
        )
    return nxt
