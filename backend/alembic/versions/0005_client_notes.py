"""client notes

Revision ID: 0005_notes
Revises: 0004_cash
Create Date: 2026-09-09
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0005_notes"
down_revision = "0004_cash"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("clients", sa.Column("notes", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("clients", "notes")
