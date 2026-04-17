from __future__ import annotations

from dataclasses import dataclass
from datetime import timedelta
from math import asin, cos, radians, sin, sqrt
from typing import Any

import h3

from services.argus.layer0_rules import H3Ping, Layer0ClaimData

EARTH_RADIUS_KM = 6371.0
CONGESTED_CITY_SPEED_LIMIT_KMH = 80.0
DEFAULT_SPEED_LIMIT_KMH = 120.0
HIGH_CONGESTION_DELAY_MIN_PER_KM = 4.0

# Conservative list used when traffic feeds are delayed or unavailable.
METRO_CONGESTED_CITIES = {
    "delhi",
    "new delhi",
    "mumbai",
    "bengaluru",
    "bangalore",
    "chennai",
    "kolkata",
    "hyderabad",
    "pune",
}


def _clamp(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return max(low, min(high, float(value)))


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Compute geodesic distance between two WGS84 points using Haversine."""
    lat1_rad, lon1_rad = radians(lat1), radians(lon1)
    lat2_rad, lon2_rad = radians(lat2), radians(lon2)
    dlat = lat2_rad - lat1_rad
    dlon = lon2_rad - lon1_rad
    a = sin(dlat / 2.0) ** 2 + cos(lat1_rad) * cos(lat2_rad) * sin(dlon / 2.0) ** 2
    return 2.0 * EARTH_RADIUS_KM * asin(sqrt(a))


def _ping_lat_lng(ping: H3Ping) -> tuple[float, float]:
    if ping.lat is not None and ping.lng is not None:
        return float(ping.lat), float(ping.lng)
    lat, lng = h3.cell_to_latlng(ping.h3_hex)
    return float(lat), float(lng)


def _is_congested_zone(city: str | None, claim_data: Layer0ClaimData) -> bool:
    city_congested = bool(city and city.strip().lower() in METRO_CONGESTED_CITIES)
    oracle = claim_data.normalized_oracle_snapshot()
    traffic_condition = (oracle.traffic_condition or "").strip().lower()
    condition_congested = traffic_condition in {
        "congested",
        "gridlock",
        "severe",
        "roadblock",
        "unplanned_curfew",
        "standstill",
    }
    delay_congested = (
        oracle.traffic_delay_min_per_km is not None
        and float(oracle.traffic_delay_min_per_km) >= HIGH_CONGESTION_DELAY_MIN_PER_KM
    )
    return city_congested or condition_congested or delay_congested


def _ensure_three_pings(claim_data: Layer0ClaimData) -> tuple[list[H3Ping], bool]:
    """
    Guarantee three pings for velocity math by backfilling synthetic points when
    clients do not send full telemetry yet.
    """
    pings = claim_data.normalized_recent_h3_pings()
    claim_ping = H3Ping(
        h3_hex=claim_data.claim_h3_hex(),
        recorded_at=claim_data.normalized_timestamp(),
        lat=claim_data.gps_lat,
        lng=claim_data.gps_lng,
    )
    if not pings or pings[-1].recorded_at != claim_ping.recorded_at or pings[-1].h3_hex != claim_ping.h3_hex:
        pings.append(claim_ping)
    pings.sort(key=lambda item: item.recorded_at)
    pings = pings[-3:]

    if len(pings) >= 3:
        return pings, False

    synthetic_needed = 3 - len(pings)
    fallback_hex = claim_ping.h3_hex
    synthetic_points: list[H3Ping] = []
    for idx in range(synthetic_needed, 0, -1):
        synthetic_points.append(
            H3Ping(
                h3_hex=fallback_hex,
                recorded_at=claim_ping.recorded_at - timedelta(minutes=idx * 10),
                lat=claim_ping.lat,
                lng=claim_ping.lng,
            )
        )

    filled = synthetic_points + pings
    filled.sort(key=lambda item: item.recorded_at)
    return filled[-3:], True


@dataclass(slots=True)
class H3VelocityResult:
    passed: bool
    risk_score: float
    flags: list[str]
    decision: str
    evidence: dict[str, Any]


async def evaluate_h3_velocity(claim_data: Layer0ClaimData, *, city: str | None = None) -> H3VelocityResult:
    """
    Layer 2 - H3 Velocity
    Checks travel feasibility between the most recent three H3 pings.
    """
    flags: list[str] = []
    segments: list[dict[str, float | str]] = []
    pings, used_synthetic = _ensure_three_pings(claim_data)
    congested_zone = _is_congested_zone(city, claim_data)
    speed_limit_kmh = CONGESTED_CITY_SPEED_LIMIT_KMH if congested_zone else DEFAULT_SPEED_LIMIT_KMH
    max_speed_kmh = 0.0

    for idx in range(1, len(pings)):
        prev_ping = pings[idx - 1]
        next_ping = pings[idx]
        elapsed_hours = (next_ping.recorded_at - prev_ping.recorded_at).total_seconds() / 3600.0
        if elapsed_hours <= 0:
            flags.append("non_monotonic_ping_timestamps")
            continue

        try:
            prev_lat, prev_lng = _ping_lat_lng(prev_ping)
            next_lat, next_lng = _ping_lat_lng(next_ping)
        except Exception:
            flags.append("invalid_h3_ping_geometry")
            continue

        distance_km = haversine_km(prev_lat, prev_lng, next_lat, next_lng)
        speed_kmh = distance_km / elapsed_hours
        max_speed_kmh = max(max_speed_kmh, speed_kmh)
        segments.append(
            {
                "from_h3": prev_ping.h3_hex,
                "to_h3": next_ping.h3_hex,
                "distance_km": round(distance_km, 3),
                "elapsed_minutes": round(elapsed_hours * 60.0, 2),
                "speed_kmh": round(speed_kmh, 2),
            }
        )

    if congested_zone and max_speed_kmh > CONGESTED_CITY_SPEED_LIMIT_KMH:
        flags.append("velocity_exceeds_80_kmh_in_congested_zone")
    elif max_speed_kmh > DEFAULT_SPEED_LIMIT_KMH:
        flags.append("velocity_exceeds_city_plausible_limit")

    speed_ratio = max_speed_kmh / speed_limit_kmh if speed_limit_kmh else 0.0
    if speed_ratio <= 1.0:
        risk = 0.08 if used_synthetic else 0.02
    else:
        risk = 0.35 + ((speed_ratio - 1.0) * 0.9)
        if used_synthetic:
            risk += 0.05

    risk = _clamp(risk)
    if "velocity_exceeds_80_kmh_in_congested_zone" in flags:
        decision = "flagged"
    elif "velocity_exceeds_city_plausible_limit" in flags and max_speed_kmh > 180:
        decision = "blocked"
    elif flags:
        decision = "flagged"
    else:
        decision = "approved"

    return H3VelocityResult(
        passed=decision == "approved",
        risk_score=round(risk, 4),
        flags=flags,
        decision=decision,
        evidence={
            "city": city,
            "congested_zone": congested_zone,
            "speed_limit_kmh": speed_limit_kmh,
            "max_speed_kmh": round(max_speed_kmh, 2),
            "used_synthetic_history": used_synthetic,
            "segments": segments,
        },
    )
