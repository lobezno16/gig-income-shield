from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class WorkerBase(BaseModel):
    name: str
    phone: str
    platform: Literal["zepto", "zomato", "swiggy", "blinkit"]
    city: str
    h3_hex: str
    upi_id: str | None = None
    tier: Literal["gold", "silver", "bronze", "restricted"]
    active_days_30: int


class WorkerResponse(WorkerBase):
    id: UUID
    created_at: datetime
    is_active: bool


class EnrollmentRequest(BaseModel):
    phone: str = Field(..., pattern=r"^\+91[6-9]\d{9}$")
    otp_token: str
    name: str = Field(..., min_length=2, max_length=100)
    platform: Literal["zepto", "zomato", "swiggy", "blinkit"]
    platform_worker_id: str
    city: str
    latitude: float
    longitude: float
    upi_id: str = Field(..., pattern=r"^[\w.\-]+@[\w]+$")
    plan: Literal["lite", "standard", "pro"]
    active_days_30: int = Field(
        default=12,
        ge=0,
        le=30,
        description="Self-reported active working days in last 30 days",
    )


class OtpSendRequest(BaseModel):
    phone: str = Field(..., pattern=r"^\+91[6-9]\d{9}$")


class OtpVerifyRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    phone: str = Field(..., pattern=r"^\+91[6-9]\d{9}$")
    otp: str = Field(..., min_length=6, max_length=6)
    otp_token: str
