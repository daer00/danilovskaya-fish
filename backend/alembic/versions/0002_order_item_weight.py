"""order item actual weight

Revision ID: 0002_weight
Revises: 0001_fish
Create Date: 2026-08-01
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0002_weight"
down_revision = "0001_fish"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("order_items", sa.Column("actual_weight_kg", sa.Numeric(8, 3), nullable=True))


def downgrade() -> None:
    op.drop_column("order_items", "actual_weight_kg")
