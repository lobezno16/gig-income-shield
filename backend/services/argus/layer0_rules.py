from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Mapping

import h3


def _coerce_bool(value: Any, default: bool = False) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "y"}
    return bool(value)


def _coerce_float(value: Any, default: float | None = None) -> float | None:
    if value is None:
        return default
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _coerce_datetime(value: Any, fallback: datetime | None = None) -> datetime:
    if isinstance(value, datetime):
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)
    if isinstance(value, str):
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
            if parsed.tzinfo is None:
                return parsed.replace(tzinfo=timezone.utc)
            return parsed.astimezone(timezone.utc)
        except ValueError:
            pass
    return fallback or datetime.now(timezone.utc)


@dataclass(slots=True)
class DeviceTelemetry:
    mock_location: bool = False
    vpn_routed: bool = False
    vpn_risk_score: float | None = None
    emulator_detected: bool = False
    rooted_device: bool = False

    @classmethod
    def from_payload(cls, payload: DeviceTelemetry | Mapping[str, Any] | None) -> DeviceTelemetry:
        if isinstance(payload, cls):
            return payload
        if payload is None:
            return cls()

        return cls(
            mock_location=_coerce_bool(payload.get("mock_location"), default=False),
            vpn_routed=_coerce_bool(payload.get("vpn_routed"), default=False),
            vpn_risk_score=_coerce_float(payload.get("vpn_risk_score"), default=None),
            emulator_detected=_coerce_bool(payload.get("emulator_detected"), default=False),
            rooted_device=_coerce_bool(payload.get("rooted_device"), default=False),
        )


@dataclass(slots=True)
class H3Ping:
    h3_hex: str
    recorded_at: datetime
    lat: float | None = None
    lng: float | None = None

    @classmethod
    def from_payload(cls, payload: H3Ping | Mapping[str, Any]) -> H3Ping:
        if isinstance(payload, cls):
            return payload
        recorded_at = _coerce_datetime(
            payload.get("recorded_at") or payload.get("timestamp"),
            fallback=datetime.now(timezone.utc),
        )
        return cls(
            h3_hex=str(payload.get("h3_hex", "")),
            recorded_at=recorded_at,
            lat=_coerce_float(payload.get("lat"), default=None),
            lng=_coerce_float(payload.get("lng"), default=None),
        )


@dataclass(slots=True)
class OracleSnapshot:
    weather_condition: str | None = None
    rain_mm_per_hr: float | None = None
    traffic_condition: str | None = None
    traffic_avg_speed_kmh: float | None = None
    traffic_delay_min_per_km: float | None = None

    @classmethod
    def from_payload(cls, payload: OracleSnapshot | Mapping[str, Any] | None) -> OracleSnapshot:
        if isinstance(payload, cls):
            return payload
        if payload is None:
            return cls()
        return cls(
            weather_condition=(str(payload.get("weather_condition")).strip() if payload.get("weather_condition") else None),
            rain_mm_per_hr=_coerce_float(payload.get("rain_mm_per_hr"), default=None),
            traffic_condition=(str(payload.get("traffic_condition")).strip() if payload.get("traffic_condition") else None),
            traffic_avg_speed_kmh=_coerce_float(payload.get("traffic_avg_speed_kmh"), default=None),
            traffic_delay_min_per_km=_coerce_float(payload.get("traffic_delay_min_per_km"), default=None),
        )


@dataclass(slots=True)
class Layer0ClaimData:
    gps_lat: float
    gps_lng: float
    platform_active_at_trigger: bool
    timestamp: datetime
    typical_shift_start: int
    typical_shift_end: int
    device_telemetry: DeviceTelemetry | Mapping[str, Any] | None = None
    recent_h3_pings: list[H3Ping | Mapping[str, Any]] = field(default_factory=list)
    oracle_snapshot: OracleSnapshot | Mapping[str, Any] | None = None

    def normalized_timestamp(self) -> datetime:
        return _coerce_datetime(self.timestamp)

    def claim_h3_hex(self, resolution: int = 9) -> str:
        return h3.latlng_to_cell(float(self.gps_lat), float(self.gps_lng), resolution)

    def normalized_device_telemetry(self) -> DeviceTelemetry:
        return DeviceTelemetry.from_payload(self.device_telemetry)

    def normalized_recent_h3_pings(self) -> list[H3Ping]:
        normalized: list[H3Ping] = []
        for raw in self.recent_h3_pings:
            try:
                ping = H3Ping.from_payload(raw)
            except Exception:
                continue
            if ping.h3_hex:
                normalized.append(ping)
        normalized.sort(key=lambda item: item.recorded_at)
        return normalized

    def normalized_oracle_snapshot(self) -> OracleSnapshot:
        return OracleSnapshot.from_payload(self.oracle_snapshot)


def is_within_shift_hours(ts: datetime, shift_start: int, shift_end: int) -> bool:
    hour = _coerce_datetime(ts).hour
    if shift_start <= shift_end:
        return shift_start <= hour <= shift_end
    return hour >= shift_start or hour <= shift_end
