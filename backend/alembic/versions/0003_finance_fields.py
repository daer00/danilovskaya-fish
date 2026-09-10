"""product weight, expenses, business plan

Revision ID: 0003_finance
Revises: 0002_weight
Create Date: 2026-09-02
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0003_finance"
down_revision = "0002_weight"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("products", sa.Column("weight_kg", sa.Numeric(8, 3), nullable=True))
    op.add_column("products", sa.Column("purchase_price_per_kg", sa.Numeric(12, 2), nullable=True))
    op.create_table(
        "expenses",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("spent_at", sa.Date(), nullable=False),
        sa.Column("category", sa.String(64), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("batch_id", sa.Integer(), sa.ForeignKey("batches.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        "business_plan_lines",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("month", sa.Date(), nullable=False),
        sa.Column("label", sa.String(128), nullable=False),
        sa.Column("plan_amount", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_business_plan_lines_month", "business_plan_lines", ["month"])


def downgrade() -> None:
    op.drop_index("ix_business_plan_lines_month", table_name="business_plan_lines")
    op.drop_table("business_plan_lines")
    op.drop_table("expenses")
    op.drop_column("products", "purchase_price_per_kg")
    op.drop_column("products", "weight_kg")
