from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import datetime
from random import Random
from typing import Any

import h3
import httpx
import structlog

from config import get_settings
from constants import H3_ZONES

logger = structlog.get_logger("soteria.sentinelle.multi_oracle")

TARGET_H3_RESOLUTION = 9
WEATHER_TRIGGER_MM_PER_HOUR = 15.0
TRAFFIC_TRIGGER_DELAY_MIN_PER_KM = 40.0
AQI_TRIGGER = 450.0

# Strict Phase-3 trigger thresholds for supported perils only.
TRIGGER_THRESHOLDS = {
    "aqi": {1: 450.0, 2: 550.0, 3: 650.0},
    "rain": {1: 15.0, 2: 25.0, 3: 40.0},
    "curfew": {1: 40.0, 2: 55.0, 3: 70.0},
}

STRICT_GREATER_THAN_PERILS = {"aqi", "rain", "curfew"}

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


@dataclass(slots=True)
class MultiOracleSnapshot:
    city: str
    h3_hex: str
    weather_condition: str
    rain_mm_per_hr: float
    traffic_condition: str
    traffic_avg_speed_kmh: float
    traffic_delay_min_per_km: float
    aqi: float
    weather_source: str
    traffic_source: str
    aqi_source: str

    def oracle_snapshot_payload(self) -> dict[str, Any]:
        return {
            "weather_condition": self.weather_condition,
            "rain_mm_per_hr": self.rain_mm_per_hr,
            "traffic_condition": self.traffic_condition,
            "traffic_avg_speed_kmh": self.traffic_avg_speed_kmh,
            "traffic_delay_min_per_km": self.traffic_delay_min_per_km,
        }


@dataclass(slots=True)
class TriggerCandidate:
    peril: str
    source: str
    city: str
    h3_hex: str
    reading_value: float
    trigger_level: int
    payout_pct: float


