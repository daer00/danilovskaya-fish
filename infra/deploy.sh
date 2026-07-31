#!/usr/bin/env bash
# Деплой / обновление на Beget VPS из корня репозитория или из infra/.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
INFRA="$ROOT/infra"
COMPOSE=(docker compose -p fish --env-file "$INFRA/.env.server" -f "$INFRA/docker-compose.server.yml")

cd "$ROOT"

if [[ ! -f "$INFRA/.env.server" ]]; then
  echo "Нет $INFRA/.env.server — скопируйте из .env.server.example и заполните."
  exit 1
fi

echo "==> Frontend build"
cd "$ROOT/frontend"
npm ci
npm run build

echo "==> Copy static"
mkdir -p "$INFRA/webroot" "$INFRA/webroot-admin" "$INFRA/media"
find "$INFRA/webroot" "$INFRA/webroot-admin" -mindepth 1 ! -name '.gitkeep' -delete
cp -r apps/admin/dist/. "$INFRA/webroot-admin/"
cp -r apps/miniapp/dist/. "$INFRA/webroot/"

echo "==> Docker up"
cd "$INFRA"
"${COMPOSE[@]}" --profile bots up -d --build

echo "==> Health"
sleep 2
curl -sf "http://127.0.0.1:8090/health" && echo
echo "OK. Админка: https://ВАШ-ДОМЕН/admin/  Miniapp: https://ВАШ-ДОМЕН/"
