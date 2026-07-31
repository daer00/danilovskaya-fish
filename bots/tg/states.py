from __future__ import annotations

from aiogram.fsm.state import State, StatesGroup


class OrderFSM(StatesGroup):
    qty = State()
    qty_custom = State()
    name = State()
    phone = State()
    comment = State()
    confirm = State()
