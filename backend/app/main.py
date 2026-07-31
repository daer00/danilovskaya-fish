"""Точка входа FastAPI."""

from __future__ import annotations

import os
from contextlib import asynccontextmanager

import sentry_sdk
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.v1.router import api_router
from app.core.config import settings
from app.services.scheduler import start_scheduler


class SPAStaticFiles(StaticFiles):
    async def get_response(self, path: str, scope):  # type: ignore[override]
        try:
            return await super().get_response(path, scope)
        except StarletteHTTPException as exc:
            if exc.status_code == 404:
                return await super().get_response("index.html", scope)
            raise


@asynccontextmanager
async def lifespan(_app: FastAPI):
    start_scheduler()
    yield


if settings.sentry_dsn:
    sentry_sdk.init(dsn=settings.sentry_dsn, environment=settings.app_env, traces_sample_rate=0.1)

app = FastAPI(title="Даниловская рыба API", version="0.1.0", lifespan=lifespan)
app.include_router(api_router, prefix="/api/v1")


@app.get("/health", tags=["service"])
async def health() -> dict[str, str]:
    return {"status": "ok", "env": settings.app_env}


os.makedirs(settings.media_root, exist_ok=True)
app.mount("/media", StaticFiles(directory=settings.media_root), name="media")

if settings.webroot_admin and os.path.isdir(settings.webroot_admin):
    app.mount("/admin", SPAStaticFiles(directory=settings.webroot_admin, html=True), name="admin")

if settings.webroot and os.path.isdir(settings.webroot):
    app.mount("/", SPAStaticFiles(directory=settings.webroot, html=True), name="webapp")
