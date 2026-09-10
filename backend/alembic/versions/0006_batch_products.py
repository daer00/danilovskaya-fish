"""batch products with per-batch prices

Revision ID: 0006_batch_products
Revises: 0005_notes
Create Date: 2026-09-09
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0006_batch_products"
down_revision = "0005_notes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "batch_products",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("batch_id", sa.Integer(), sa.ForeignKey("batches.id"), nullable=False),
        sa.Column("product_id", sa.Integer(), sa.ForeignKey("products.id"), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("sale_price", sa.Numeric(12, 2), nullable=False),
        sa.Column("purchase_price", sa.Numeric(12, 2), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("batch_id", "product_id", name="uq_batch_product"),
    )
    op.create_index("ix_batch_products_batch_id", "batch_products", ["batch_id"])
    op.create_index("ix_batch_products_product_id", "batch_products", ["product_id"])

    # Для уже существующих партий: включить все активные товары с текущими ценами каталога
    op.execute(
        """
        INSERT INTO batch_products (batch_id, product_id, enabled, sale_price, purchase_price)
        SELECT b.id, p.id, true, p.price,
               COALESCE(
                 CASE WHEN p.weight_kg IS NOT NULL AND p.purchase_price_per_kg IS NOT NULL
                      THEN ROUND(p.weight_kg * p.purchase_price_per_kg, 2)
                      ELSE p.price * 0.6 END,
                 p.price
               )
        FROM batches b
        CROSS JOIN products p
        WHERE p.is_active = true
        ON CONFLICT (batch_id, product_id) DO NOTHING
        """
    )


def downgrade() -> None:
    op.drop_index("ix_batch_products_product_id", table_name="batch_products")
    op.drop_index("ix_batch_products_batch_id", table_name="batch_products")
    op.drop_table("batch_products")
