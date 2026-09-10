"""product default purchase_price

Revision ID: 0011_product_purchase
Revises: 0010_client_messages
Create Date: 2026-09-10
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0011_product_purchase"
down_revision = "0010_client_messages"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("products", sa.Column("purchase_price", sa.Numeric(12, 2), nullable=True))
    # Перенос ориентира: кг → как есть; штуки с весом → закупка за шт
    op.execute(
        """
        UPDATE products
        SET purchase_price = CASE
            WHEN unit = 'kg' AND purchase_price_per_kg IS NOT NULL THEN purchase_price_per_kg
            WHEN weight_kg IS NOT NULL AND purchase_price_per_kg IS NOT NULL
                THEN ROUND(weight_kg * purchase_price_per_kg, 2)
            ELSE NULL
        END
        WHERE purchase_price IS NULL
        """
    )


def downgrade() -> None:
    op.drop_column("products", "purchase_price")
