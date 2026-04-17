from __future__ import annotations

from services.sentinelle.data_sources import MultiOracleSnapshot, classify_trigger_level, derive_trigger_candidates
from services.sentinelle.trigger_cron import is_hour_in_active_window


def test_strict_thresholds_for_phase3():
    assert classify_trigger_level("rain", 15.0) is None
    assert classify_trigger_level("rain", 15.01) is not None
    assert classify_trigger_level("curfew", 40.0) is None
    assert classify_trigger_level("curfew", 40.5) is not None
    assert classify_trigger_level("aqi", 450.0) is None
    assert classify_trigger_level("aqi", 451.0) is not None


def test_multi_oracle_candidates_include_weather_traffic_aqi():
    snapshot = MultiOracleSnapshot(
        city="delhi",
        h3_hex="892a1072b03ffff",
        weather_condition="heavy rain",
        rain_mm_per_hr=18.2,
        traffic_condition="roadblock",
        traffic_avg_speed_kmh=2.1,
        traffic_delay_min_per_km=48.5,
        aqi=472.0,
        weather_source="openweather_mock",
        traffic_source="tomtom_mock",
        aqi_source="cpcb_mock",
    )
    candidates = derive_trigger_candidates(snapshot)
    perils = {item.peril for item in candidates}
    assert {"rain", "curfew", "aqi"} <= perils


def test_active_hour_window_handles_overnight_shift():
    assert is_hour_in_active_window(23, 22, 4)
    assert is_hour_in_active_window(2, 22, 4)
    assert not is_hour_in_active_window(12, 22, 4)

