"""Telegram-бот: long polling + outbox. python -m bots.run"""

from __future__ import annotations

import asyncio
import json
import logging

from aiogram import Bot, Dispatcher
from aiogram.client.session.aiohttp import AiohttpSession
from aiogram.fsm.context import FSMContext
from aiogram.fsm.storage.base import StorageKey
from aiogram.fsm.storage.redis import RedisStorage

from bots.core.backend import backend
from bots.core.config import settings
from bots.core.texts import texts
from bots.tg.handlers import router, start_checkout_from_items


async def _handle_webapp_cart(bot: Bot, dp: Dispatcher, item: dict) -> None:
    raw = json.loads(item.get("text") or "{}")
    items = raw.get("items") or []
    user_id = int(item["channel_user_id"])
    await backend.upsert_client(str(user_id), raw.get("username"))
    key = StorageKey(bot_id=bot.id, chat_id=user_id, user_id=user_id)
    state = FSMContext(storage=dp.storage, key=key)

    async def answer(text: str, **kwargs):
        await bot.send_message(user_id, text, **kwargs)

    await start_checkout_from_items(chat_id=user_id, state=state, items=items, answer=answer)


async def _outbox_loop(bot: Bot, dp: Dispatcher) -> None:
    while True:
        try:
            for item in await backend.get_outbox("tg"):
                try:
                    if item.get("kind") == "webapp_cart":
                        await _handle_webapp_cart(bot, dp, item)
                    else:
                        await bot.send_message(int(item["channel_user_id"]), item.get("text") or "…")
                    await backend.mark_outbox_sent(item["id"])
                except Exception as e:  # noqa: BLE001
                    logging.warning("outbox: %s", e)
        except Exception:  # noqa: BLE001
            pass
        await asyncio.sleep(2)


async def main() -> None:
    logging.basicConfig(level=logging.INFO)
    await texts.load()
    session = AiohttpSession(proxy=settings.tg_proxy) if settings.tg_proxy else None
    if settings.tg_proxy:
        logging.info("Telegram via TG_PROXY")
    bot = Bot(settings.tg_bot_token, session=session)
    if settings.webapp_url:
        logging.info("WebApp catalog: %s (открывать кнопкой «Каталог» в клавиатуре)", settings.webapp_url)
    dp = Dispatcher(storage=RedisStorage.from_url(settings.redis_url))
    dp.include_router(router)
    outbox = asyncio.create_task(_outbox_loop(bot, dp))
    try:
        await dp.start_polling(bot)
    finally:
        outbox.cancel()
        await backend.close()
        await bot.session.close()


if __name__ == "__main__":
    asyncio.run(main())
