"""Планировщик: −2ч до дедлайна и закрытие партии."""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta
from decimal import Decimal

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.core.database import SessionLocal
from app.enums import OrderStatus
from app.models.batch import Batch
from app.models.order import Order, OrderItem
from app.services.orders import batch_placeholders, fmt_money, fmt_qty, get_msg, notify_admins, render

log = logging.getLogger(__name__)
scheduler = AsyncIOScheduler()


async def _deadline_jobs() -> None:
    async with SessionLocal() as session:
        now = datetime.now(UTC)
        batches = (await session.scalars(select(Batch).where(Batch.is_open.is_(True)))).all()
        for b in batches:
            dl = b.deadline if b.deadline.tzinfo else b.deadline.replace(tzinfo=UTC)
            # −2 часа
            if b.deadline_warned_at is None and now >= dl - timedelta(hours=2) and now < dl:
                active = [OrderStatus.NEW, OrderStatus.CONFIRMED, OrderStatus.READY]
                q = await session.execute(
                    select(func.count(Order.id), func.coalesce(func.sum(Order.total), 0)).where(
                        Order.batch_id == b.id, Order.status.in_(active)
                    )
                )
                cnt, total = q.one()
                text = render(
                    await get_msg(session, "admin_deadline_2h"),
                    количество=str(cnt),
                    сумма=fmt_money(Decimal(total or 0)),
                    **batch_placeholders(b),
                )
                await notify_admins(session, text)
                b.deadline_warned_at = now

            # закрытие
            if now >= dl:
                b.is_open = False
                if b.closed_notified_at is None:
                    rows = await session.execute(
                        select(OrderItem.product_name, func.sum(OrderItem.quantity), func.sum(OrderItem.line_total))
                        .join(Order)
                        .where(Order.batch_id == b.id, Order.status != OrderStatus.CANCELLED)
                        .group_by(OrderItem.product_name)
                    )
                    lines = [f"• {name}: {fmt_qty(qty)} шт. ({fmt_money(s)} ₽)" for name, qty, s in rows.all()]
                    summary = "\n".join(lines) or "нет заказов"
                    q = await session.execute(
                        select(func.count(Order.id), func.coalesce(func.sum(Order.total), 0)).where(
                            Order.batch_id == b.id, Order.status != OrderStatus.CANCELLED
                        )
                    )
                    cnt, total = q.one()
                    text = render(
                        await get_msg(session, "admin_batch_closed"),
                        сводка=summary,
                        количество=str(cnt),
                        сумма=fmt_money(Decimal(total or 0)),
                        **batch_placeholders(b),
                    )
                    await notify_admins(session, text)
                    b.closed_notified_at = now
        await session.commit()


def start_scheduler() -> None:
    if scheduler.running:
        return
    scheduler.add_job(_deadline_jobs, "interval", minutes=1, id="deadline_jobs", replace_existing=True)
    scheduler.start()
    log.info("scheduler started")
