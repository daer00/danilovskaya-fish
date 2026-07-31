"""Хелперы заказов и уведомлений."""

from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.enums import STATUS_LABELS, Channel, OrderStatus
from app.models.batch import Batch
from app.models.client import Client
from app.models.messaging import BotMessage, OutboundMessage
from app.models.order import Order, OrderItem


def fmt_money(v: Decimal | float | int) -> str:
    return f"{Decimal(v):.0f}" if Decimal(v) == Decimal(v).to_integral_value() else f"{Decimal(v):.2f}"


def fmt_qty(v: Decimal | float) -> str:
    d = Decimal(v)
    s = format(d.normalize(), "f")
    if s.endswith(".0"):
        s = s[:-2]
    return s.replace(".", ",")


def compose_items(items: list[OrderItem]) -> str:
    return "\n".join(f"• {i.product_name} — {fmt_qty(i.quantity)} × {fmt_money(i.unit_price)} ₽" for i in items)


async def get_msg(session: AsyncSession, code: str) -> str:
    row = await session.scalar(select(BotMessage).where(BotMessage.code == code))
    return row.text if row else code


def render(template: str, **kw: str) -> str:
    out = template
    for k, v in kw.items():
        out = out.replace("{" + k + "}", v)
    return out


async def active_batch(session: AsyncSession) -> Batch | None:
    return await session.scalar(
        select(Batch).where(Batch.is_open.is_(True)).order_by(Batch.deadline.desc()).limit(1)
    )


async def next_order_number(session: AsyncSession, batch_id: int) -> int:
    n = await session.scalar(select(func.coalesce(func.max(Order.number), 0)).where(Order.batch_id == batch_id))
    return int(n or 0) + 1


async def enqueue(
    session: AsyncSession,
    *,
    channel_user_id: str,
    text: str,
    client_id: int | None = None,
    order_id: int | None = None,
) -> None:
    session.add(
        OutboundMessage(
            client_id=client_id,
            channel=Channel.TG,
            channel_user_id=channel_user_id,
            order_id=order_id,
            kind="text",
            text=text,
        )
    )


async def notify_admins(session: AsyncSession, text: str) -> None:
    chat = settings.admin_notify_chat_id
    if not chat:
        return
    await enqueue(session, channel_user_id=str(chat), text=text)


async def load_order(session: AsyncSession, order_id: int) -> Order | None:
    return await session.scalar(
        select(Order).where(Order.id == order_id).options(selectinload(Order.items))
    )


def batch_placeholders(batch: Batch) -> dict[str, str]:
    return {
        "дедлайн": batch.deadline.astimezone(UTC).strftime("%d.%m.%Y %H:%M") if batch.deadline.tzinfo else batch.deadline.strftime("%d.%m.%Y %H:%M"),
        "дата_выдачи": batch.pickup_date.strftime("%d.%m.%Y"),
    }


async def notify_order_status(session: AsyncSession, order: Order, client: Client) -> None:
    ph = {
        "имя": order.full_name,
        "номер": str(order.number),
        "состав": compose_items(order.items),
        "сумма": fmt_money(order.total),
        "причина": order.cancel_reason or "",
        "статус": STATUS_LABELS.get(order.status, order.status),
    }
    batch = await session.get(Batch, order.batch_id)
    if batch:
        ph.update(batch_placeholders(batch))

    if order.status == OrderStatus.READY:
        text = render(await get_msg(session, "order_ready"), **ph)
        await enqueue(session, channel_user_id=client.telegram_id, text=text, client_id=client.id, order_id=order.id)
    elif order.status == OrderStatus.CANCELLED:
        code = "order_cancelled_reason" if order.cancel_reason else "order_cancelled"
        text = render(await get_msg(session, code), **ph)
        await enqueue(session, channel_user_id=client.telegram_id, text=text, client_id=client.id, order_id=order.id)
