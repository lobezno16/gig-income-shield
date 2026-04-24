from datetime import datetime, timezone
from unittest.mock import MagicMock

from models.claim import Claim, ClaimStatus
from models.worker import Worker
from routers.claims import build_claim_timeline
from services.hermes.settlement import payout_pct_from_fraud_status


def test_fraud_to_payout_mapping():
    assert payout_pct_from_fraud_status("approved") == 1.0
    assert payout_pct_from_fraud_status("flagged") == 0.8
    assert payout_pct_from_fraud_status("blocked") == 0.0


def test_build_claim_timeline_processing():
    claim_mock = MagicMock(spec=Claim)
    claim_mock.created_at = datetime(2023, 1, 1, 12, 0, tzinfo=timezone.utc)
    claim_mock.status.value = "processing"
    claim_mock.settled_at = None
    claim_mock.fraud_score = 0.0
    claim_mock.upi_ref = None

    worker_mock = MagicMock(spec=Worker)
    worker_mock.upi_id_decrypted = None

    timeline = build_claim_timeline(claim_mock, worker_mock, amount=100.0)

    assert len(timeline) == 6
    assert timeline[3]["status"] == "active"
    for i in range(3):
        assert timeline[i]["status"] == "completed"
    for i in range(4, 6):
        assert timeline[i]["status"] == "future"


def test_build_claim_timeline_paid():
    claim_mock = MagicMock(spec=Claim)
    claim_mock.created_at = datetime(2023, 1, 1, 12, 0, tzinfo=timezone.utc)
    claim_mock.status.value = "paid"
    claim_mock.settled_at = datetime(2023, 1, 1, 12, 5, tzinfo=timezone.utc)
    claim_mock.fraud_score = 0.0
    claim_mock.upi_ref = "payout_123|bank_456"

    worker_mock = MagicMock(spec=Worker)
    worker_mock.upi_id_decrypted = None

    timeline = build_claim_timeline(claim_mock, worker_mock, amount=100.0)

    assert len(timeline) == 6
    assert timeline[5]["status"] == "active"
    for i in range(5):
        assert timeline[i]["status"] == "completed"

    confirmed_step = next((step for step in timeline if step["id"] == "confirmed"), None)
    assert confirmed_step is not None
    assert "UPI Ref: payout_123" in confirmed_step["description"]


def test_build_claim_timeline_blocked():
    claim_mock = MagicMock(spec=Claim)
    claim_mock.created_at = datetime(2023, 1, 1, 12, 0, tzinfo=timezone.utc)
    claim_mock.status.value = "blocked"
    claim_mock.settled_at = None
    claim_mock.fraud_score = 1.0
    claim_mock.upi_ref = None

    worker_mock = MagicMock(spec=Worker)
    worker_mock.upi_id_decrypted = None

    timeline = build_claim_timeline(claim_mock, worker_mock, amount=100.0)

    assert len(timeline) == 6
    assert timeline[2]["status"] == "active"
    for i in range(2):
        assert timeline[i]["status"] == "completed"
    for i in range(3, 6):
        assert timeline[i]["status"] == "future"
