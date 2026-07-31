"""Smoke-тесты домена рыбы."""

from __future__ import annotations

from decimal import Decimal

from app.services.orders import compose_items, fmt_money, fmt_qty, render


class _Item:
    product_name: str
    quantity: Decimal
    unit_price: Decimal

    def __init__(self, name: str, qty: Decimal, price: Decimal):
        self.product_name = name
        self.quantity = qty
        self.unit_price = price


def test_fmt_qty_half():
    assert fmt_qty(Decimal("0.5")) == "0,5"


def test_fmt_money():
    assert fmt_money(Decimal("5190")) == "5190"


def test_render_placeholder():
    assert render("Привет, {имя}!", имя="Анна") == "Привет, Анна!"


def test_compose():
    text = compose_items([_Item("Форель", Decimal("1"), Decimal("1000"))])
    assert "Форель" in text
    assert "1000" in text
