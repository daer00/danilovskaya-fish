"""Доменные перечисления «Даниловская рыба»."""

from __future__ import annotations

from enum import StrEnum


class Channel(StrEnum):
    TG = "tg"


class AdminRole(StrEnum):
    ADMIN = "admin"


class OrderStatus(StrEnum):
    PROCESSING = "processing"
    NEW = "new"
    CONFIRMED = "confirmed"
    READY = "ready"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class PickupSlot(StrEnum):
    FIRST = "first"
    SECOND = "second"


class ProductUnit(StrEnum):
    PCS = "pcs"  # штуки (рыба)
    KG = "kg"  # килограммы


class BotMessageMode(StrEnum):
    AUTO = "auto"
    MANUAL = "manual"


STATUS_LABELS: dict[str, str] = {
    OrderStatus.PROCESSING: "Оформляется",
    OrderStatus.NEW: "Принят, ждёт подтверждения",
    OrderStatus.CONFIRMED: "Подтверждён",
    OrderStatus.READY: "Готов к выдаче",
    OrderStatus.COMPLETED: "Выдан",
    OrderStatus.CANCELLED: "Отменён",
}

PICKUP_LABELS: dict[str, str] = {
    PickupSlot.FIRST: "1-е собрание",
    PickupSlot.SECOND: "2-е собрание",
}
