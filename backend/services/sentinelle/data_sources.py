from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import datetime
from random import Random

import httpx
import structlog

from config import get_settings
from constants import H3_ZONES

logger = structlog.get_logger("soteria.sentinelle.data_sources")

TRIGGER_THRESHOLDS = {
    "aqi": {1: 300, 2: 400, 3: 450},
    "rain": {1: 50, 2: 100, 3: 150},
    "heat": {1: 42, 2: 45, 3: 48},
    "flood": {1: 1, 2: 2, 3: 3},
    "storm": {1: 50, 2: 70, 3: 90},
    "curfew": {1: 0.3, 2: 0.6, 3: 1.0},
    "store": {1: 0.3, 2: 0.6, 3: 0.9},
}

CITY_COORDINATES = {
    "delhi": (28.6139, 77.2090),
    "mumbai": (19.0760, 72.8777),
    "chennai": (13.0827, 80.2707),
    "bangalore": (12.9716, 77.5946),
    "kolkata": (22.5726, 88.3639),
    "lucknow": (26.8467, 80.9462),
    "pune": (18.5204, 73.8567),
    "ahmedabad": (23.0225, 72.5714),
    "hyderabad": (17.3850, 78.4867),
    "jaipur": (26.9124, 75.7873),
    "nagpur": (21.1458, 79.0882),
}

CITY_TOKENS = {
    "delhi": "delhi",
    "mumbai": "mumbai",
    "chennai": "chennai",
    "bangalore": "bangalore",
    "kolkata": "kolkata",
    "lucknow": "lucknow",
    "pune": "pune",
    "ahmedabad": "ahmedabad",
    "hyderabad": "hyderabad",
    "jaipur": "jaipur",
    "nagpur": "nagpur",
}


@dataclass
class MockReading:
    peril: str
    source: str
    city: str
    h3_hex: str
    reading_value: float


class RealDataFetcher:
    OWM_BASE = "https://api.openweathermap.org/data/2.5"
    WAQI_BASE = "https://api.waqi.info"

    def __init__(self) -> None:
        self.settings = get_settings()

    async def fetch_weather(self, city: str) -> dict[str, float | int | str]:
        lat, lon = CITY_COORDINATES[city]
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                f"{self.OWM_BASE}/weather",
                params={
                    "lat": lat,
                    "lon": lon,
                    "appid": self.settings.owm_api_key,
                    "units": "metric",
                },
            )
            response.raise_for_status()
            payload = response.json()
        return {
            "temp_c": float(payload["main"]["temp"]),
            "rain_1h_mm": float(payload.get("rain", {}).get("1h", 0.0)),
            "rain_3h_mm": float(payload.get("rain", {}).get("3h", 0.0)),
            "wind_speed_kmh": float(payload["wind"]["speed"]) * 3.6,
            "weather_id": int(payload["weather"][0]["id"]),
            "description": str(payload["weather"][0]["description"]),
        }

    async def fetch_aqi(self, city: str) -> float:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                f"{self.WAQI_BASE}/feed/{CITY_TOKENS[city]}/",
                params={"token": self.settings.waqi_api_key},
            )
            response.raise_for_status()
            payload = response.json()
        if payload.get("status") == "ok":
            return float(payload["data"]["aqi"])
        return 0.0


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


async def generate_real_readings(now: datetime) -> list[MockReading]:
    settings = get_settings()
    if not settings.has_real_weather_data:
        logger.info("no_api_keys_configured_using_mock_weather_data")
        return generate_mock_readings(now)

    fetcher = RealDataFetcher()
    cities = list(CITY_COORDINATES.keys())
    weather_tasks = [fetcher.fetch_weather(city) for city in cities]
    aqi_tasks = [fetcher.fetch_aqi(city) for city in cities]

    try:
        weather_results = await asyncio.gather(*weather_tasks, return_exceptions=True)
        aqi_results = await asyncio.gather(*aqi_tasks, return_exceptions=True)
    except Exception as exc:
        logger.warning("real_data_fetch_failed", error=str(exc))
        return generate_mock_readings(now)

    readings: list[MockReading] = []
    real_signal_count = 0
    for idx, city in enumerate(cities):
        weather_result = weather_results[idx]
        aqi_result = aqi_results[idx]

        weather = None if isinstance(weather_result, Exception) else weather_result
        if isinstance(weather_result, Exception):
            logger.warning("owm_city_fetch_failed", city=city, error=str(weather_result))

        aqi = None if isinstance(aqi_result, Exception) else float(aqi_result)
        if isinstance(aqi_result, Exception):
            logger.warning("waqi_city_fetch_failed", city=city, error=str(aqi_result))

        city_hexes = [(hex_id, zone) for hex_id, zone in H3_ZONES.items() if zone["city"] == city]
        for hex_id, _zone in city_hexes:
            if weather:
                rain_mm = float(weather["rain_1h_mm"]) * 24
                readings.append(MockReading("rain", "imd_owm", city, hex_id, round(rain_mm, 2)))
                readings.append(MockReading("heat", "imd_owm", city, hex_id, round(float(weather["temp_c"]), 1)))
                readings.append(
                    MockReading("storm", "imd_owm", city, hex_id, round(float(weather["wind_speed_kmh"]), 1))
                )
                real_signal_count += 3
            if aqi is not None:
                readings.append(MockReading("aqi", "waqi_cpcb", city, hex_id, round(aqi, 0)))
                real_signal_count += 1

    if real_signal_count == 0:
        logger.warning("real_data_all_city_fetch_failed_using_mock_fallback")
        return generate_mock_readings(now)

    for hex_id, zone in H3_ZONES.items():
        readings.append(MockReading("curfew", "nlp_sim", zone["city"], hex_id, 0.0))
        readings.append(MockReading("store", "platform_sim", zone["city"], hex_id, 0.0))
        readings.append(MockReading("flood", "ndma_sim", zone["city"], hex_id, 0.0))

    if not readings:
        logger.warning("real_data_empty_using_mock_fallback")
        return generate_mock_readings(now)
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
