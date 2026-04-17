from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from models import TriggerEvent
from services.argus.layer0_rules import Layer0ClaimData

HEAVY_RAIN_THRESHOLD_MM_PER_HR = 15.0
FREE_FLOW_SPEED_THRESHOLD_KMH = 45.0
FAST_FLOW_DELAY_THRESHOLD_MIN_PER_KM = 2.0


def _clamp(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return max(low, min(high, float(value)))


def _is_heavy_rain(trigger: TriggerEvent, claim_data: Layer0ClaimData) -> tuple[bool, str]:
    oracle = claim_data.normalized_oracle_snapshot()
    weather_condition = (oracle.weather_condition or "").strip().lower()
    if oracle.rain_mm_per_hr is not None and float(oracle.rain_mm_per_hr) >= HEAVY_RAIN_THRESHOLD_MM_PER_HR:
        return True, "oracle_rain_mm_per_hr"
    if "heavy rain" in weather_condition:
        return True, "oracle_weather_condition"
    if trigger.peril.value == "rain" and float(trigger.reading_value) >= HEAVY_RAIN_THRESHOLD_MM_PER_HR:
        return True, "trigger_reading_value"
    return False, "none"


def _is_free_flow_traffic(claim_data: Layer0ClaimData) -> tuple[bool, str]:
    oracle = claim_data.normalized_oracle_snapshot()
    traffic_condition = (oracle.traffic_condition or "").strip().lower()
    if traffic_condition in {"free_flowing", "free-flowing", "fast", "light", "smooth"}:
        return True, "traffic_condition"

    has_speed = oracle.traffic_avg_speed_kmh is not None
    has_delay = oracle.traffic_delay_min_per_km is not None
    if has_speed and has_delay:
        speed = float(oracle.traffic_avg_speed_kmh)
        delay = float(oracle.traffic_delay_min_per_km)
        if speed >= FREE_FLOW_SPEED_THRESHOLD_KMH and delay <= FAST_FLOW_DELAY_THRESHOLD_MIN_PER_KM:
            return True, "traffic_speed_delay"
    return False, "none"


@dataclass(slots=True)
class MultiSourceConsensusResult:
    passed: bool
    risk_score: float
    flags: list[str]
    decision: str
    evidence: dict[str, Any]


async def evaluate_multi_source_consensus(
    trigger: TriggerEvent,
    claim_data: Layer0ClaimData,
) -> MultiSourceConsensusResult:
    """
    Layer 4 - Multi-source consensus
    Detects contradiction between weather severity and traffic fluidity.
    """
    heavy_rain, heavy_rain_source = _is_heavy_rain(trigger, claim_data)
    free_flow_traffic, traffic_source = _is_free_flow_traffic(claim_data)
    flags: list[str] = []

    if heavy_rain and free_flow_traffic:
        flags.append("weather_traffic_consensus_anomaly")
        decision = "flagged"
        risk = 0.75
    else:
        decision = "approved"
        risk = 0.05

    risk = _clamp(risk)
    snapshot = claim_data.normalized_oracle_snapshot()
    return MultiSourceConsensusResult(
        passed=decision == "approved",
        risk_score=round(risk, 4),
        flags=flags,
        decision=decision,
        evidence={
            "heavy_rain": heavy_rain,
            "heavy_rain_source": heavy_rain_source,
            "free_flow_traffic": free_flow_traffic,
            "free_flow_traffic_source": traffic_source,
            "weather_condition": snapshot.weather_condition,
            "rain_mm_per_hr": snapshot.rain_mm_per_hr,
            "traffic_condition": snapshot.traffic_condition,
            "traffic_avg_speed_kmh": snapshot.traffic_avg_speed_kmh,
            "traffic_delay_min_per_km": snapshot.traffic_delay_min_per_km,
        },
    )

