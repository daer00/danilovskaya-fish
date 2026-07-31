"""initial fish schema

Revision ID: 0001_fish
Revises:
Create Date: 2026-07-31
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0001_fish"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "admin_users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("email", sa.String(255), unique=True, nullable=False),
        sa.Column("full_name", sa.String(255)),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("role", sa.String(16), nullable=False),
        sa.Column("is_active", sa.Boolean(), default=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        "batches",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("deadline", sa.DateTime(timezone=True), nullable=False),
        sa.Column("pickup_date", sa.Date(), nullable=False),
        sa.Column("pickup_place", sa.String(255)),
        sa.Column("is_open", sa.Boolean(), default=True),
        sa.Column("notes", sa.Text()),
        sa.Column("deadline_warned_at", sa.DateTime(timezone=True)),
        sa.Column("closed_notified_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        "products",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("price", sa.Numeric(12, 2), nullable=False),
        sa.Column("description", sa.Text()),
        sa.Column("photo_url", sa.String(1024)),
        sa.Column("allow_halves", sa.Boolean(), default=True),
        sa.Column("is_active", sa.Boolean(), default=True),
        sa.Column("sort_order", sa.Integer(), default=0),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        "clients",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("telegram_id", sa.String(64), unique=True, nullable=False),
        sa.Column("full_name", sa.String(255)),
        sa.Column("phone", sa.String(32)),
        sa.Column("username", sa.String(64)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        "orders",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("number", sa.Integer(), nullable=False),
        sa.Column("batch_id", sa.Integer(), sa.ForeignKey("batches.id"), nullable=False),
        sa.Column("client_id", sa.BigInteger(), sa.ForeignKey("clients.id"), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("full_name", sa.String(255), nullable=False),
        sa.Column("phone", sa.String(32), nullable=False),
        sa.Column("comment", sa.Text()),
        sa.Column("total", sa.Numeric(12, 2), nullable=False),
        sa.Column("cancel_reason", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_orders_number", "orders", ["number"])
    op.create_table(
        "order_items",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("order_id", sa.BigInteger(), sa.ForeignKey("orders.id"), nullable=False),
        sa.Column("product_id", sa.Integer(), sa.ForeignKey("products.id"), nullable=False),
        sa.Column("product_name", sa.String(255), nullable=False),
        sa.Column("unit_price", sa.Numeric(12, 2), nullable=False),
        sa.Column("quantity", sa.Numeric(8, 2), nullable=False),
        sa.Column("line_total", sa.Numeric(12, 2), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        "bot_messages",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("code", sa.String(64), unique=True, nullable=False),
        sa.Column("trigger", sa.String(255), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("buttons", sa.JSON()),
        sa.Column("mode", sa.String(8)),
        sa.Column("channel_tg", sa.Boolean(), default=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        "outbound_messages",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("client_id", sa.BigInteger()),
        sa.Column("channel", sa.String(8), nullable=False),
        sa.Column("channel_user_id", sa.String(64), nullable=False),
        sa.Column("order_id", sa.BigInteger()),
        sa.Column("kind", sa.String(32)),
        sa.Column("text", sa.Text()),
        sa.Column("sent_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    for t in (
        "outbound_messages",
        "bot_messages",
        "order_items",
        "orders",
        "clients",
        "products",
        "batches",
        "admin_users",
    ):
        op.drop_table(t)
