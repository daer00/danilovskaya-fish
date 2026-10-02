"""Промо: скидка и статусы."""

from decimal import Decimal
from types import SimpleNamespace

from app.enums import OrderStatus
from app.services.promos import calc_discount, normalize_code, promo_was_consumed


def test_normalize_code():
    assert normalize_code("  ab 12 ") == "AB12"


def test_calc_percent_and_fixed():
    promo = SimpleNamespace(discount_type="percent", discount_value=Decimal("10"))
    assert calc_discount(promo, Decimal("1000")) == Decimal("100.00")
    promo = SimpleNamespace(discount_type="fixed", discount_value=Decimal("150"))
    assert calc_discount(promo, Decimal("100")) == Decimal("100.00")
    assert calc_discount(promo, Decimal("200")) == Decimal("150.00")


def test_promo_was_consumed():
    assert not promo_was_consumed(OrderStatus.PROCESSING)
    assert not promo_was_consumed(OrderStatus.CANCELLED)
    assert promo_was_consumed(OrderStatus.NEW)
    assert promo_was_consumed(OrderStatus.CONFIRMED)
