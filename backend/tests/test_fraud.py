from __future__ import annotations

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import h3
import pytest

from services.argus.fraud_pipeline import combine_fraud_scores
from services.argus.layer0_rules import Layer0ClaimData
from services.argus.layer2_h3_velocity import evaluate_h3_velocity
from services.argus.layer4_multi_source_consensus import evaluate_multi_source_consensus


def test_combine_fraud_scores_bounds():
    score = combine_fraud_scores(trust=0.9, isolation=0.1, z_score=0.2, ring_flag=0)
    assert 0 <= score <= 1


@pytest.mark.asyncio
async def test_velocity_flagged_above_80_in_congested_zone():
    now = datetime.now(timezone.utc).replace(second=0, microsecond=0)
    ping1_hex = h3.latlng_to_cell(28.6139, 77.2090, 9)  # Delhi
    ping2_hex = h3.latlng_to_cell(28.4595, 77.0266, 9)  # Gurgaon
    claim_lat, claim_lng = 28.7041, 77.1025  # North Delhi

    claim_data = Layer0ClaimData(
        gps_lat=claim_lat,
        gps_lng=claim_lng,
        platform_active_at_trigger=True,
        timestamp=now,
        typical_shift_start=8,
        typical_shift_end=23,
        recent_h3_pings=[
            {"h3_hex": ping1_hex, "recorded_at": now - timedelta(minutes=20)},
            {"h3_hex": ping2_hex, "recorded_at": now - timedelta(minutes=10)},
        ],
        oracle_snapshot={"traffic_condition": "congested"},
    )

    result = await evaluate_h3_velocity(claim_data, city="delhi")
    assert result.decision == "flagged"
    assert "velocity_exceeds_80_kmh_in_congested_zone" in result.flags


@pytest.mark.asyncio
async def test_multi_source_consensus_flags_weather_traffic_anomaly():
    trigger = SimpleNamespace(
        peril=SimpleNamespace(value="rain"),
        reading_value=25.0,
    )
    claim_data = Layer0ClaimData(
        gps_lat=28.6139,
        gps_lng=77.2090,
        platform_active_at_trigger=True,
        timestamp=datetime.now(timezone.utc),
        typical_shift_start=8,
        typical_shift_end=23,
        oracle_snapshot={
            "weather_condition": "Heavy Rain",
            "rain_mm_per_hr": 22.0,
            "traffic_condition": "free_flowing",
            "traffic_avg_speed_kmh": 52.0,
            "traffic_delay_min_per_km": 1.2,
        },
    )

    result = await evaluate_multi_source_consensus(trigger, claim_data)
    assert result.decision == "flagged"
    assert "weather_traffic_consensus_anomaly" in result.flags

