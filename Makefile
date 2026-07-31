.PHONY: up down seed logs deploy-server

up:
	cd infra && cp -n .env.example .env || true && docker compose up -d --build

down:
	cd infra && docker compose down

seed:
	docker compose -f infra/docker-compose.yml exec backend python -m app.seed

logs:
	docker compose -f infra/docker-compose.yml logs -f backend

deploy-server:
	./infra/deploy.sh
