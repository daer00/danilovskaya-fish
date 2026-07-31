"""Telegram-бот: long polling + outbox. python -m bots.run"""

from __future__ import annotations

import asyncio
import logging

from aiogram import Bot, Dispatcher
from aiogram.client.session.aiohttp import AiohttpSession
from aiogram.fsm.storage.redis import RedisStorage

from bots.core.backend import backend
from bots.core.config import settings
from bots.core.texts import texts
from bots.tg.handlers import router


async def _outbox_loop(bot: Bot) -> None:
    while True:
        try:
            for item in await backend.get_outbox("tg"):
                try:
                    await bot.send_message(int(item["channel_user_id"]), item.get("text") or "…")
                    await backend.mark_outbox_sent(item["id"])
                except Exception as e:  # noqa: BLE001
                    logging.warning("outbox: %s", e)
        except Exception:  # noqa: BLE001
            pass
        await asyncio.sleep(5)


async def main() -> None:
    logging.basicConfig(level=logging.INFO)
    await texts.load()
    session = AiohttpSession(proxy=settings.tg_proxy) if settings.tg_proxy else None
    if settings.tg_proxy:
        logging.info("Telegram via TG_PROXY")
    bot = Bot(settings.tg_bot_token, session=session)
    dp = Dispatcher(storage=RedisStorage.from_url(settings.redis_url))
    dp.include_router(router)
    outbox = asyncio.create_task(_outbox_loop(bot))
    try:
        await dp.start_polling(bot)
    finally:
        outbox.cancel()
        await backend.close()
        await bot.session.close()


if __name__ == "__main__":
    asyncio.run(main())
