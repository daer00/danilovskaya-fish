"""Админ: клиенты."""

from __future__ import annotations

import uuid
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.v1.admin.deps import CurrentAdmin
from app.core.database import get_session
from app.enums import STATUS_LABELS, OrderStatus
from app.models.client import Client
from app.models.client_message import ClientMessage
from app.models.messaging import OutboundMessage
from app.models.order import Order
from app.services.orders import enqueue

router = APIRouter()


class ClientOrderOut(BaseModel):
    id: int
    number: int
    batch_id: int
    status: str
    status_label: str
    total: Decimal
    created_at: str
    состав: str


class ClientOut(BaseModel):
    id: int
    full_name: str | None
    phone: str | None
    username: str | None
    notes: str | None = None
    is_manual: bool = False
    orders_count: int
    unread_count: int = 0
    orders: list[ClientOrderOut] = []


class ClientCreate(BaseModel):
    full_name: str
    phone: str | None = None
    notes: str | None = None


class ClientPatch(BaseModel):
    full_name: str | None = None
    phone: str | None = None
    notes: str | None = None


class ClientMerge(BaseModel):
    keep_id: int
    merge_ids: list[int] = Field(min_length=1)


class ChatMessageOut(BaseModel):
    id: int
    direction: str
    text: str
    created_at: str
    read_at: str | None = None


class ChatSendIn(BaseModel):
    text: str = Field(min_length=1, max_length=4000)


class ConversationOut(BaseModel):
    client_id: int
    full_name: str | None
    phone: str | None
    username: str | None
    is_manual: bool
    unread_count: int
    last_text: str | None = None
    last_at: str | None = None


def _is_manual(tg: str) -> bool:
    return tg.startswith("manual-") or tg.startswith("merged-")


def _compose(items) -> str:
    return ", ".join(f"{i.product_name} × {i.quantity}" for i in items)


def _msg_out(m: ClientMessage) -> ChatMessageOut:
    return ChatMessageOut(
        id=m.id,
        direction=m.direction,
        text=m.text,
        created_at=m.created_at.isoformat() if m.created_at else "",
        read_at=m.read_at.isoformat() if m.read_at else None,
    )


def _out(c: Client, orders: list, count: int, unread: int = 0) -> ClientOut:
    return ClientOut(
        id=c.id,
        full_name=c.full_name,
        phone=c.phone,
        username=c.username,
        notes=c.notes,
        is_manual=_is_manual(c.telegram_id),
        orders_count=count,
        unread_count=unread,
        orders=[
            ClientOrderOut(
                id=o.id,
                number=o.number,
                batch_id=o.batch_id,
                status=o.status,
                status_label=STATUS_LABELS.get(o.status, o.status),
                total=o.total,
                created_at=o.created_at.isoformat() if o.created_at else "",
                состав=_compose(o.items),
            )
            for o in orders[:20]
        ],
    )


@router.get("", response_model=list[ClientOut])
async def list_clients(
    _: CurrentAdmin, session: Annotated[AsyncSession, Depends(get_session)], q: str | None = None
) -> list[ClientOut]:
    clients = list(await session.scalars(select(Client).order_by(Client.full_name.nulls_last(), Client.id)))
    if q:
        needle = q.strip().lower()
        clients = [
            c
            for c in clients
            if needle in (c.full_name or "").lower()
            or needle in (c.phone or "")
            or needle in (c.username or "").lower()
            or needle in (c.notes or "").lower()
        ]
    counts = {
        cid: n
        for cid, n in (
            await session.execute(
                select(Order.client_id, func.count())
                .where(Order.status != OrderStatus.CANCELLED)
                .group_by(Order.client_id)
            )
        ).all()
    }
    orders_by_client: dict[int, list] = {}
    all_orders = list(
        await session.scalars(select(Order).options(selectinload(Order.items)).order_by(Order.id.desc()))
    )
    for o in all_orders:
        orders_by_client.setdefault(o.client_id, []).append(o)

    unreads = {
        cid: int(n)
        for cid, n in (
            await session.execute(
                select(ClientMessage.client_id, func.count())
                .where(ClientMessage.direction == "in", ClientMessage.read_at.is_(None))
                .group_by(ClientMessage.client_id)
            )
        ).all()
    }

    return [
        _out(c, orders_by_client.get(c.id, []), counts.get(c.id, 0), unreads.get(c.id, 0))
        for c in clients
    ]


