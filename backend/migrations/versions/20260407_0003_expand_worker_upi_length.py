"""Expand workers.upi_id column length for encrypted values

Revision ID: 20260407_0003
Revises: 20260405_0002
"""

from alembic import op
import sqlalchemy as sa

revision = "20260407_0003"
down_revision = "20260405_0002"
branch_labels = None
depends_on = None


def upgrade():
    op.alter_column(
        "workers",
        "upi_id",
        existing_type=sa.String(length=100),
        type_=sa.String(length=255),
        existing_nullable=True,
    )


def downgrade():
    op.alter_column(
        "workers",
        "upi_id",
        existing_type=sa.String(length=255),
        type_=sa.String(length=100),
        existing_nullable=True,
    )
