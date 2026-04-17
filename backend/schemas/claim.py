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
    class DeviceTelemetryPayload(BaseModel):
        mock_location: bool = False
        vpn_routed: bool = False
        vpn_risk_score: float | None = Field(default=None, ge=0, le=1)
        emulator_detected: bool = False
        rooted_device: bool = False

    class H3PingPayload(BaseModel):
        h3_hex: str
        recorded_at: datetime
        lat: float | None = None
        lng: float | None = None

    class OracleSnapshotPayload(BaseModel):
        weather_condition: str | None = None
        rain_mm_per_hr: float | None = Field(default=None, ge=0)
        traffic_condition: str | None = None
        traffic_avg_speed_kmh: float | None = Field(default=None, ge=0)
        traffic_delay_min_per_km: float | None = Field(default=None, ge=0)

    worker_id: str
    trigger_id: str
    gps_lat: float
    gps_lng: float
    platform_active_at_trigger: bool
    timestamp: datetime
    typical_shift_start: int = Field(default=8, ge=0, le=23)
    typical_shift_end: int = Field(default=23, ge=0, le=23)
    device_telemetry: DeviceTelemetryPayload | None = None
    recent_h3_pings: list[H3PingPayload] = Field(default_factory=list, max_length=10)
    oracle_snapshot: OracleSnapshotPayload | None = None


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
