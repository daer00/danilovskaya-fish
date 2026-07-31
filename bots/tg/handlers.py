"""Хендлеры Telegram-бота «Даниловская рыба»."""

from __future__ import annotations

import re
from decimal import Decimal, InvalidOperation

from aiogram import F, Router
from aiogram.filters import Command, CommandStart
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, Message

from bots.core.backend import backend
from bots.core.texts import texts
from bots.tg import keyboards as kb
from bots.tg.states import OrderFSM

router = Router()


def _fmt_deadline(batch: dict) -> dict[str, str]:
    from datetime import datetime

    dl = batch["deadline"]
    if isinstance(dl, str):
        try:
            dt = datetime.fromisoformat(dl.replace("Z", "+00:00"))
            dl_s = dt.strftime("%d.%m.%Y %H:%M")
        except ValueError:
            dl_s = dl
    else:
        dl_s = str(dl)
    pd = batch["pickup_date"]
    if isinstance(pd, str) and len(pd) >= 10:
        y, m, d = pd[:10].split("-")
        pd_s = f"{d}.{m}.{y}"
    else:
        pd_s = str(pd)
    return {"дедлайн": dl_s, "дата_выдачи": pd_s}


async def _batch_ph() -> dict[str, str]:
    b = await backend.active_batch()
    return _fmt_deadline(b) if b else {"дедлайн": "—", "дата_выдачи": "—"}


def _cart_sum(cart: list[dict]) -> tuple[str, str]:
    lines, total = [], Decimal("0")
    for i in cart:
        q = Decimal(str(i["quantity"]))
        p = Decimal(str(i["price"]))
        line = p * q
        total += line
        q_s = str(q.normalize()).replace(".", ",")
        lines.append(f"• {i['name']} — {q_s} × {p:.0f} ₽")
    return "\n".join(lines), f"{total:.0f}"


def _norm_phone(raw: str) -> str | None:
    digits = re.sub(r"\D", "", raw)
    if digits.startswith("8") and len(digits) == 11:
        digits = "7" + digits[1:]
    if digits.startswith("7") and len(digits) == 11:
        return "+" + digits
    return None


@router.message(CommandStart())
async def start(message: Message, state: FSMContext) -> None:
    await state.clear()
    client = await backend.upsert_client(str(message.from_user.id), message.from_user.username)
    ph = await _batch_ph()
    batch = await backend.active_batch()
    if not batch or not batch.get("is_open"):
        code = "closed_next" if batch else "closed_none"
        await message.answer(texts.get(code, **ph), reply_markup=kb.main_kb())
        return
    if client.get("has_orders") and client.get("full_name"):
        await message.answer(texts.get("start_back", имя=client["full_name"], **ph), reply_markup=kb.main_kb())
    else:
        await message.answer(texts.get("start_first", **ph), reply_markup=kb.main_kb())
    open_kb = kb.open_catalog_kb()
    if open_kb:
        await message.answer("Собрать заказ можно в каталоге:", reply_markup=open_kb.as_markup())


@router.message(Command("info"))
@router.message(F.text == "Условия")
async def info(message: Message) -> None:
    await message.answer(texts.get("info", **await _batch_ph()), reply_markup=kb.main_kb())


@router.message(Command("help"))
async def help_cmd(message: Message) -> None:
    await message.answer(texts.get("help"), reply_markup=kb.main_kb())


async def start_checkout_from_items(
    *,
    chat_id: int,
    state: FSMContext,
    items: list,
    answer,
) -> None:
    """Общий старт оформления из мини-аппа (sendData или API/outbox)."""
    await state.clear()
    if not items:
        await answer(texts.get("cart_empty"), reply_markup=kb.main_kb())
        return
    cart = [
        {
            "product_id": int(i["product_id"]),
            "name": str(i["name"]),
            "price": str(i["price"]),
            "quantity": str(i["quantity"]),
        }
        for i in items
    ]
    await state.update_data(cart=cart)
    состав, сумма = _cart_sum(cart)
    await answer(texts.get("cart_view", состав=состав, сумма=сумма), reply_markup=kb.main_kb())
    await state.set_state(OrderFSM.name)
    await answer(texts.get("ask_name"), reply_markup=kb.remove_kb())


