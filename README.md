# Даниловская рыба

Telegram-бот + Mini App + админка для недельного предзаказа рыбы (выдача в церкви).

Документы: [docs/TZ.md](docs/TZ.md) · [Тексты_бота_v1_1.md](Тексты_бота_v1_1.md) · [docs/DEPLOY_BEGET.md](docs/DEPLOY_BEGET.md)

## Стек

PostgreSQL 16 · Redis 7 · FastAPI · aiogram 3 (long polling + `TG_PROXY`) · React (admin + miniapp) · Docker Compose

## Быстрый старт (локально)

```bash
cd infra
cp .env.example .env
# заполните TG_BOT_TOKEN, при необходимости TG_PROXY и WEBAPP_URL
docker compose up -d --build
curl http://localhost:8000/health
# Swagger: http://localhost:8000/docs
# Админ API login: admin@fish.local / admin123
```

Админка (dev):

```bash
cd frontend && npm ci && npm run dev
# http://localhost:5174/admin/
```

Mini App (dev):

```bash
cd frontend && npm run dev:miniapp
# http://localhost:5173/
```

Бот:

```bash
cd infra
docker compose --profile bots up -d
```

## Деплой на Beget VPS

Полный runbook: [docs/DEPLOY_BEGET.md](docs/DEPLOY_BEGET.md)

Кратко на сервере:

```bash
cd infra && cp .env.server.example .env.server   # заполнить секреты
../infra/deploy.sh                              # из корня: ./infra/deploy.sh
# Nginx + certbot — см. docs/DEPLOY_BEGET.md
```

## Структура

```
backend/   API, модели, seed, scheduler
bots/      Telegram (aiogram)
frontend/  Admin SPA + Mini App
infra/     Docker Compose, nginx, deploy.sh
docs/      ТЗ и деплой
```
