"""Недельная партия: дедлайн и дата выдачи."""

from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class Batch(Base, TimestampMixin):
    __tablename__ = "batches"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    deadline: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    pickup_date: Mapped[date] = mapped_column(Date, nullable=False)
    pickup_place: Mapped[str] = mapped_column(String(255), default="холл")
    is_open: Mapped[bool] = mapped_column(Boolean, default=True)
    notes: Mapped[str | None] = mapped_column(Text)
    deadline_warned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    closed_notified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