@router.message(F.web_app_data)
async def cart_from_webapp(message: Message, state: FSMContext) -> None:
    """Корзина из мини-приложения через sendData (только keyboard web_app)."""
    import json

    try:
        raw = json.loads(message.web_app_data.data)
        items = raw.get("items") or []
    except (TypeError, ValueError, AttributeError):
        await message.answer(texts.get("error_generic"), reply_markup=kb.main_kb())
        return
    await start_checkout_from_items(chat_id=message.chat.id, state=state, items=items, answer=message.answer)


@router.message(F.text == "Каталог")
async def catalog(message: Message, state: FSMContext) -> None:
    """Если WEBAPP_URL задан, каталог — только мини-апп; иначе текстовый список."""
    from bots.core.config import settings as bot_settings

    open_kb = kb.open_catalog_kb()
    if open_kb:
        await message.answer(
            "Каталог открывается в мини-приложении — нажмите кнопку ниже "
            "(или «Каталог» на клавиатуре с иконкой приложения).",
            reply_markup=open_kb.as_markup(),
        )
        return

    batch = await backend.active_batch()
    ph = await _batch_ph()
    if not batch or not batch.get("is_open"):
        await message.answer(texts.get("closed_none" if not batch else "closed_next", **ph))
        return
    products = await backend.catalog()
    if not products:
        await message.answer(texts.get("catalog_empty"))
        return
    await message.answer(texts.get("catalog_title", **ph))
    for p in products:
        text = texts.get(
            "product_card",
            товар=p["name"],
            цена=f"{Decimal(str(p['price'])):.0f}",
            описание=p.get("description") or "",
        )
        await message.answer(text, reply_markup=kb.product_kb(p["id"]).as_markup())


@router.callback_query(F.data.startswith("buy:"))
async def buy(cq: CallbackQuery, state: FSMContext) -> None:
    pid = int(cq.data.split(":")[1])
    products = {p["id"]: p for p in await backend.catalog()}
    p = products.get(pid)
    if not p:
        await cq.message.answer(texts.get("product_gone"))
        await cq.answer()
        return
    await state.update_data(product=p)
    await state.set_state(OrderFSM.qty)
    code = "qty_halves" if p["allow_halves"] else "qty_whole"
    await cq.message.answer(texts.get(code), reply_markup=kb.qty_kb(p["allow_halves"]).as_markup())
    await cq.answer()


async def _add_to_cart(message: Message, state: FSMContext, qty: Decimal) -> None:
    data = await state.get_data()
    p = data["product"]
    cart = list(data.get("cart") or [])
    cart.append({"product_id": p["id"], "name": p["name"], "price": p["price"], "quantity": str(qty)})
    await state.update_data(cart=cart, product=None)
    await state.set_state(None)
    q_s = str(qty.normalize()).replace(".", ",")
    await message.answer(
        texts.get("cart_added", товар=p["name"], количество=q_s),
        reply_markup=kb.after_add_kb().as_markup(),
    )


@router.callback_query(OrderFSM.qty, F.data.startswith("qty:"))
async def qty_pick(cq: CallbackQuery, state: FSMContext) -> None:
    val = cq.data.split(":")[1]
    if val == "custom":
        await state.set_state(OrderFSM.qty_custom)
        await cq.message.answer("Введите количество:")
        await cq.answer()
        return
    data = await state.get_data()
    p = data["product"]
    try:
        q = Decimal(val)
        if p["allow_halves"]:
            if (q * 2) != (q * 2).to_integral_value():
                raise InvalidOperation
        elif q != q.to_integral_value():
            raise InvalidOperation
    except (InvalidOperation, KeyError):
        await cq.message.answer(texts.get("qty_bad_half" if p.get("allow_halves") else "qty_bad_whole"))
        await cq.answer()
        return
    await _add_to_cart(cq.message, state, q)
    await cq.answer()


