"""Логин админки. Сессии независимы: один аккаунт — любое число устройств."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.admin.deps import CurrentAdmin
from app.core.database import get_session
from app.core.security import create_access_token, create_refresh_token, decode_token, verify_password
from app.enums import AdminRole
from app.models.admin_user import AdminUser

router = APIRouter()


class LoginIn(BaseModel):
    email: str
    password: str


class RefreshIn(BaseModel):
    refresh_token: str


class TokenOut(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    role: AdminRole
    full_name: str | None


class MeOut(BaseModel):
    id: int
    email: str
    full_name: str | None
    role: AdminRole


def _tokens(user: AdminUser) -> TokenOut:
    return TokenOut(
        access_token=create_access_token(str(user.id), user.role),
        refresh_token=create_refresh_token(str(user.id)),
        role=user.role,
        full_name=user.full_name,
    )


@router.post("/login", response_model=TokenOut)
async def login(payload: LoginIn, session: Annotated[AsyncSession, Depends(get_session)]) -> TokenOut:
    user = await session.scalar(select(AdminUser).where(AdminUser.email == payload.email))
    valid = user and user.is_active and verify_password(payload.password, user.password_hash)
    if not valid:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Неверная почта или пароль")
    # Старые токены на других устройствах не сбрасываем — можно сидеть параллельно.
    return _tokens(user)


@router.post("/refresh", response_model=TokenOut)
async def refresh(payload: RefreshIn, session: Annotated[AsyncSession, Depends(get_session)]) -> TokenOut:
    data = decode_token(payload.refresh_token)
    if not data or data.get("type") != "refresh":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Недействительный refresh-токен")
    user = await session.get(AdminUser, int(data.get("sub", 0)))
    if user is None or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Пользователь недоступен")
    return _tokens(user)


@router.get("/me", response_model=MeOut)
async def me(user: CurrentAdmin) -> MeOut:
    return MeOut(id=user.id, email=user.email, full_name=user.full_name, role=user.role)
