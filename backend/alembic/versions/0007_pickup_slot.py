"""order pickup slot (1st/2nd service)

Revision ID: 0007_pickup_slot
Revises: 0006_batch_products
Create Date: 2026-09-09
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0007_pickup_slot"
down_revision = "0006_batch_products"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("orders", sa.Column("pickup_slot", sa.String(16), nullable=True))


def downgrade() -> None:
    op.drop_column("orders", "pickup_slot")
