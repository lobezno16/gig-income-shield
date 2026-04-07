"""Add role column to workers

Revision ID: 20260405_0002
Revises: 20260404_0001
"""

from alembic import op
import sqlalchemy as sa

revision = "20260405_0002"
down_revision = "20260404_0001"
branch_labels = None
depends_on = None


def upgrade():
    role_enum = sa.Enum("worker", "admin", "superadmin", name="user_role_enum")
    role_enum.create(op.get_bind(), checkfirst=True)
    op.add_column(
        "workers",
        sa.Column(
            "role",
            sa.Enum("worker", "admin", "superadmin", name="user_role_enum"),
            nullable=False,
            server_default="worker",
        ),
    )


def downgrade():
    op.drop_column("workers", "role")
    sa.Enum(name="user_role_enum").drop(op.get_bind(), checkfirst=True)
