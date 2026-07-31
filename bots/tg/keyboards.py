from __future__ import annotations

from aiogram.types import KeyboardButton, ReplyKeyboardMarkup, ReplyKeyboardRemove
from aiogram.utils.keyboard import InlineKeyboardBuilder


def main_kb() -> ReplyKeyboardMarkup:
    return ReplyKeyboardMarkup(
        keyboard=[
            [KeyboardButton(text="Каталог"), KeyboardButton(text="Мои заказы")],
            [KeyboardButton(text="Условия")],
        ],
        resize_keyboard=True,
    )


def qty_kb(halves: bool) -> InlineKeyboardBuilder:
    b = InlineKeyboardBuilder()
    if halves:
        for q in ("0.5", "1", "1.5", "2"):
            b.button(text=q.replace(".", ","), callback_data=f"qty:{q}")
    else:
        for q in ("1", "2", "3"):
            b.button(text=q, callback_data=f"qty:{q}")
    b.button(text="Ввести своё", callback_data="qty:custom")
    b.adjust(4 if halves else 3, 1)
    return b


def after_add_kb() -> InlineKeyboardBuilder:
    b = InlineKeyboardBuilder()
    b.button(text="Добавить ещё", callback_data="cart:more")
    b.button(text="Оформить заказ", callback_data="cart:checkout")
    b.adjust(1)
    return b


def cart_kb() -> InlineKeyboardBuilder:
    b = InlineKeyboardBuilder()
    b.button(text="Оформить", callback_data="cart:checkout")
    b.button(text="Добавить ещё", callback_data="cart:more")
    b.button(text="Очистить", callback_data="cart:clear")
    b.adjust(1)
    return b


def phone_kb() -> ReplyKeyboardMarkup:
    return ReplyKeyboardMarkup(
        keyboard=[[KeyboardButton(text="Поделиться контактом", request_contact=True)]],
        resize_keyboard=True,
        one_time_keyboard=True,
    )


def skip_kb() -> InlineKeyboardBuilder:
    b = InlineKeyboardBuilder()
    b.button(text="Пропустить", callback_data="comment:skip")
    return b


def confirm_kb() -> InlineKeyboardBuilder:
    b = InlineKeyboardBuilder()
    b.button(text="Подтвердить", callback_data="order:confirm")
    b.button(text="Отменить", callback_data="order:abort")
    b.adjust(2)
    return b


def order_kb(oid: int, number: int) -> InlineKeyboardBuilder:
    b = InlineKeyboardBuilder()
    b.button(text="Отменить заказ", callback_data=f"cancel:{oid}:{number}")
    return b


def cancel_ask_kb(oid: int) -> InlineKeyboardBuilder:
    b = InlineKeyboardBuilder()
    b.button(text="Да, отменить", callback_data=f"cancel_yes:{oid}")
    b.button(text="Оставить", callback_data="cancel_no")
    b.adjust(2)
    return b


def product_kb(pid: int) -> InlineKeyboardBuilder:
    b = InlineKeyboardBuilder()
    b.button(text="Заказать", callback_data=f"buy:{pid}")
    return b


def remove_kb() -> ReplyKeyboardRemove:
    return ReplyKeyboardRemove()
