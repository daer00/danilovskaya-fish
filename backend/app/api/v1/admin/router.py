"""Админ API."""

from fastapi import APIRouter

from app.api.v1.admin import auth, batches, bot_messages, catalog, orders

admin_router = APIRouter()
admin_router.include_router(auth.router, prefix="/auth", tags=["admin-auth"])
admin_router.include_router(batches.router, prefix="/batches", tags=["admin-batches"])
admin_router.include_router(catalog.router, prefix="/catalog", tags=["admin-catalog"])
admin_router.include_router(orders.router, prefix="/orders", tags=["admin-orders"])
admin_router.include_router(bot_messages.router, prefix="/bot-messages", tags=["admin-bot-messages"])
