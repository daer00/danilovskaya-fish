"""Доменные перечисления «Даниловская рыба»."""

from __future__ import annotations

from enum import StrEnum


class Channel(StrEnum):
    TG = "tg"


class AdminRole(StrEnum):
    ADMIN = "admin"


class OrderStatus(StrEnum):
    NEW = "new"
    CONFIRMED = "confirmed"
    READY = "ready"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class BotMessageMode(StrEnum):
    AUTO = "auto"
    MANUAL = "manual"


STATUS_LABELS: dict[str, str] = {
    OrderStatus.NEW: "Принят, ждёт подтверждения",
    OrderStatus.CONFIRMED: "Подтверждён",
    OrderStatus.READY: "Готов к выдаче",
    OrderStatus.COMPLETED: "Получен",
    OrderStatus.CANCELLED: "Отменён",
}
