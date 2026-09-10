"""client messages (chat)

Revision ID: 0010_client_messages
Revises: 0009_product_unit
Create Date: 2026-09-10
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0010_client_messages"
down_revision = "0009_product_unit"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "client_messages",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("client_id", sa.BigInteger(), sa.ForeignKey("clients.id"), nullable=False),
        sa.Column("direction", sa.String(8), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_client_messages_client_id", "client_messages", ["client_id"])
    op.create_index(
        "ix_client_messages_unread",
        "client_messages",
        ["client_id"],
        postgresql_where=sa.text("direction = 'in' AND read_at IS NULL"),
    )


def downgrade() -> None:
    op.drop_index("ix_client_messages_unread", table_name="client_messages")
    op.drop_index("ix_client_messages_client_id", table_name="client_messages")
    op.drop_table("client_messages")
