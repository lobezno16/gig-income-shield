import enum
from datetime import datetime
from uuid import UUID

from sqlalchemy import DateTime, Enum, Integer, Numeric, String, text
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


class PerilType(str, enum.Enum):
    aqi = "aqi"
    rain = "rain"
    heat = "heat"
    flood = "flood"
    storm = "storm"
    curfew = "curfew"
    store = "store"


class TriggerLevel(int, enum.Enum):
    level1 = 1
    level2 = 2
    level3 = 3


class TriggerEvent(Base):
    __tablename__ = "trigger_events"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    peril: Mapped[PerilType] = mapped_column(Enum(PerilType, name="peril_type_enum"), nullable=False)
    source: Mapped[str] = mapped_column(String(30), nullable=False)
    reading_value: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    trigger_level: Mapped[int] = mapped_column(Integer, nullable=False)
    payout_pct: Mapped[float] = mapped_column(Numeric(4, 2), nullable=False)
    city: Mapped[str] = mapped_column(String(50), nullable=False)
    h3_hex: Mapped[str] = mapped_column(String(20), nullable=False)
    workers_affected: Mapped[int] = mapped_column(Integer, default=0)
    total_payout_inr: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    triggered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("NOW()"))
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    claims = relationship("Claim", back_populates="trigger")

