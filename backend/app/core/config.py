"""Конфигурация из окружения."""

from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", case_sensitive=False)

    app_env: str = "local"
    log_level: str = "INFO"
    sentry_dsn: str | None = None

    webroot: str | None = None
    webroot_admin: str | None = None
    media_root: str = "/app/media"

    postgres_user: str = "fish"
    postgres_password: str = "change_me"
    postgres_db: str = "fish"
    postgres_host: str = "postgres"
    postgres_port: int = 5432

    redis_host: str = "redis"
    redis_port: int = 6379
    redis_db: int = 0

    jwt_secret: str = "change_me"
    jwt_access_ttl_minutes: int = 60
    jwt_refresh_ttl_days: int = 14

    tg_bot_token: str | None = None
    admin_notify_chat_id: str | None = None  # Telegram chat id для админ-уведомлений

    @property
    def database_url_async(self) -> str:
        return (
            f"postgresql+asyncpg://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )

    @property
    def database_url_sync(self) -> str:
        return (
            f"postgresql+psycopg://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )

    @property
    def redis_url(self) -> str:
        return f"redis://{self.redis_host}:{self.redis_port}/{self.redis_db}"


settings = Settings()
