from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class ClaimStep(BaseModel):
    id: str
    label: str
    description: str
    timestamp: str
    status: Literal["completed", "active", "future"] = "completed"


class CreateClaimRequest(BaseModel):
    worker_id: str
    trigger_id: str
    gps_lat: float
    gps_lng: float
    platform_active_at_trigger: bool
    timestamp: datetime
    typical_shift_start: int = Field(default=8, ge=0, le=23)
    typical_shift_end: int = Field(default=23, ge=0, le=23)


class ClaimResponse(BaseModel):
    id: str
    claim_number: str
    status: str
    payout_amount: float
    payout_pct: float
    fraud_score: float | None = None
    fraud_flags: list[str] = []
    argus_layers: dict = {}
    timeline: list[ClaimStep] = []
    created_at: datetime
    settled_at: datetime | None = None

