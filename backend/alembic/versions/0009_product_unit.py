"""product unit pcs/kg

Revision ID: 0009_product_unit
Revises: 0008_linked_tg
Create Date: 2026-09-10
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0009_product_unit"
down_revision = "0008_linked_tg"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "products",
        sa.Column("unit", sa.String(length=8), nullable=False, server_default="pcs"),
    )


def downgrade() -> None:
    op.drop_column("products", "unit")
