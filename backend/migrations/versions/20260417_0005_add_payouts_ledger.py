"""Add payouts ledger for idempotent settlement

Revision ID: 20260417_0005
Revises: 20260417_0004
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "20260417_0005"
down_revision = "20260417_0004"
branch_labels = None
depends_on = None


def upgrade():
    payout_status_enum = postgresql.ENUM(
        "pending",
        "settled",
        "failed",
        "gateway_timeout",
        name="payout_status_enum",
        create_type=False,
    )
    payout_status_enum.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "payouts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("claim_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("claims.id"), nullable=False),
        sa.Column("worker_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("workers.id"), nullable=False),
        sa.Column("trigger_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("trigger_events.id"), nullable=False),
        sa.Column("idempotency_key", sa.String(length=120), nullable=False),
        sa.Column("provider", sa.String(length=30), nullable=False, server_default="razorpay_test"),
        sa.Column("amount", sa.Numeric(10, 2), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False, server_default="INR"),
        sa.Column("status", payout_status_enum, nullable=False, server_default="pending"),
        sa.Column("attempt_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("gateway_payout_id", sa.String(length=64), nullable=True),
        sa.Column("gateway_bank_ref", sa.String(length=64), nullable=True),
        sa.Column("gateway_response", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default="{}"),
        sa.Column("error_code", sa.String(length=64), nullable=True),
        sa.Column("error_message", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
        sa.Column("settled_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("claim_id", name="uq_payouts_claim_id"),
        sa.UniqueConstraint("idempotency_key", name="uq_payouts_idempotency_key"),
    )
    op.create_index("ix_payouts_trigger_worker", "payouts", ["trigger_id", "worker_id"], unique=False)


def downgrade():
    op.drop_index("ix_payouts_trigger_worker", table_name="payouts")
    op.drop_table("payouts")
    sa.Enum(name="payout_status_enum").drop(op.get_bind(), checkfirst=True)
