"""cash entries for manual income/expense

Revision ID: 0004_cash
Revises: 0003_finance
Create Date: 2026-09-09
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0004_cash"
down_revision = "0003_finance"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "cash_entries",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("entry_type", sa.String(16), nullable=False),
        sa.Column("entry_date", sa.Date(), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("category", sa.String(64), nullable=False, server_default="прочее"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_cash_entries_date", "cash_entries", ["entry_date"])
    op.create_index("ix_cash_entries_type", "cash_entries", ["entry_type"])


def downgrade() -> None:
    op.drop_index("ix_cash_entries_type", table_name="cash_entries")
    op.drop_index("ix_cash_entries_date", table_name="cash_entries")
    op.drop_table("cash_entries")