def _safe_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def normalize_h3_resolution9(h3_hex: str) -> str:
    """
    Converts any incoming H3 cell to resolution 9.
    For coarse cells, we use a deterministic child to retain a stable key.
    """
    try:
        resolution = int(h3.get_resolution(h3_hex))
    except Exception:
        return h3_hex

    if resolution == TARGET_H3_RESOLUTION:
        return h3_hex
    if resolution > TARGET_H3_RESOLUTION:
        return h3.cell_to_parent(h3_hex, TARGET_H3_RESOLUTION)

    children = sorted(h3.cell_to_children(h3_hex, TARGET_H3_RESOLUTION))
    if not children:
        return h3_hex
    return children[len(children) // 2]


def classify_trigger_level(peril: str, reading_value: float) -> tuple[int, float] | None:
    thresholds = TRIGGER_THRESHOLDS.get(peril)
    if not thresholds:
        return None

    check = float(reading_value)
    strict = peril in STRICT_GREATER_THAN_PERILS

    if (check > thresholds[3]) if strict else (check >= thresholds[3]):
        return 3, 1.0
    if (check > thresholds[2]) if strict else (check >= thresholds[2]):
        return 2, 0.60
    if (check > thresholds[1]) if strict else (check >= thresholds[1]):
        return 1, 0.30
    return None


def derive_trigger_candidates(snapshot: MultiOracleSnapshot) -> list[TriggerCandidate]:
    candidates: list[TriggerCandidate] = []

    rain_level = classify_trigger_level("rain", snapshot.rain_mm_per_hr)
    if rain_level:
        level, payout = rain_level
        candidates.append(
            TriggerCandidate(
                peril="rain",
                source=snapshot.weather_source,
                city=snapshot.city,
                h3_hex=snapshot.h3_hex,
                reading_value=round(snapshot.rain_mm_per_hr, 2),
                trigger_level=level,
                payout_pct=payout,
            )
        )

    # Uses `curfew` peril enum to represent roadblock/unplanned-curfew disruptions.
    traffic_level = classify_trigger_level("curfew", snapshot.traffic_delay_min_per_km)
    if traffic_level:
        level, payout = traffic_level
        candidates.append(
            TriggerCandidate(
                peril="curfew",
                source=snapshot.traffic_source,
                city=snapshot.city,
                h3_hex=snapshot.h3_hex,
                reading_value=round(snapshot.traffic_delay_min_per_km, 2),
                trigger_level=level,
                payout_pct=payout,
            )
        )

    aqi_level = classify_trigger_level("aqi", snapshot.aqi)
    if aqi_level:
        level, payout = aqi_level
        candidates.append(
            TriggerCandidate(
                peril="aqi",
                source=snapshot.aqi_source,
                city=snapshot.city,
                h3_hex=snapshot.h3_hex,
                reading_value=round(snapshot.aqi, 2),
                trigger_level=level,
                payout_pct=payout,
            )
        )

    return candidates


def _traffic_delay_min_per_km(current_speed_kmh: float, free_flow_speed_kmh: float, road_closure: bool) -> float:
    if road_closure:
        return 120.0
    if current_speed_kmh <= 0.1:
        return 120.0
    free_flow = max(free_flow_speed_kmh, 1.0)
    current_eta = 60.0 / max(current_speed_kmh, 0.1)
    free_eta = 60.0 / free_flow
    return max(0.0, current_eta - free_eta)


def _traffic_condition(current_speed_kmh: float, free_flow_speed_kmh: float, road_closure: bool) -> str:
    if road_closure:
        return "roadblock"
    free_flow = max(free_flow_speed_kmh, 1.0)
    ratio = current_speed_kmh / free_flow
    if ratio < 0.15:
        return "severe"
    if ratio < 0.40:
        return "congested"
    if ratio < 0.70:
        return "slow"
    return "free_flowing"


def _seasonal_aqi(city: str, month: int, rng: Random) -> float:
    if city == "delhi" and month in {10, 11, 12, 1, 2}:
        return rng.uniform(310, 540)
    if city in {"mumbai", "chennai"}:
        return rng.uniform(70, 220)
    return rng.uniform(110, 320)


def _seasonal_rain_mm_per_hr(city: str, month: int, rng: Random) -> float:
    if city == "mumbai" and month in {6, 7, 8, 9}:
        return rng.uniform(8, 46)
    if city == "chennai" and month in {10, 11, 12}:
        return rng.uniform(6, 38)
    if city == "kolkata" and month in {6, 7, 8, 9}:
        return rng.uniform(5, 34)
    return rng.uniform(0, 16)


def _mock_traffic(city: str, hour: int, rng: Random) -> tuple[str, float, float]:
    peak_hour = hour in {8, 9, 10, 18, 19, 20}
    severe_probability = 0.08 if peak_hour else 0.03
    if city in {"delhi", "mumbai", "bangalore"}:
        severe_probability += 0.03

    if rng.random() < severe_probability:
        delay_min_per_km = rng.uniform(42, 95)
        avg_speed_kmh = rng.uniform(0.5, 6.0)
    else:
        delay_min_per_km = rng.uniform(1.0, 12.0 if peak_hour else 8.0)
        avg_speed_kmh = rng.uniform(12.0, 55.0)

    if delay_min_per_km > 70:
        condition = "roadblock"
    elif delay_min_per_km > 40:
        condition = "severe"
    elif delay_min_per_km > 10:
        condition = "congested"
    elif delay_min_per_km > 4:
        condition = "slow"
    else:
        condition = "free_flowing"

    return condition, avg_speed_kmh, delay_min_per_km


def _mock_city_signals(city: str, now: datetime, rng: Random) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    rain_mm_per_hr = _seasonal_rain_mm_per_hr(city, now.month, rng)
    weather_condition = "heavy rain" if rain_mm_per_hr > WEATHER_TRIGGER_MM_PER_HOUR else "light rain" if rain_mm_per_hr > 0 else "clear"
    weather = {
        "rain_mm_per_hr": round(rain_mm_per_hr, 2),
        "weather_condition": weather_condition,
        "source": "openweather_mock",
    }
    traffic_condition, traffic_avg_speed_kmh, delay_min_per_km = _mock_traffic(city, now.hour, rng)
    traffic = {
        "traffic_condition": traffic_condition,
        "traffic_avg_speed_kmh": round(traffic_avg_speed_kmh, 2),
        "traffic_delay_min_per_km": round(delay_min_per_km, 2),
        "source": "tomtom_mock",
    }
    aqi = {
        "aqi": round(_seasonal_aqi(city, now.month, rng), 2),
        "source": "cpcb_mock",
    }
    return weather, traffic, aqi


class RealDataFetcher:
    OWM_BASE = "https://api.openweathermap.org/data/2.5"
    WAQI_BASE = "https://api.waqi.info"

    def __init__(self) -> None:
        self.settings = get_settings()

    async def fetch_weather(self, city: str) -> dict[str, Any]:
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
            "rain_mm_per_hr": _safe_float(payload.get("rain", {}).get("1h"), 0.0),
            "weather_condition": str((payload.get("weather") or [{}])[0].get("description", "unknown")),
            "source": "openweather_live",
        }

    async def fetch_traffic(self, city: str) -> dict[str, Any]:
        lat, lon = CITY_COORDINATES[city]
        endpoint = f"{self.settings.tomtom_base_url}/flowSegmentData/relative0/10/json"
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                endpoint,
                params={
                    "point": f"{lat},{lon}",
                    "unit": "KMPH",
                    "key": self.settings.tomtom_api_key,
                },
            )
            response.raise_for_status()
            payload = response.json()

        segment = payload.get("flowSegmentData", {})
        current_speed = _safe_float(segment.get("currentSpeed"), 0.0)
        free_flow_speed = _safe_float(segment.get("freeFlowSpeed"), max(current_speed, 1.0))
        road_closure = bool(segment.get("roadClosure", False))
        delay_min_per_km = _traffic_delay_min_per_km(current_speed, free_flow_speed, road_closure)
        condition = _traffic_condition(current_speed, free_flow_speed, road_closure)

        return {
            "traffic_condition": condition,
            "traffic_avg_speed_kmh": round(current_speed, 2),
            "traffic_delay_min_per_km": round(delay_min_per_km, 2),
            "source": "tomtom_live",
        }

    async def fetch_aqi(self, city: str) -> dict[str, Any]:
        if self.settings.cpcb_api_key:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(
                    f"{self.settings.cpcb_base_url}/v1/aqi/city",
                    params={"city": city, "apikey": self.settings.cpcb_api_key},
                )
                response.raise_for_status()
                payload = response.json()

            # Supports common CPCB payload shapes without tightly coupling to one schema.
            aqi_value = _safe_float(
                payload.get("aqi")
                or (payload.get("data") or {}).get("aqi")
                or ((payload.get("data") or {}).get("records") or [{}])[0].get("aqi"),
                0.0,
            )
            return {"aqi": round(aqi_value, 2), "source": "cpcb_live"}

        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                f"{self.WAQI_BASE}/feed/{CITY_TOKENS[city]}/",
                params={"token": self.settings.waqi_api_key},
            )
            response.raise_for_status()
            payload = response.json()
        if payload.get("status") == "ok":
            return {"aqi": round(_safe_float((payload.get("data") or {}).get("aqi"), 0.0), 2), "source": "waqi_live"}
        return {"aqi": 0.0, "source": "waqi_live"}


