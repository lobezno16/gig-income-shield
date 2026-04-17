import enum
from datetime import datetime
from uuid import UUID

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, Numeric, String, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


class PayoutStatus(str, enum.Enum):
    pending = "pending"
    settled = "settled"
    failed = "failed"
    gateway_timeout = "gateway_timeout"


class Payout(Base):
    __tablename__ = "payouts"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    claim_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("claims.id"), nullable=False, unique=True)
    worker_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("workers.id"), nullable=False)
    trigger_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("trigger_events.id"), nullable=False)
    idempotency_key: Mapped[str] = mapped_column(String(120), nullable=False, unique=True)
    provider: Mapped[str] = mapped_column(String(30), nullable=False, default="razorpay_test")
    amount: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="INR")
    status: Mapped[PayoutStatus] = mapped_column(
        Enum(PayoutStatus, name="payout_status_enum"),
        nullable=False,
        default=PayoutStatus.pending,
        server_default=PayoutStatus.pending.value,
    )
    attempt_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    gateway_payout_id: Mapped[str | None] = mapped_column(String(64))
    gateway_bank_ref: Mapped[str | None] = mapped_column(String(64))
    gateway_response: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    error_code: Mapped[str | None] = mapped_column(String(64))
    error_message: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("NOW()"))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=text("NOW()"),
        onupdate=text("NOW()"),
    )
    settled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    claim = relationship("Claim", back_populates="payout")
    worker = relationship("Worker")
    trigger = relationship("TriggerEvent")

