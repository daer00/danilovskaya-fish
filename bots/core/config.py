from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file="bots/.env", extra="ignore", case_sensitive=False)

    tg_bot_token: str
    tg_proxy: str | None = None
    backend_url: str = "http://localhost:8000/api/v1"
    bot_api_token: str | None = None
    redis_url: str = "redis://localhost:6379/1"
    webapp_url: str | None = None


settings = Settings()
