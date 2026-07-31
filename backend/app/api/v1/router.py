"""Агрегатор публичного API."""

from fastapi import APIRouter

from app.api.v1 import batches, bot_messages, catalog, clients, orders, outbox
from app.api.v1.admin.router import admin_router

api_router = APIRouter()
api_router.include_router(catalog.router, prefix="/catalog", tags=["catalog"])
api_router.include_router(batches.router, prefix="/batches", tags=["batches"])
api_router.include_router(clients.router, prefix="/clients", tags=["clients"])
api_router.include_router(orders.router, prefix="/orders", tags=["orders"])
api_router.include_router(bot_messages.router, prefix="/bot-messages", tags=["bot-messages"])
api_router.include_router(outbox.router, prefix="/outbox", tags=["outbox"])
api_router.include_router(admin_router, prefix="/admin")