def _build_zone_contexts() -> list[tuple[str, str]]:
    contexts: list[tuple[str, str]] = []
    for zone_hex, zone in H3_ZONES.items():
        city = str(zone.get("city", "delhi")).lower()
        contexts.append((city, normalize_h3_resolution9(zone_hex)))
    return contexts


async def generate_multi_oracle_snapshots(now: datetime) -> list[MultiOracleSnapshot]:
    zone_contexts = _build_zone_contexts()
    if not zone_contexts:
        return []

    settings = get_settings()
    cities = sorted({city for city, _ in zone_contexts})
    seeded_rng = Random(now.strftime("%Y-%m-%d-%H"))

    weather_by_city: dict[str, dict[str, Any]] = {}
    traffic_by_city: dict[str, dict[str, Any]] = {}
    aqi_by_city: dict[str, dict[str, Any]] = {}

    if settings.has_real_weather_data or settings.has_real_traffic_data or settings.has_real_aqi_data:
        fetcher = RealDataFetcher()
        weather_tasks = {
            city: asyncio.create_task(fetcher.fetch_weather(city))
            for city in cities
            if settings.has_real_weather_data
        }
        traffic_tasks = {
            city: asyncio.create_task(fetcher.fetch_traffic(city))
            for city in cities
            if settings.has_real_traffic_data
        }
        aqi_tasks = {
            city: asyncio.create_task(fetcher.fetch_aqi(city))
            for city in cities
            if settings.has_real_aqi_data
        }

        if weather_tasks:
            weather_results = await asyncio.gather(*weather_tasks.values(), return_exceptions=True)
            for city, result in zip(weather_tasks.keys(), weather_results):
                if isinstance(result, Exception):
                    logger.warning("weather_fetch_failed", city=city, error=str(result))
                else:
                    weather_by_city[city] = result

        if traffic_tasks:
            traffic_results = await asyncio.gather(*traffic_tasks.values(), return_exceptions=True)
            for city, result in zip(traffic_tasks.keys(), traffic_results):
                if isinstance(result, Exception):
                    logger.warning("traffic_fetch_failed", city=city, error=str(result))
                else:
                    traffic_by_city[city] = result

        if aqi_tasks:
            aqi_results = await asyncio.gather(*aqi_tasks.values(), return_exceptions=True)
            for city, result in zip(aqi_tasks.keys(), aqi_results):
                if isinstance(result, Exception):
                    logger.warning("aqi_fetch_failed", city=city, error=str(result))
                else:
                    aqi_by_city[city] = result

    snapshots: list[MultiOracleSnapshot] = []
    for city, h3_hex in zone_contexts:
        city_rng = Random(f"{city}-{now.strftime('%Y-%m-%d-%H')}-{seeded_rng.random():.6f}")
        mock_weather, mock_traffic, mock_aqi = _mock_city_signals(city, now, city_rng)
        weather = weather_by_city.get(city, mock_weather)
        traffic = traffic_by_city.get(city, mock_traffic)
        aqi = aqi_by_city.get(city, mock_aqi)

        snapshots.append(
            MultiOracleSnapshot(
                city=city,
                h3_hex=h3_hex,
                weather_condition=str(weather.get("weather_condition", "unknown")),
                rain_mm_per_hr=_safe_float(weather.get("rain_mm_per_hr"), 0.0),
                traffic_condition=str(traffic.get("traffic_condition", "unknown")),
                traffic_avg_speed_kmh=_safe_float(traffic.get("traffic_avg_speed_kmh"), 0.0),
                traffic_delay_min_per_km=_safe_float(traffic.get("traffic_delay_min_per_km"), 0.0),
                aqi=_safe_float(aqi.get("aqi"), 0.0),
                weather_source=str(weather.get("source", "openweather_mock")),
                traffic_source=str(traffic.get("source", "tomtom_mock")),
                aqi_source=str(aqi.get("source", "cpcb_mock")),
            )
        )
    return snapshots
