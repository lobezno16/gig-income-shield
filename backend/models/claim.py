import enum
from datetime import datetime
from uuid import UUID

from sqlalchemy import DateTime, Enum, ForeignKey, Numeric, String, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


class ClaimStatus(str, enum.Enum):
    processing = "processing"
    approved = "approved"
    paid = "paid"
    flagged = "flagged"
    blocked = "blocked"


class Claim(Base):
    __tablename__ = "claims"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    claim_number: Mapped[str] = mapped_column(String(30), unique=True, nullable=False)
    worker_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("workers.id"), nullable=False)
    policy_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("policies.id"), nullable=False)
    trigger_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("trigger_events.id"), nullable=False)
    status: Mapped[ClaimStatus] = mapped_column(Enum(ClaimStatus, name="claim_status_enum"), default=ClaimStatus.processing)
    payout_amount: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    payout_pct: Mapped[float] = mapped_column(Numeric(4, 2), nullable=False)
    fraud_score: Mapped[float | None] = mapped_column(Numeric(4, 2))
    fraud_flags: Mapped[dict] = mapped_column(JSONB, default=list)
    argus_layers: Mapped[dict] = mapped_column(JSONB, default=dict)
    upi_ref: Mapped[str | None] = mapped_column(String(50))
    settled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("NOW()"))

    worker = relationship("Worker", back_populates="claims")
    policy = relationship("Policy", back_populates="claims")
    trigger = relationship("TriggerEvent", back_populates="claims")
    payout = relationship("Payout", back_populates="claim", uselist=False)
