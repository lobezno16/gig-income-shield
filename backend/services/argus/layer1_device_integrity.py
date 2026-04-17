from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any

from services.argus.layer0_rules import Layer0ClaimData


def _clamp(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return max(low, min(high, float(value)))


@dataclass(slots=True)
class DeviceIntegrityResult:
    passed: bool
    risk_score: float
    flags: list[str]
    decision: str
    evidence: dict[str, Any]


async def evaluate_device_integrity(claim_data: Layer0ClaimData) -> DeviceIntegrityResult:
    """
    Layer 1 - Device Integrity
    Simulated anti-spoof checks based on claim payload telemetry.
    """
    telemetry = claim_data.normalized_device_telemetry()
    flags: list[str] = []
    risk = 0.0

    if telemetry.mock_location:
        flags.append("mock_location_detected")
        # Mock-location is a hard red flag for location-based parametric payout.
        risk += 0.75

    if telemetry.vpn_routed:
        vpn_score = telemetry.vpn_risk_score if telemetry.vpn_risk_score is not None else 0.5
        vpn_score = _clamp(vpn_score)
        flags.append("vpn_routing_detected")
        risk += 0.20 + (vpn_score * 0.35)

    if telemetry.emulator_detected:
        flags.append("emulator_detected")
        risk += 0.25

    if telemetry.rooted_device:
        flags.append("rooted_device_detected")
        risk += 0.20

    risk = _clamp(risk)
    if telemetry.mock_location:
        decision = "blocked"
    elif risk >= 0.45:
        decision = "flagged"
    else:
        decision = "approved"

    return DeviceIntegrityResult(
        passed=decision == "approved",
        risk_score=round(risk, 4),
        flags=flags,
        decision=decision,
        evidence={
            "telemetry": asdict(telemetry),
        },
    )