@router.post("", response_model=ClientOut)
async def create_client(
    payload: ClientCreate, _: CurrentAdmin, session: Annotated[AsyncSession, Depends(get_session)]
) -> ClientOut:
    row = Client(
        telegram_id=f"manual-{uuid.uuid4().hex[:12]}",
        full_name=payload.full_name.strip(),
        phone=(payload.phone or "").strip() or None,
        notes=(payload.notes or "").strip() or None,
    )
    session.add(row)
    await session.commit()
    await session.refresh(row)
    return _out(row, [], 0)


@router.post("/merge", response_model=ClientOut)
async def merge_clients(
    payload: ClientMerge, _: CurrentAdmin, session: Annotated[AsyncSession, Depends(get_session)]
) -> ClientOut:
    from app.services.clients import join_links, merge_nicks, parse_links

    merge_ids = sorted({i for i in payload.merge_ids if i != payload.keep_id})
    if not merge_ids:
        raise HTTPException(400, "Выберите минимум двух клиентов")

    keep = await session.get(Client, payload.keep_id)
    if not keep:
        raise HTTPException(404, "not_found")

    losers: list[Client] = []
    for mid in merge_ids:
        row = await session.get(Client, mid)
        if not row:
            raise HTTPException(404, f"Клиент {mid} не найден")
        losers.append(row)

    all_rows = [keep, *losers]
    keep.username = merge_nicks(*(c.username for c in all_rows))

    primary = keep.telegram_id if not _is_manual(keep.telegram_id) else None
    if primary is None:
        donor = next((c for c in losers if not _is_manual(c.telegram_id)), None)
        if donor:
            primary = donor.telegram_id

    linked: list[str] = []
    for c in all_rows:
        linked.extend(parse_links(c.linked_telegrams))
        if not _is_manual(c.telegram_id) and c.telegram_id != primary:
            linked.append(c.telegram_id)

    # Освобождаем unique telegram_id у поглощаемых (и у keep, если передаём ему чужой TG)
    for c in losers:
        if not _is_manual(c.telegram_id):
            c.telegram_id = f"merged-{c.id}-{uuid.uuid4().hex[:8]}"
    await session.flush()

    if primary and keep.telegram_id != primary:
        if not _is_manual(keep.telegram_id):
            linked.append(keep.telegram_id)
            keep.telegram_id = f"merged-keep-{keep.id}-{uuid.uuid4().hex[:8]}"
            await session.flush()
        keep.telegram_id = primary

    keep.linked_telegrams = join_links([x for x in linked if x != keep.telegram_id])

    if not (keep.full_name or "").strip():
        keep.full_name = next((c.full_name for c in losers if (c.full_name or "").strip()), keep.full_name)
    if not (keep.phone or "").strip():
        keep.phone = next((c.phone for c in losers if (c.phone or "").strip()), keep.phone)

    notes: list[str] = []
    for part in [keep.notes, *(c.notes for c in losers)]:
        t = (part or "").strip()
        if t and t not in notes:
            notes.append(t)
    keep.notes = "\n---\n".join(notes) or None

    await session.execute(update(Order).where(Order.client_id.in_(merge_ids)).values(client_id=keep.id))
    await session.execute(
        update(OutboundMessage).where(OutboundMessage.client_id.in_(merge_ids)).values(client_id=keep.id)
    )
    await session.execute(
        update(ClientMessage).where(ClientMessage.client_id.in_(merge_ids)).values(client_id=keep.id)
    )
    for c in losers:
        await session.delete(c)
    await session.commit()
    await session.refresh(keep)

    count = await session.scalar(
        select(func.count())
        .select_from(Order)
        .where(Order.client_id == keep.id, Order.status != OrderStatus.CANCELLED)
    )
    orders = list(
        await session.scalars(
            select(Order)
            .options(selectinload(Order.items))
            .where(Order.client_id == keep.id)
            .order_by(Order.id.desc())
            .limit(20)
        )
    )
    return _out(keep, orders, int(count or 0))


