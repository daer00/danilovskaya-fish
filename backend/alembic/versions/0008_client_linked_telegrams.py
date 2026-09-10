"""client linked telegrams + wider username

Revision ID: 0008_linked_tg
Revises: 0007_pickup
Create Date: 2026-09-09
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0008_linked_tg"
down_revision = "0007_pickup_slot"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("clients", "username", existing_type=sa.String(length=64), type_=sa.String(length=255))
    op.add_column("clients", sa.Column("linked_telegrams", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("clients", "linked_telegrams")
    op.alter_column("clients", "username", existing_type=sa.String(length=255), type_=sa.String(length=64))
