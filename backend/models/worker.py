import enum
from datetime import datetime
from uuid import UUID

from sqlalchemy import Boolean, CheckConstraint, DateTime, Enum, Integer, Numeric, String, text
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base
from models.user import UserRole


class Platform(str, enum.Enum):
    zepto = "zepto"
    zomato = "zomato"
    swiggy = "swiggy"
    blinkit = "blinkit"


class WorkerTier(str, enum.Enum):
    gold = "gold"
    silver = "silver"
    bronze = "bronze"
    restricted = "restricted"


class Worker(Base):
    __tablename__ = "workers"
    __table_args__ = (
        CheckConstraint("shift_start_hour >= 0 AND shift_start_hour <= 23", name="ck_workers_shift_start_hour"),
        CheckConstraint("shift_end_hour >= 0 AND shift_end_hour <= 23", name="ck_workers_shift_end_hour"),
    )

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    phone: Mapped[str] = mapped_column(String(15), unique=True, nullable=False)
    name: Mapped[str | None] = mapped_column(String(100))
    platform: Mapped[Platform] = mapped_column(Enum(Platform, name="platform_enum"), nullable=False)
    platform_id: Mapped[str | None] = mapped_column(String(50))
    city: Mapped[str] = mapped_column(String(50), nullable=False)
    h3_hex: Mapped[str] = mapped_column(String(20), nullable=False)
    upi_id: Mapped[str | None] = mapped_column(String(255))
    tier: Mapped[WorkerTier] = mapped_column(Enum(WorkerTier, name="worker_tier_enum"), default=WorkerTier.silver)
    active_days_30: Mapped[int] = mapped_column(Integer, default=0)
    total_deliveries: Mapped[int] = mapped_column(Integer, default=0)
    trust_score_floor: Mapped[float] = mapped_column(Numeric(3, 2), default=0.40)
    shift_start_hour: Mapped[int] = mapped_column(Integer, default=8, server_default="8")
    shift_end_hour: Mapped[int] = mapped_column(Integer, default=23, server_default="23")
    role: Mapped[UserRole] = mapped_column(Enum(UserRole, name="user_role_enum"), nullable=False, server_default="worker")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("NOW()"))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    policies = relationship("Policy", back_populates="worker")
    claims = relationship("Claim", back_populates="worker")
    premiums = relationship("PremiumRecord", back_populates="worker")

    @property
    def upi_id_decrypted(self) -> str | None:
        if not self.upi_id:
            return None
        from crypto import decrypt_field

        return decrypt_field(self.upi_id)
