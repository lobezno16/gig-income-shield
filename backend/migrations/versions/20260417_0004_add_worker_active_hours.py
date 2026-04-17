"""Add worker active-hour fields for trigger-hour eligibility

Revision ID: 20260417_0004
Revises: 20260407_0003
"""

from alembic import op
import sqlalchemy as sa

revision = "20260417_0004"
down_revision = "20260407_0003"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "workers",
        sa.Column("shift_start_hour", sa.Integer(), nullable=False, server_default="8"),
    )
    op.add_column(
        "workers",
        sa.Column("shift_end_hour", sa.Integer(), nullable=False, server_default="23"),
    )
    op.create_check_constraint(
        "ck_workers_shift_start_hour",
        "workers",
        "shift_start_hour >= 0 AND shift_start_hour <= 23",
    )
    op.create_check_constraint(
        "ck_workers_shift_end_hour",
        "workers",
        "shift_end_hour >= 0 AND shift_end_hour <= 23",
    )


def downgrade():
    op.drop_constraint("ck_workers_shift_end_hour", "workers", type_="check")
    op.drop_constraint("ck_workers_shift_start_hour", "workers", type_="check")
    op.drop_column("workers", "shift_end_hour")
    op.drop_column("workers", "shift_start_hour")

