from services.argus.fraud_pipeline import combine_fraud_scores
from services.argus.layer1_trust import SignalData, layer1_trust_score


def test_combine_fraud_scores_bounds():
    score = combine_fraud_scores(trust=0.9, isolation=0.1, z_score=0.2, ring_flag=0)
    assert 0 <= score <= 1


def test_inverted_gps_logic_for_storm():
    trust_bad, _ = layer1_trust_score(
        SignalData(
            cell_tower_match=1,
            gps_accuracy_meters=4.5,
            motion_score=0.9,
            wifi_score=0.9,
            battery_drain_score=0.8,
            network_quality_score=0.8,
            platform_status_score=1.0,
        ),
        peril="storm",
    )
    trust_good, _ = layer1_trust_score(
        SignalData(
            cell_tower_match=1,
            gps_accuracy_meters=18.0,
            motion_score=0.9,
            wifi_score=0.9,
            battery_drain_score=0.8,
            network_quality_score=0.8,
            platform_status_score=1.0,
        ),
        peril="storm",
    )
    assert trust_good > trust_bad

