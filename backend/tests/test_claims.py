from services.hermes.settlement import payout_pct_from_fraud_status


def test_fraud_to_payout_mapping():
    assert payout_pct_from_fraud_status("approved") == 1.0
    assert payout_pct_from_fraud_status("flagged") == 0.8
    assert payout_pct_from_fraud_status("blocked") == 0.0

