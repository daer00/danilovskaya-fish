"""Товар каталога (вид рыбы)."""

from __future__ import annotations

from decimal import Decimal

from sqlalchemy import Boolean, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.enums import ProductUnit
from app.models.base import Base, TimestampMixin


class Product(Base, TimestampMixin):
    __tablename__ = "products"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    purchase_price: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    weight_kg: Mapped[Decimal | None] = mapped_column(Numeric(8, 3))
    purchase_price_per_kg: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    description: Mapped[str | None] = mapped_column(Text)
    photo_url: Mapped[str | None] = mapped_column(String(1024))
    unit: Mapped[str] = mapped_column(String(8), default=ProductUnit.PCS, nullable=False)
    allow_halves: Mapped[bool] = mapped_column(Boolean, default=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    sort_order: Mapped[int] = mapped_column(default=0)
