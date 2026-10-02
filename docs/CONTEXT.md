# CONTEXT — Даниловская рыба (актуальная правда)

> Единый снимок продукта для людей и ИИ. При конфликте с `TZ.md` — этот файл и код.
> Обновляй при смене инвариантов (промо, статусы, финансы, партии).

## 1. Продукт

Недельный предзаказ рыбы через Telegram (бот + Mini App) и веб-админку.  
Выдача в церкви (холл), оплата при получении.  
Прод: `danilovskayaryba.ru` · репо: `daer00/danilovskaya-fish`.

## 2. Стек

| Слой | Технологии |
|------|------------|
| Backend | Python 3.12, FastAPI, SQLAlchemy 2, Alembic, Redis, APScheduler |
| Bot | aiogram 3, long polling, outbox (`OutboundMessage`) |
| Frontend | React 18, Vite 6, TS — `admin` + `miniapp` (npm workspaces) |
| Infra | Postgres 16, Redis 7, Docker Compose, nginx на Beget |

Локально: `infra/docker-compose.yml` · админ seed: `admin@fish.local` / `admin123`.

## 3. Сущности (кратко)

- **Batch** — партия: `deadline`, `pickup_date`, `is_open`, товары через `BatchProduct` (sale/purchase).
- **Product** — глобальный каталог; в продаже только enabled в открытой партии.
- **Order** — статусы + `promo_code`, `discount`, `total` (после скидки), позиции с `line_total`.
- **PromoCode** — `percent` \| `fixed`, `max_uses`, `used_count`, `valid_from`/`valid_until` (календарь **Europe/Moscow**).
- **Client**, **CashEntry**, **Expense**, **BotMessage**, **OutboundMessage**.

## 4. Статусы заказа

| Код | Смысл |
|-----|--------|
| `processing` | Черновик корзины из Mini App (ещё не заказ) |
| `new` | Принят, ждёт подтверждения админом |
| `confirmed` | Подтверждён |
| `ready` | Готов к выдаче |
| `completed` | Выдан |
| `cancelled` | Отменён |

- Клиент: создаёт `processing` → в боте подтверждает → `new`. Отмена клиентом: `new`/`processing` до дедлайна.
- Админ: может поставить **любой** статус; create по умолчанию → `confirmed`.
- Админ **может** создать заказ после дедлайна (телефон) — намеренно.

## 5. Промокоды (инварианты)

1. Промокод **обязателен** при оформлении (миниапп, бот, админ-создание).
2. `used_count` крутится только когда статус «потребляющий»: всё кроме `processing` и `cancelled`.
3. При **любой** смене статуса админом — `sync_promo_on_status_change` (consume/release).
4. Черновик не списывает лимит; подтверждение (`NEW`) — списывает.
5. Правка позиций: пересчитать скидку из типа промо (`percent` заново, `fixed` с капом по сабтоталу).
6. Бот обязан прокидывать `promo_code` в FSM → `create_order` (не полагаться только на PROCESSING).

Код: `backend/app/services/promos.py`.

## 6. Финансы (инварианты)

| Метрика | Формула | Где |
|---------|---------|-----|
| Выручка / KPI | `sum(Order.total)` без `cancelled` и `processing` | месяц, партия |
| Месяц | по `Batch.pickup_date`, не по `Order.created_at` | `/admin/finance/overview` |
| **Баланс** (главная / Деньги) | получения (выручка+cash income) − траты (cash+expenses) | **без** себестоимости рыбы |
| **Маржа партии** | выручка − закупка − расходы партии | карточка партии |
| Суммы по товарам | `sum(line_total)` = **до** скидки | подпись «до скидки» |

Не смешивать «Баланс» и «Маржа партии».

## 7. Партии

- Одновременно одна `is_open`.
- По дедлайну scheduler закрывает и вызывает `open_successor_batch` (+14 дней).
- Ручное закрытие текущей → тоже successor.
- Создание **новой** открытой / открытие другой существующей закрывает старые **без** лишнего successor (открытая уже есть).

## 8. Потоки клиента

```
Mini App → POST /webapp/cart (processing + promo)
       → outbox webapp_cart → бот FSM (promo в state)
       → POST /orders → NEW + consume_promo
```

Альтернатива `sendData` — тот же FSM с `promo_code` в payload.

## 9. Auth админки

- JWT access ~30 дней, refresh ~180 дней.
- Лимита устройств нет (не обещать `ADMIN_MAX_SESSIONS`).

## 10. Деплой и данные

- Прод не трогать без явной просьбы.
- Wipe локальной БД: обычно оставить `bot_messages` + `admin_users`, очистить media.
- Миграции: Alembic в контейнере backend.

## 11. UX / код-стиль (этот продукт)

- UI и тексты ошибок — на русском.
- Меньше кода; без лишних абстракций.
- Админка: существующий visual language, не «AI-purple» редизайн без запроса.
- Mini App: светлая/тёмная тема, корзина в localStorage.

## 12. Известные осознанные исключения

- Админ обходит дедлайн/`is_open` при создании заказа.
- Нативный каталог бота без WEBAPP — промокод спрашивается текстом в FSM.
- `TZ.md` устарел (там нет `processing`, miniapp «вне MVP», финансы «в Excel»).
