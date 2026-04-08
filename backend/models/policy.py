import enum
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import ARRAY, Boolean, DateTime, Enum, ForeignKey, Integer, Numeric, String, text
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


class PolicyStatus(str, enum.Enum):
    active = "active"
    lapsed = "lapsed"
    suspended = "suspended"


class PlanType(str, enum.Enum):
    lite = "lite"
    standard = "standard"
    pro = "pro"


class PoolConfig(Base):
    __tablename__ = "pool_config"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    pool_id: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    is_enrollment_suspended: Mapped[bool] = mapped_column(Boolean, default=False)
    suspension_reason: Mapped[str | None] = mapped_column(String(255))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("NOW()"), onupdate=lambda: datetime.now(timezone.utc))


class Policy(Base):
    __tablename__ = "policies"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    worker_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("workers.id"), nullable=False)
    policy_number: Mapped[str] = mapped_column(String(30), unique=True, nullable=False)
    plan: Mapped[PlanType] = mapped_column(Enum(PlanType, name="plan_type_enum"), nullable=False)
    status: Mapped[PolicyStatus] = mapped_column(Enum(PolicyStatus, name="policy_status_enum"), default=PolicyStatus.active)
    pool_id: Mapped[str] = mapped_column(String(50), nullable=False)
    urban_tier: Mapped[int] = mapped_column(Integer, nullable=False)
    coverage_perils: Mapped[list[str]] = mapped_column(ARRAY(String), nullable=False)
    weekly_premium: Mapped[float] = mapped_column(Numeric(8, 2), nullable=False)
    max_payout_week: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    coverage_days: Mapped[int] = mapped_column(Integer, nullable=False)
    warranty_met: Mapped[bool] = mapped_column(Boolean, default=False)
    activated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    irdai_sandbox_id: Mapped[str] = mapped_column(String(30), default="SB-2026-042")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("NOW()"))

    worker = relationship("Worker", back_populates="policies")
    claims = relationship("Claim", back_populates="policy")
    premiums = relationship("PremiumRecord", back_populates="policy")
