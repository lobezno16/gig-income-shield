from __future__ import annotations

from dataclasses import dataclass


@dataclass
class SignalData:
    cell_tower_match: float
    gps_accuracy_meters: float
    motion_score: float
    wifi_score: float
    battery_drain_score: float
    network_quality_score: float
    platform_status_score: float


def _normalize(v: float) -> float:
    return max(0.0, min(1.0, float(v)))


def layer1_trust_score(signal_data: SignalData, peril: str) -> tuple[float, dict[str, float]]:
    weights = {
        "cell_tower_match": 0.20,
        "gps_accuracy_score": 0.15,
        "motion_score": 0.18,
        "wifi_score": 0.15,
        "battery_drain_score": 0.12,
        "network_quality_score": 0.10,
        "platform_status_score": 0.10,
    }

    gps_accuracy_score = 1.0
    if peril in ["rain"]:
        if signal_data.gps_accuracy_meters > 12:
            gps_accuracy_score = 1.0
        elif signal_data.gps_accuracy_meters < 6:
            gps_accuracy_score = 0.2
        else:
            gps_accuracy_score = 0.7
    else:
        if signal_data.gps_accuracy_meters < 8:
            gps_accuracy_score = 1.0
        elif signal_data.gps_accuracy_meters <= 20:
            gps_accuracy_score = 0.8
        else:
            gps_accuracy_score = 0.4

    signal_scores = {
        "cell_tower_match": _normalize(signal_data.cell_tower_match),
        "gps_accuracy_score": _normalize(gps_accuracy_score),
        "motion_score": _normalize(signal_data.motion_score),
        "wifi_score": _normalize(signal_data.wifi_score),
        "battery_drain_score": _normalize(signal_data.battery_drain_score),
        "network_quality_score": _normalize(signal_data.network_quality_score),
        "platform_status_score": _normalize(signal_data.platform_status_score),
    }

    trust = sum(signal_scores[k] * weights[k] for k in signal_scores.keys())
    return round(trust, 4), signal_scores