@router.get("/conversations", response_model=list[ConversationOut])
async def list_conversations(
    _: CurrentAdmin, session: Annotated[AsyncSession, Depends(get_session)]
) -> list[ConversationOut]:
    """Клиенты, с которыми есть переписка (сначала непрочитанные)."""
    last_id = (
        select(ClientMessage.client_id, func.max(ClientMessage.id).label("mid"))
        .group_by(ClientMessage.client_id)
        .subquery()
    )
    rows = await session.execute(
        select(Client, ClientMessage)
        .join(last_id, last_id.c.client_id == Client.id)
        .join(ClientMessage, ClientMessage.id == last_id.c.mid)
    )
    unreads = {
        cid: int(n)
        for cid, n in (
            await session.execute(
                select(ClientMessage.client_id, func.count())
                .where(ClientMessage.direction == "in", ClientMessage.read_at.is_(None))
                .group_by(ClientMessage.client_id)
            )
        ).all()
    }
    out: list[ConversationOut] = []
    for c, m in rows.all():
        out.append(
            ConversationOut(
                client_id=c.id,
                full_name=c.full_name,
                phone=c.phone,
                username=c.username,
                is_manual=_is_manual(c.telegram_id),
                unread_count=unreads.get(c.id, 0),
                last_text=m.text,
                last_at=m.created_at.isoformat() if m.created_at else None,
            )
        )
    out.sort(key=lambda x: x.last_at or "", reverse=True)
    out.sort(key=lambda x: 0 if x.unread_count else 1)
    return out


@router.get("/{client_id}/messages", response_model=list[ChatMessageOut])
async def list_messages(
    client_id: int, _: CurrentAdmin, session: Annotated[AsyncSession, Depends(get_session)]
) -> list[ChatMessageOut]:
    client = await session.get(Client, client_id)
    if not client:
        raise HTTPException(404, "not_found")
    rows = list(
        await session.scalars(
            select(ClientMessage)
            .where(ClientMessage.client_id == client_id)
            .order_by(ClientMessage.id.asc())
            .limit(300)
        )
    )
    return [_msg_out(m) for m in rows]


@router.post("/{client_id}/messages", response_model=ChatMessageOut)
async def send_message(
    client_id: int,
    payload: ChatSendIn,
    _: CurrentAdmin,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> ChatMessageOut:
    client = await session.get(Client, client_id)
    if not client:
        raise HTTPException(404, "not_found")
    text = payload.text.strip()
    if not text:
        raise HTTPException(400, "Пустое сообщение")
    if _is_manual(client.telegram_id):
        raise HTTPException(400, "У клиента нет Telegram — ответ отправить нельзя")

    row = ClientMessage(client_id=client.id, direction="out", text=text)
    session.add(row)
    await enqueue(session, channel_user_id=client.telegram_id, text=text, client_id=client.id)
    await session.commit()
    await session.refresh(row)
    return _msg_out(row)


@router.post("/{client_id}/messages/read")
async def mark_messages_read(
    client_id: int, _: CurrentAdmin, session: Annotated[AsyncSession, Depends(get_session)]
) -> dict[str, str]:
    from datetime import UTC, datetime

    client = await session.get(Client, client_id)
    if not client:
        raise HTTPException(404, "not_found")
    await session.execute(
        update(ClientMessage)
        .where(
            ClientMessage.client_id == client_id,
            ClientMessage.direction == "in",
            ClientMessage.read_at.is_(None),
        )
        .values(read_at=datetime.now(UTC))
    )
    await session.commit()
    return {"status": "ok"}


@router.patch("/{client_id}", response_model=ClientOut)
async def update_client(
    client_id: int,
    payload: ClientPatch,
    _: CurrentAdmin,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> ClientOut:
    row = await session.get(Client, client_id)
    if not row:
        raise HTTPException(404, "not_found")
    if payload.full_name is not None:
        row.full_name = payload.full_name.strip() or None
    if payload.phone is not None:
        row.phone = payload.phone.strip() or None
    if payload.notes is not None:
        row.notes = payload.notes.strip() or None
    await session.commit()

    count = await session.scalar(
        select(func.count())
        .select_from(Order)
        .where(Order.client_id == client_id, Order.status != OrderStatus.CANCELLED)
    )
    orders = list(
        await session.scalars(
            select(Order)
            .options(selectinload(Order.items))
            .where(Order.client_id == client_id)
            .order_by(Order.id.desc())
            .limit(20)
        )
    )
    unread = int(
        await session.scalar(
            select(func.count())
            .select_from(ClientMessage)
            .where(
                ClientMessage.client_id == client_id,
                ClientMessage.direction == "in",
                ClientMessage.read_at.is_(None),
            )
        )
        or 0
    )
    return _out(row, orders, int(count or 0), unread)
