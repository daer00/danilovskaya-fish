"""Хелперы клиентов: ники и связанные Telegram."""

from __future__ import annotations

import re

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.client import Client

_NICK_SPLIT = re.compile(r"[·,;/|]+")


def parse_nicks(raw: str | None) -> list[str]:
    out: list[str] = []
    for part in _NICK_SPLIT.split(raw or ""):
        n = part.strip().lstrip("@").strip()
        if n and n not in out:
            out.append(n)
    return out


def join_nicks(nicks: list[str]) -> str | None:
    clean: list[str] = []
    for n in nicks:
        x = n.strip().lstrip("@")
        if x and x not in clean:
            clean.append(x)
    return " · ".join(clean)[:255] if clean else None


def parse_links(raw: str | None) -> list[str]:
    if not raw:
        return []
    return [x for x in raw.split("|") if x]


def join_links(ids: list[str]) -> str | None:
    clean: list[str] = []
    for i in ids:
        s = str(i).strip()
        if s and s not in clean:
            clean.append(s)
    return f"|{'|'.join(clean)}|" if clean else None


def merge_nicks(*raws: str | None) -> str | None:
    nicks: list[str] = []
    for raw in raws:
        for n in parse_nicks(raw):
            if n not in nicks:
                nicks.append(n)
    return join_nicks(nicks)


async def find_by_telegram(session: AsyncSession, telegram_id: str) -> Client | None:
    tg = str(telegram_id)
    return await session.scalar(
        select(Client).where(
            or_(Client.telegram_id == tg, Client.linked_telegrams.contains(f"|{tg}|"))
        )
    )
