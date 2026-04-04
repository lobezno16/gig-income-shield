from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from random import Random

from constants import H3_ZONES

TRIGGER_THRESHOLDS = {
    "aqi": {1: 300, 2: 400, 3: 450},
    "rain": {1: 50, 2: 100, 3: 150},
    "heat": {1: 42, 2: 45, 3: 48},
    "flood": {1: 1, 2: 2, 3: 3},
    "storm": {1: 50, 2: 70, 3: 90},
    "curfew": {1: 0.3, 2: 0.6, 3: 1.0},
    "store": {1: 0.3, 2: 0.6, 3: 0.9},
}


@dataclass
class MockReading:
    peril: str
    source: str
    city: str
    h3_hex: str
    reading_value: float


def _seasonal_aqi(city: str, month: int, rng: Random) -> float:
    if city == "delhi" and month in [10, 11, 12, 1, 2]:
        return rng.uniform(280, 470)
    if city == "mumbai":
        return rng.uniform(70, 180)
    return rng.uniform(90, 260)


def _seasonal_rain(city: str, month: int, rng: Random) -> float:
    if city == "mumbai" and month in [6, 7, 8, 9]:
        return rng.uniform(70, 180)
    if city == "chennai" and month in [10, 11, 12]:
        return rng.uniform(60, 160)
    return rng.uniform(0, 60)


def generate_mock_readings(now: datetime) -> list[MockReading]:
    rng = Random(now.strftime("%Y-%m-%d-%H"))
    readings: list[MockReading] = []
    for hex_id, zone in H3_ZONES.items():
        city = zone["city"]
        readings.extend(
            [
                MockReading("aqi", "cpcb_waqi", city, hex_id, round(_seasonal_aqi(city, now.month, rng), 2)),
                MockReading("rain", "imd_owm", city, hex_id, round(_seasonal_rain(city, now.month, rng), 2)),
                MockReading("heat", "imd_owm", city, hex_id, round(rng.uniform(31, 49), 2)),
                MockReading("flood", "ndma", city, hex_id, round(rng.uniform(0, 3.5), 2)),
                MockReading("storm", "imd_owm", city, hex_id, round(rng.uniform(10, 110), 2)),
                MockReading("curfew", "nlp", city, hex_id, round(rng.uniform(0, 1), 2)),
                MockReading("store", "platform", city, hex_id, round(rng.uniform(0, 1), 2)),
            ]
        )
    return readings


def classify_trigger_level(peril: str, reading_value: float) -> tuple[int, float] | None:
    thresholds = TRIGGER_THRESHOLDS[peril]
    if reading_value >= thresholds[3]:
        return 3, 1.0
    if reading_value >= thresholds[2]:
        return 2, 0.60
    if reading_value >= thresholds[1]:
        return 1, 0.30
    return None

