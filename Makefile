.PHONY: up down seed logs

up:
	cd infra && cp -n .env.example .env || true && docker compose up -d --build

down:
	cd infra && docker compose down

seed:
	docker compose -f infra/docker-compose.yml exec backend python -m app.seed

logs:
	docker compose -f infra/docker-compose.yml logs -f backend
