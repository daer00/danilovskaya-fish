"""promo codes + order discount fields

Revision ID: 0012_promo_codes
Revises: 0011_product_purchase
Create Date: 2026-10-02
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0012_promo_codes"
down_revision = "0011_product_purchase"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "promo_codes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("code", sa.String(64), nullable=False),
        sa.Column("title", sa.String(255)),
        sa.Column("discount_type", sa.String(16), nullable=False, server_default="percent"),
        sa.Column("discount_value", sa.Numeric(12, 2), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true")),
        sa.Column("max_uses", sa.Integer()),
        sa.Column("used_count", sa.Integer(), server_default="0"),
        sa.Column("notes", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True)),
        sa.Column("updated_at", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_promo_codes_code", "promo_codes", ["code"], unique=True)
    op.add_column("orders", sa.Column("promo_code", sa.String(64), nullable=True))
    op.add_column("orders", sa.Column("discount", sa.Numeric(12, 2), server_default="0", nullable=False))


def downgrade() -> None:
    op.drop_column("orders", "discount")
    op.drop_column("orders", "promo_code")
    op.drop_index("ix_promo_codes_code", table_name="promo_codes")
    op.drop_table("promo_codes")
