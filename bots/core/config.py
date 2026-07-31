from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file="bots/.env", extra="ignore", case_sensitive=False)

    tg_bot_token: str
    tg_proxy: str | None = None
    backend_url: str = "http://localhost:8000/api/v1"
    redis_url: str = "redis://localhost:6379/1"


settings = Settings()
