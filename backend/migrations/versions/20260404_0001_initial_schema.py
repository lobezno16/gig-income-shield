"""Initial Soteria schema

Revision ID: 20260404_0001
Revises:
Create Date: 2026-04-04 20:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "20260404_0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS postgis;")
    op.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto;")

    platform_enum = sa.Enum("zepto", "zomato", "swiggy", "blinkit", name="platform_enum")
    worker_tier_enum = sa.Enum("gold", "silver", "bronze", "restricted", name="worker_tier_enum")
    policy_status_enum = sa.Enum("active", "lapsed", "suspended", name="policy_status_enum")
    plan_type_enum = sa.Enum("lite", "standard", "pro", name="plan_type_enum")
    peril_type_enum = sa.Enum("aqi", "rain", "heat", "flood", "storm", "curfew", "store", name="peril_type_enum")
    claim_status_enum = sa.Enum("processing", "approved", "paid", "flagged", "blocked", name="claim_status_enum")

    platform_enum.create(op.get_bind(), checkfirst=True)
    worker_tier_enum.create(op.get_bind(), checkfirst=True)
    policy_status_enum.create(op.get_bind(), checkfirst=True)
    plan_type_enum.create(op.get_bind(), checkfirst=True)
    peril_type_enum.create(op.get_bind(), checkfirst=True)
    claim_status_enum.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "workers",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("phone", sa.String(15), nullable=False, unique=True),
        sa.Column("name", sa.String(100), nullable=True),
        sa.Column("platform", platform_enum, nullable=False),
        sa.Column("platform_id", sa.String(50), nullable=True),
        sa.Column("city", sa.String(50), nullable=False),
        sa.Column("h3_hex", sa.String(20), nullable=False),
        sa.Column("upi_id", sa.String(100), nullable=True),
        sa.Column("tier", worker_tier_enum, nullable=False, server_default="silver"),
        sa.Column("active_days_30", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("total_deliveries", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("trust_score_floor", sa.Numeric(3, 2), nullable=False, server_default="0.40"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
    )

    op.create_table(
        "pool_config",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("pool_id", sa.String(50), nullable=False, unique=True),
        sa.Column("is_enrollment_suspended", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("suspension_reason", sa.String(255), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
    )

    op.create_table(
        "policies",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("worker_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("workers.id"), nullable=False),
        sa.Column("policy_number", sa.String(30), nullable=False, unique=True),
        sa.Column("plan", plan_type_enum, nullable=False),
        sa.Column("status", policy_status_enum, nullable=False, server_default="active"),
        sa.Column("pool_id", sa.String(50), nullable=False),
        sa.Column("urban_tier", sa.Integer(), nullable=False),
        sa.Column("coverage_perils", postgresql.ARRAY(sa.String()), nullable=False),
        sa.Column("weekly_premium", sa.Numeric(8, 2), nullable=False),
        sa.Column("max_payout_week", sa.Numeric(10, 2), nullable=False),
        sa.Column("coverage_days", sa.Integer(), nullable=False),
        sa.Column("warranty_met", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("activated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("irdai_sandbox_id", sa.String(30), nullable=False, server_default="SB-2026-042"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
    )

    op.create_table(
        "trigger_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("peril", peril_type_enum, nullable=False),
        sa.Column("source", sa.String(30), nullable=False),
        sa.Column("reading_value", sa.Numeric(10, 2), nullable=False),
        sa.Column("trigger_level", sa.Integer(), nullable=False),
        sa.Column("payout_pct", sa.Numeric(4, 2), nullable=False),
        sa.Column("city", sa.String(50), nullable=False),
        sa.Column("h3_hex", sa.String(20), nullable=False),
        sa.Column("workers_affected", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("total_payout_inr", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("triggered_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
    )

    op.create_table(
        "claims",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("claim_number", sa.String(30), nullable=False, unique=True),
        sa.Column("worker_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("workers.id"), nullable=False),
        sa.Column("policy_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("policies.id"), nullable=False),
        sa.Column("trigger_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("trigger_events.id"), nullable=False),
        sa.Column("status", claim_status_enum, nullable=False, server_default="processing"),
        sa.Column("payout_amount", sa.Numeric(10, 2), nullable=False),
        sa.Column("payout_pct", sa.Numeric(4, 2), nullable=False),
        sa.Column("fraud_score", sa.Numeric(4, 2), nullable=True),
        sa.Column("fraud_flags", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default="[]"),
        sa.Column("argus_layers", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default="{}"),
        sa.Column("upi_ref", sa.String(50), nullable=True),
        sa.Column("settled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
    )

    op.create_table(
        "premium_records",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("worker_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("workers.id"), nullable=False),
        sa.Column("policy_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("policies.id"), nullable=False),
        sa.Column("week_start", sa.Date(), nullable=False),
        sa.Column("base_formula", sa.Numeric(10, 4), nullable=True),
        sa.Column("ml_adjustment", sa.Numeric(6, 2), nullable=False, server_default="0"),
        sa.Column("final_premium", sa.Numeric(8, 2), nullable=False),
        sa.Column("shap_values", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default="{}"),
        sa.Column("bayesian_probs", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default="{}"),
        sa.Column("features", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
    )

    op.create_table(
        "bayesian_posteriors",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("h3_hex", sa.String(20), nullable=False),
        sa.Column("peril", sa.String(20), nullable=False),
        sa.Column("alpha", sa.Numeric(10, 4), nullable=False),
        sa.Column("beta_param", sa.Numeric(10, 4), nullable=False),
        sa.Column("trigger_prob", sa.Numeric(6, 4), nullable=False),
        sa.Column("last_updated", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
        sa.UniqueConstraint("h3_hex", "peril", name="uq_hex_peril"),
    )

    op.create_table(
        "bcr_records",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("pool_id", sa.String(50), nullable=False),
        sa.Column("period_start", sa.Date(), nullable=False),
        sa.Column("period_end", sa.Date(), nullable=False),
        sa.Column("total_premiums", sa.Numeric(14, 2), nullable=False),
        sa.Column("total_claims", sa.Numeric(14, 2), nullable=False),
        sa.Column("bcr", sa.Numeric(6, 4), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
    )

    op.create_table(
        "h3_risk_profiles",
        sa.Column("h3_hex", sa.String(20), primary_key=True),
        sa.Column("peril", sa.String(20), primary_key=True),
        sa.Column("city", sa.String(50), nullable=False),
        sa.Column("pool_id", sa.String(50), nullable=False),
        sa.Column("urban_tier", sa.Integer(), nullable=False),
        sa.Column("trigger_prob_p10", sa.Numeric(6, 4), nullable=True),
        sa.Column("trigger_prob_p50", sa.Numeric(6, 4), nullable=True),
        sa.Column("trigger_prob_p90", sa.Numeric(6, 4), nullable=True),
        sa.Column("historical_years", sa.Integer(), nullable=False, server_default="10"),
        sa.Column("last_computed", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
    )


def downgrade() -> None:
    op.drop_table("h3_risk_profiles")
    op.drop_table("bcr_records")
    op.drop_table("bayesian_posteriors")
    op.drop_table("premium_records")
    op.drop_table("claims")
    op.drop_table("trigger_events")
    op.drop_table("policies")
    op.drop_table("pool_config")
    op.drop_table("workers")

    sa.Enum(name="claim_status_enum").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="peril_type_enum").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="plan_type_enum").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="policy_status_enum").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="worker_tier_enum").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="platform_enum").drop(op.get_bind(), checkfirst=True)

