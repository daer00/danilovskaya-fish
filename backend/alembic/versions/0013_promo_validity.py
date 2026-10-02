"""promo valid_from / valid_until

Revision ID: 0013_promo_validity
Revises: 0012_promo_codes
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0013_promo_validity"
down_revision = "0012_promo_codes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("promo_codes", sa.Column("valid_from", sa.DateTime(timezone=True), nullable=True))
    op.add_column("promo_codes", sa.Column("valid_until", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("promo_codes", "valid_until")
    op.drop_column("promo_codes", "valid_from")
