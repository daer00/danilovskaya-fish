"""HTTP-клиент backend."""

from __future__ import annotations

import httpx

from bots.core.config import settings


class Backend:
    def __init__(self) -> None:
        headers = {"X-Bot-Token": settings.bot_api_token} if settings.bot_api_token else {}
        self._c = httpx.AsyncClient(base_url=settings.backend_url, timeout=30, headers=headers)

    async def close(self) -> None:
        await self._c.aclose()

    async def upsert_client(self, telegram_id: str, username: str | None = None) -> dict:
        r = await self._c.post("/clients/upsert", json={"telegram_id": telegram_id, "username": username})
        r.raise_for_status()
        return r.json()

    async def get_messages(self) -> list[dict]:
        r = await self._c.get("/bot-messages")
        r.raise_for_status()
        return r.json()

    async def active_batch(self) -> dict | None:
        r = await self._c.get("/batches/active")
        r.raise_for_status()
        return r.json()

    async def catalog(self) -> list[dict]:
        r = await self._c.get("/catalog")
        r.raise_for_status()
        return r.json()

    async def create_order(self, payload: dict) -> dict:
        r = await self._c.post("/orders", json=payload)
        if r.status_code >= 400:
            raise httpx.HTTPStatusError("order", request=r.request, response=r)
        return r.json()

    async def my_orders(self, telegram_id: str) -> list[dict]:
        r = await self._c.get(f"/orders/by-telegram/{telegram_id}")
        r.raise_for_status()
        return r.json()

    async def cancel(self, order_id: int, telegram_id: str) -> dict:
        r = await self._c.post(f"/orders/{order_id}/cancel", params={"telegram_id": telegram_id})
        if r.status_code >= 400:
            raise httpx.HTTPStatusError("cancel", request=r.request, response=r)
        return r.json()

    async def get_outbox(self, channel: str = "tg") -> list[dict]:
        r = await self._c.get("/outbox", params={"channel": channel})
        r.raise_for_status()
        return r.json()

    async def mark_outbox_sent(self, msg_id: int) -> None:
        r = await self._c.post(f"/outbox/{msg_id}/sent")
        r.raise_for_status()


backend = Backend()