@router.message(OrderFSM.qty_custom)
async def qty_custom(message: Message, state: FSMContext) -> None:
    data = await state.get_data()
    p = data["product"]
    raw = (message.text or "").replace(",", ".").strip()
    try:
        q = Decimal(raw)
        if q <= 0:
            raise InvalidOperation
        if p["allow_halves"]:
            if (q * 2) != (q * 2).to_integral_value():
                await message.answer(texts.get("qty_bad_half"))
                return
        elif q != q.to_integral_value():
            await message.answer(texts.get("qty_bad_whole"))
            return
    except (InvalidOperation, TypeError):
        await message.answer(texts.get("qty_bad_half" if p["allow_halves"] else "qty_bad_whole"))
        return
    await _add_to_cart(message, state, q)


@router.callback_query(F.data == "cart:more")
async def cart_more(cq: CallbackQuery, state: FSMContext) -> None:
    await catalog(cq.message, state)
    await cq.answer()


@router.callback_query(F.data == "cart:clear")
async def cart_clear(cq: CallbackQuery, state: FSMContext) -> None:
    await state.update_data(cart=[])
    await cq.message.answer(texts.get("cart_cleared"), reply_markup=kb.main_kb())
    await cq.answer()


@router.callback_query(F.data == "cart:checkout")
async def checkout(cq: CallbackQuery, state: FSMContext) -> None:
    data = await state.get_data()
    cart = data.get("cart") or []
    if not cart:
        await cq.message.answer(texts.get("cart_empty"))
        await cq.answer()
        return
    состав, сумма = _cart_sum(cart)
    await cq.message.answer(texts.get("cart_view", состав=состав, сумма=сумма))
    await state.set_state(OrderFSM.name)
    await cq.message.answer(texts.get("ask_name"), reply_markup=kb.remove_kb())
    await cq.answer()


@router.message(OrderFSM.name)
async def got_name(message: Message, state: FSMContext) -> None:
    name = (message.text or "").strip()
    if len(name) < 2:
        await message.answer(texts.get("name_short"))
        return
    await state.update_data(full_name=name)
    await state.set_state(OrderFSM.phone)
    await message.answer(texts.get("ask_phone"), reply_markup=kb.phone_kb())


@router.message(OrderFSM.phone, F.contact)
async def got_contact(message: Message, state: FSMContext) -> None:
    phone = _norm_phone(message.contact.phone_number)
    if not phone:
        await message.answer(texts.get("phone_bad"), reply_markup=kb.phone_kb())
        return
    await state.update_data(phone=phone)
    await state.set_state(OrderFSM.comment)
    await message.answer(texts.get("ask_comment"), reply_markup=kb.skip_kb().as_markup())


@router.message(OrderFSM.phone)
async def got_phone_text(message: Message, state: FSMContext) -> None:
    phone = _norm_phone(message.text or "")
    if not phone:
        await message.answer(texts.get("phone_bad"), reply_markup=kb.phone_kb())
        return
    await state.update_data(phone=phone)
    await state.set_state(OrderFSM.comment)
    await message.answer(texts.get("ask_comment"), reply_markup=kb.skip_kb().as_markup())


async def _show_confirm(message: Message, state: FSMContext) -> None:
    data = await state.get_data()
    состав, сумма = _cart_sum(data.get("cart") or [])
    ph = await _batch_ph()
    await state.set_state(OrderFSM.confirm)
    await message.answer(
        texts.get("confirm", состав=состав, сумма=сумма, имя=data["full_name"], **ph),
        reply_markup=kb.confirm_kb().as_markup(),
    )


@router.callback_query(OrderFSM.comment, F.data == "comment:skip")
async def skip_comment(cq: CallbackQuery, state: FSMContext) -> None:
    await state.update_data(comment=None)
    await _show_confirm(cq.message, state)
    await cq.answer()


