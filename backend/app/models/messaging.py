"""Тексты бота и исходящая очередь."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import JSON, BigInteger, Boolean, DateTime, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.enums import BotMessageMode, Channel
from app.models.base import Base, TimestampMixin


class OutboundMessage(Base, TimestampMixin):
    __tablename__ = "outbound_messages"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    client_id: Mapped[int | None] = mapped_column(BigInteger)
    channel: Mapped[str] = mapped_column(String(8), default=Channel.TG, nullable=False)
    channel_user_id: Mapped[str] = mapped_column(String(64), nullable=False)
    order_id: Mapped[int | None] = mapped_column(BigInteger)
    kind: Mapped[str] = mapped_column(String(32), default="text")
    text: Mapped[str | None] = mapped_column(Text)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class BotMessage(Base, TimestampMixin):
    __tablename__ = "bot_messages"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    trigger: Mapped[str] = mapped_column(String(255), nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    buttons: Mapped[list | None] = mapped_column(JSON)
    mode: Mapped[str] = mapped_column(String(8), default=BotMessageMode.AUTO)
    channel_tg: Mapped[bool] = mapped_column(Boolean, default=True)
