# Даниловская рыба — деплой на Beget VPS

## GitHub

```bash
# на Mac: brew install gh && gh auth login
cd ~/Documents/Danilovskaya_fish
git add -A && git commit -m "feat: MVP Даниловская рыба"
gh repo create danilovskaya-fish --private --source=. --remote=origin --push
```

Дальше на сервере: `git clone` этого репозитория.

## Что арендовать

1. **Beget VPS** с Docker (не обычный «виртуальный хостинг»). Бюджет ориентир ~1500 ₽/мес.
2. Домен → A-запись на IP VPS.
3. Из‑за блокировок Telegram в РФ нужен **`TG_PROXY`**: SOCKS5/HTTP прокси или маленький зарубежный VPS-релей к `api.telegram.org`. Без прокси бот на Beget часто «молчит».

Бот работает в режиме **long polling** (не webhook) — исходящие запросы через прокси.

## Подготовка сервера (один раз)

```bash
# Ubuntu 22.04/24.04
sudo apt update && sudo apt install -y docker.io docker-compose-v2 git nginx certbot python3-certbot-nginx nodejs npm
sudo usermod -aG docker $USER   # затем перелогиньтесь

# Node 20+ (если apt дал старый):
# curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
# sudo apt install -y nodejs
```

Опционально закрыть прямой доступ к API снаружи (compose уже биндит `127.0.0.1:8090`):

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

## Код и env

```bash
git clone https://github.com/daer00/danilovskaya-fish.git
cd danilovskaya-fish/infra
cp .env.server.example .env.server
nano .env.server
```

Обязательно задайте:

| Ключ | Назначение |
|------|------------|
| `APP_ENV=production` | прод |
| `POSTGRES_PASSWORD` | сильный пароль |
| `JWT_SECRET` | длинная случайная строка |
| `TG_BOT_TOKEN` | от @BotFather |
| `TG_PROXY` | `socks5://user:pass@host:port` или `http://…` |
| `ADMIN_NOTIFY_CHAT_ID` | id чата/группы для админ-уведомлений |
| `WEBAPP_URL` | `https://ваш-домен/` (после HTTPS) |

## Первый запуск (скрипт)

```bash
cd ~/danilovskaya-fish
chmod +x infra/deploy.sh
./infra/deploy.sh
curl http://127.0.0.1:8090/health
```

Скрипт соберёт admin + miniapp, положит в `infra/webroot-admin` и `infra/webroot`, поднимет postgres/redis/backend/bot.

Вручную то же самое:

```bash
cd frontend && npm ci && npm run build
mkdir -p ../infra/webroot-admin ../infra/webroot ../infra/media
cp -r apps/admin/dist/* ../infra/webroot-admin/
cp -r apps/miniapp/dist/* ../infra/webroot/
cd ../infra
docker compose -p fish --env-file .env.server -f docker-compose.server.yml --profile bots up -d --build
```

Логин после seed: `admin@fish.local` / `admin123` — **смените пароль**.

## Nginx + HTTPS

```bash
# подставьте свой домен в конфиге
sudo sed 's/fish.example.ru/ВАШ-ДОМЕН/g' infra/nginx/fish.conf \
  | sudo tee /etc/nginx/sites-available/fish
sudo ln -sf /etc/nginx/sites-available/fish /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d ВАШ-ДОМЕН
```

После выдачи сертификата пропишите в `.env.server`:

```env
WEBAPP_URL=https://ВАШ-ДОМЕН/
```

и перезапустите бота:

```bash
cd infra
docker compose -p fish --env-file .env.server -f docker-compose.server.yml --profile bots up -d
```

## Telegram

1. @BotFather → Bot Settings → Configure Mini App / Domain → ваш HTTPS-домен.
2. Проверьте кнопку «Каталог» в боте (`WEBAPP_URL`).
3. Проверьте уведомления в `ADMIN_NOTIFY_CHAT_ID`.

URL после HTTPS:

- Mini App: `https://ваш-домен/`
- Админка: `https://ваш-домен/admin/`
- API health: `https://ваш-домен/health`

## Обновление

```bash
cd ~/danilovskaya-fish
git pull
./infra/deploy.sh
```

## Прокси Telegram

Минимальный зарубежный VPS + Caddy/Nginx reverse proxy на `api.telegram.org`, доступ только с IP Beget. В `TG_PROXY` укажите этот релей (или готовый SOCKS5).

## Бэкапы

```bash
# разовый дамп
docker exec fish-postgres-1 pg_dump -U fish fish > backup_$(date +%F).sql

# cron каждый день в 3:00
# 0 3 * * * docker exec fish-postgres-1 pg_dump -U fish fish > /var/backups/fish_$(date +\%F).sql
```

## Чеклист перед продом

- [ ] Сильные `POSTGRES_PASSWORD` и `JWT_SECRET`
- [ ] `TG_BOT_TOKEN` + рабочий `TG_PROXY`
- [ ] HTTPS (certbot) и `WEBAPP_URL=https://…/`
- [ ] Домен Mini App в BotFather
- [ ] Сменён пароль `admin@fish.local`
- [ ] `ADMIN_NOTIFY_CHAT_ID` проверен
- [ ] Порт 8090 не торчит наружу (bind на `127.0.0.1`)