@router.message(OrderFSM.comment)
async def got_comment(message: Message, state: FSMContext) -> None:
    await state.update_data(comment=(message.text or "").strip() or None)
    await _show_confirm(message, state)


@router.callback_query(OrderFSM.confirm, F.data == "order:abort")
async def abort_order(cq: CallbackQuery, state: FSMContext) -> None:
    await state.clear()
    await cq.message.answer(texts.get("cart_cleared"), reply_markup=kb.main_kb())
    await cq.answer()


@router.callback_query(OrderFSM.confirm, F.data == "order:confirm")
async def confirm_order(cq: CallbackQuery, state: FSMContext) -> None:
    data = await state.get_data()
    payload = {
        "telegram_id": str(cq.from_user.id),
        "full_name": data["full_name"],
        "phone": data["phone"],
        "comment": data.get("comment"),
        "items": [{"product_id": i["product_id"], "quantity": i["quantity"]} for i in data.get("cart") or []],
    }
    try:
        order = await backend.create_order(payload)
    except Exception as e:  # noqa: BLE001
        detail = getattr(getattr(e, "response", None), "text", "") or ""
        if "product_gone" in detail:
            await cq.message.answer(texts.get("product_gone"))
        elif "deadline" in detail:
            await cq.message.answer(texts.get("closed_none", **await _batch_ph()))
        else:
            await cq.message.answer(texts.get("error_generic"))
        await cq.answer()
        return
    ph = await _batch_ph()
    await state.clear()
    await cq.message.answer(
        texts.get(
            "order_created",
            номер=str(order["number"]),
            состав=order["состав"],
            сумма=order["сумма"],
            **ph,
        ),
        reply_markup=kb.main_kb(),
    )
    await cq.answer()


@router.message(F.text == "Мои заказы")
async def my_orders(message: Message) -> None:
    ph = await _batch_ph()
    orders = await backend.my_orders(str(message.from_user.id))
    if not orders:
        await message.answer(texts.get("orders_empty", **ph), reply_markup=kb.main_kb())
        return
    for o in orders:
        text = texts.get(
            "orders_list",
            номер=str(o["number"]),
            состав=o["состав"],
            сумма=o["сумма"],
            статус=o["status_label"],
            **ph,
        )
        markup = kb.order_kb(o["id"], o["number"]).as_markup() if o["status"] == "new" else None
        await message.answer(text, reply_markup=markup)


@router.callback_query(F.data.startswith("cancel:"))
async def cancel_ask(cq: CallbackQuery) -> None:
    _, oid, num = cq.data.split(":")
    await cq.message.answer(
        texts.get("cancel_ask", номер=num),
        reply_markup=kb.cancel_ask_kb(int(oid)).as_markup(),
    )
    await cq.answer()


@router.callback_query(F.data == "cancel_no")
async def cancel_no(cq: CallbackQuery) -> None:
    await cq.message.answer("Ок, заказ на месте.", reply_markup=kb.main_kb())
    await cq.answer()


@router.callback_query(F.data.startswith("cancel_yes:"))
async def cancel_yes(cq: CallbackQuery) -> None:
    oid = int(cq.data.split(":")[1])
    ph = await _batch_ph()
    try:
        order = await backend.cancel(oid, str(cq.from_user.id))
    except Exception as e:  # noqa: BLE001
        detail = getattr(getattr(e, "response", None), "text", "") or ""
        if "deadline" in detail:
            await cq.message.answer(texts.get("cancel_deadline"))
        elif "confirmed" in detail:
            await cq.message.answer(texts.get("cancel_confirmed"))
        else:
            await cq.message.answer(texts.get("error_generic"))
        await cq.answer()
        return
    await cq.message.answer(
        texts.get("cancel_done", номер=str(order["number"]), **ph),
        reply_markup=kb.main_kb(),
    )
    await cq.answer()


@router.message()
async def fallback(message: Message) -> None:
    await message.answer(texts.get("unknown"), reply_markup=kb.main_kb())
