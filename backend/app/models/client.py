"""Клиент Telegram."""

from __future__ import annotations

from sqlalchemy import BigInteger, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class Client(Base, TimestampMixin):
    __tablename__ = "clients"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    telegram_id: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    full_name: Mapped[str | None] = mapped_column(String(255))
    phone: Mapped[str | None] = mapped_column(String(32))
    username: Mapped[str | None] = mapped_column(String(64))
