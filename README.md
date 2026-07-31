# Даниловская рыба

Telegram-бот + админка для недельного предзаказа рыбы (выдача в церкви).

Документы: [docs/TZ.md](docs/TZ.md) · [Тексты_бота_v1_1.md](Тексты_бота_v1_1.md) · [docs/DEPLOY_BEGET.md](docs/DEPLOY_BEGET.md)

## Стек

PostgreSQL 16 · Redis 7 · FastAPI · aiogram 3 (long polling + `TG_PROXY`) · React-админка · Docker Compose

## Быстрый старт

```bash
cd infra
cp .env.example .env
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

Бот (нужен токен):

```bash
# bots/.env: TG_BOT_TOKEN, BACKEND_URL=http://localhost:8000/api/v1, REDIS_URL=redis://localhost:6379/1
pip install -r bots/requirements.txt
python -m bots.run
```

## Структура

```
backend/   API, модели, seed, scheduler
bots/      Telegram (aiogram)
frontend/  Admin SPA
infra/     Docker Compose
docs/      ТЗ и деплой
```
