# Деплой на Beget VPS

## GitHub

```bash
# на Mac: brew install gh && gh auth login
cd ~/Documents/Danilovskaya_fish
git add -A && git commit -m "feat: MVP Даниловская рыба"
gh repo create danilovskaya-fish --private --source=. --remote=origin --push
```

Дальше на сервере: `git clone` этого репозитория (см. ниже).


1. **Beget VPS** с Docker (не обычный «виртуальный хостинг»). Бюджет ориентир ~1500 ₽/мес.
2. Домен → A-запись на IP VPS.
3. Из‑за блокировок Telegram в РФ нужен **`TG_PROXY`**: SOCKS5/HTTP прокси или маленький зарубежный VPS-релей к `api.telegram.org`. Без прокси бот на Beget часто «молчит».

Бот работает в режиме **long polling** (не webhook) — исходящие запросы через прокси.

## Подготовка сервера

```bash
# Ubuntu 22.04/24.04
sudo apt update && sudo apt install -y docker.io docker-compose-v2 git nginx certbot python3-certbot-nginx
sudo usermod -aG docker $USER   # затем перелогиньтесь
```

## Код

```bash
git clone https://github.com/<ВАШ_USER>/danilovskaya-fish.git
cd danilovskaya-fish/infra
cp .env.example .env.server
nano .env.server   # пароли, JWT_SECRET, TG_BOT_TOKEN, TG_PROXY, ADMIN_NOTIFY_CHAT_ID
```

Соберите админку и положите в `infra/webroot-admin`:

```bash
cd ../frontend && npm ci && npm run build
mkdir -p ../infra/webroot-admin
cp -r apps/admin/dist/* ../infra/webroot-admin/
```

Запуск:

```bash
cd ../infra
docker compose -p fish --env-file .env.server -f docker-compose.server.yml --profile bots up -d --build
curl http://127.0.0.1:8090/health
```

Админка: после HTTPS-прокси — `https://ваш-домен/admin/`  
Логин после seed: `admin@fish.local` / `admin123` — **смените пароль** (пока через БД/повторный seed со своим хешем).

## Nginx + HTTPS (пример)

```nginx
server {
  listen 80;
  server_name fish.example.ru;
  location / {
    proxy_pass http://127.0.0.1:8090;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
  }
}
```

```bash
sudo certbot --nginx -d fish.example.ru
```

## Обновление

```bash
cd ~/danilovskaya-fish
git pull
cd frontend && npm ci && npm run build
rm -rf ../infra/webroot-admin/* && cp -r apps/admin/dist/* ../infra/webroot-admin/
cd ../infra
docker compose -p fish --env-file .env.server -f docker-compose.server.yml --profile bots up -d --build
```

## Переменные `.env.server`

| Ключ | Назначение |
|------|------------|
| `POSTGRES_*` | БД |
| `JWT_SECRET` | длинная случайная строка |
| `TG_BOT_TOKEN` | от @BotFather |
| `TG_PROXY` | `socks5://user:pass@host:port` или `http://…` |
| `ADMIN_NOTIFY_CHAT_ID` | id чата/группы для админ-уведомлений |

## Прокси Telegram

Минимальный зарубежный VPS + Caddy/Nginx reverse proxy на `api.telegram.org`, доступ только с IP Beget. В `TG_PROXY` укажите этот релей (или готовый SOCKS5).

## Бэкапы

```bash
docker exec fish-postgres-1 pg_dump -U fish fish > backup_$(date +%F).sql
```
