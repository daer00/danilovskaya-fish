---
name: telegram-fastapi-crm
description: >-
  Patterns for Telegram bot + Mini App + FastAPI admin CRM (orders, batches/weeks,
  promo codes, outbox, finance). Use when starting or extending similar fish/church/
  weekly-preorder apps, or any aiogram+FastAPI+React admin monorepo; when the user
  mentions Danilovskaya, miniapp checkout, promo used_count, or Beget deploy.
---

# Telegram + FastAPI CRM patterns

Переносимый опыт из продакшена «Даниловская рыба». Для деталей конкретного репо читай его `docs/CONTEXT.md` / `AGENTS.md`, если есть.

## Когда применять

- Новый или похожий стек: **FastAPI + Postgres + Redis + aiogram 3 + React admin/miniapp**
- Недельные «партии» / дедлайн / выдача
- Обязательные промокоды или маршруты доставки по коду
- Outbox backend → bot

## Архитектура по умолчанию

```
backend/   FastAPI, SQLAlchemy 2, Alembic, scheduler
bots/      aiogram 3, FSM, Redis storage, poll outbox
frontend/  apps/admin + apps/miniapp (Vite)
infra/     compose, nginx, deploy.sh, .env*.example
docs/      CONTEXT.md (правда) · TZ.md (история) · DEPLOY_*.md
AGENTS.md  вход для агента
.cursor/rules/  короткие always/globs правила
```

## Инварианты, которые часто ломают

1. **Черновик ≠ заказ**: статус вроде `processing` не в выручке и не в `used_count`.
2. **Смена статуса ↔ счётчик промо**: consume при входе в «живой» статус, release при выходе в cancel/draft — на **каждом** PATCH status, не только create.
3. **Бот обязан слать promo** в create_order; не надеяться только на запись в черновике.
4. **Две «маржи»**: месячный баланс (cashflow) ≠ маржа партии (с себестоимостью). Назвать по-разному в UI.
5. **Месяц привязать к дате выдачи/события**, не к `created_at` заказа.
6. **Даты промо** — в TZ продукта (часто `Europe/Moscow`), не «голый UTC-день», если админ выбирает календарную дату.
7. **Одна открытая партия**; successor (+N дней) только когда после закрытия нет другой открытой.

## Поток Mini App → бот

```
Mini App POST /webapp/cart → Order(processing) + OutboundMessage(webapp_cart JSON)
Bot outbox → FSM(cart, promo_code, discount) → POST /orders → NEW + consume
```

В JSON outbox обязательно: `items`, `promo_code`, `discount`, `total`.

## Чеклист нового похожего проекта

- [ ] `AGENTS.md` + `docs/CONTEXT.md` с инвариантами
- [ ] `.cursor/rules/` core + domain globs
- [ ] Seed admin + bot texts
- [ ] Alembic с нуля; env examples без вранья про несуществующие фичи
- [ ] Admin JWT TTL осознанно; лимит сессий — либо код, либо не обещать в env
- [ ] Deploy runbook отдельно от CONTEXT

## Шаблон CONTEXT

Скопируй структуру из [reference-context-template.md](reference-context-template.md) в новый репо как `docs/CONTEXT.md` и заполни.

## Рабочий стиль с владельцем продукта

- Ответы на **русском**, объёмно по смыслу, коротко по коду.
- Не push/deploy без просьбы.
- Локальный wipe БД ≠ git commit.
