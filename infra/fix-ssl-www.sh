#!/usr/bin/env bash
# На VPS: починить www + SSL, чтобы админка открывалась с телефонов.
# Запуск: bash infra/fix-ssl-www.sh
set -euo pipefail

DOMAIN="${DOMAIN:-danilovskayaryba.ru}"

echo "==> Certificate for $DOMAIN + www.$DOMAIN"
sudo certbot --nginx -d "$DOMAIN" -d "www.$DOMAIN" --expand --non-interactive --agree-tos --redirect || \
  sudo certbot --nginx -d "$DOMAIN" -d "www.$DOMAIN" --expand --redirect

echo "==> Nginx test + reload"
sudo nginx -t
sudo systemctl reload nginx

echo "==> Check"
curl -sI "https://$DOMAIN/admin/" | head -5
curl -sI "https://www.$DOMAIN/admin/" | head -8 || true
echo "OK. Открывайте на телефоне: https://$DOMAIN/admin/"
