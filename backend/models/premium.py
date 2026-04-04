from datetime import date, datetime
from uuid import UUID

from sqlalchemy import Date, DateTime, ForeignKey, Numeric, String, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


class PremiumRecord(Base):
    __tablename__ = "premium_records"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    worker_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("workers.id"), nullable=False)
    policy_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("policies.id"), nullable=False)
    week_start: Mapped[date] = mapped_column(Date, nullable=False)
    base_formula: Mapped[float] = mapped_column(Numeric(10, 4), default=0)
    ml_adjustment: Mapped[float] = mapped_column(Numeric(6, 2), default=0)
    final_premium: Mapped[float] = mapped_column(Numeric(8, 2), nullable=False)
    shap_values: Mapped[dict] = mapped_column(JSONB, default=dict)
    bayesian_probs: Mapped[dict] = mapped_column(JSONB, default=dict)
    features: Mapped[dict] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("NOW()"))

    worker = relationship("Worker", back_populates="premiums")
    policy = relationship("Policy", back_populates="premiums")


class BayesianPosterior(Base):
    __tablename__ = "bayesian_posteriors"
    __table_args__ = (UniqueConstraint("h3_hex", "peril", name="uq_hex_peril"),)

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    h3_hex: Mapped[str] = mapped_column(String(20), nullable=False)
    peril: Mapped[str] = mapped_column(String(20), nullable=False)
    alpha: Mapped[float] = mapped_column(Numeric(10, 4), nullable=False)
    beta_param: Mapped[float] = mapped_column(Numeric(10, 4), nullable=False)
    trigger_prob: Mapped[float] = mapped_column(Numeric(6, 4), nullable=False)
    last_updated: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("NOW()"))


class BCRRecord(Base):
    __tablename__ = "bcr_records"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    pool_id: Mapped[str] = mapped_column(String(50), nullable=False)
    period_start: Mapped[date] = mapped_column(Date, nullable=False)
    period_end: Mapped[date] = mapped_column(Date, nullable=False)
    total_premiums: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    total_claims: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    bcr: Mapped[float] = mapped_column(Numeric(6, 4), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("NOW()"))


class H3RiskProfile(Base):
    __tablename__ = "h3_risk_profiles"

    h3_hex: Mapped[str] = mapped_column(String(20), primary_key=True)
    peril: Mapped[str] = mapped_column(String(20), primary_key=True)
    city: Mapped[str] = mapped_column(String(50), nullable=False)
    pool_id: Mapped[str] = mapped_column(String(50), nullable=False)
    urban_tier: Mapped[int] = mapped_column(nullable=False)
    trigger_prob_p10: Mapped[float | None] = mapped_column(Numeric(6, 4))
    trigger_prob_p50: Mapped[float | None] = mapped_column(Numeric(6, 4))
    trigger_prob_p90: Mapped[float | None] = mapped_column(Numeric(6, 4))
    historical_years: Mapped[int] = mapped_column(default=10)
    last_computed: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("NOW()"))

