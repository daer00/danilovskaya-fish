# Telegram-бот

```bash
# из корня репо
cp infra/.env.example bots/.env   # или создайте вручную
# bots/.env:
# TG_BOT_TOKEN=...
# TG_PROXY=socks5://...   # на Beget обычно нужен
# BACKEND_URL=http://localhost:8000/api/v1
# REDIS_URL=redis://localhost:6379/1

pip install -r bots/requirements.txt
PYTHONPATH=. python -m bots.run
```

Режим: long polling + outbox (backend не ходит в Telegram напрямую).
