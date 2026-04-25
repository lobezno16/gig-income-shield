import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from datetime import datetime, timezone, timedelta
from uuid import uuid4

from models import Policy, PolicyStatus, Claim
from services.claims_orchestrator import _check_policy_validity, orchestrate_claim_for_worker

def test_check_policy_validity():
    assert _check_policy_validity(None) == "no_active_policy"

    # Active policy, no expiration
    policy = Policy(status=PolicyStatus.active, expires_at=None)
    assert _check_policy_validity(policy) is None

    # Active policy, future expiration
    policy.expires_at = datetime.now(timezone.utc) + timedelta(days=1)
    assert _check_policy_validity(policy) is None

    # Active policy, past expiration
    policy.expires_at = datetime.now(timezone.utc) - timedelta(days=1)
    assert _check_policy_validity(policy) == "policy_expired"

    # Lapsed policy
    policy.expires_at = datetime.now(timezone.utc) + timedelta(days=1)
    policy.status = PolicyStatus.lapsed
    assert _check_policy_validity(policy) == "policy_not_active"


@pytest.mark.asyncio
@patch("services.claims_orchestrator._queue_claim_settlement")
@patch("services.claims_orchestrator._publish_new_claim_event")
@patch("services.claims_orchestrator._evaluate_and_create_claim")
@patch("services.claims_orchestrator.get_latest_active_policy")
async def test_orchestrate_claim_for_worker_success(
    mock_get_policy,
    mock_evaluate_claim,
    mock_publish_event,
    mock_queue_settlement,
):
    mock_db = AsyncMock()
    mock_worker = MagicMock()
    mock_trigger = MagicMock()

    mock_policy = Policy(status=PolicyStatus.active, expires_at=None)
    mock_get_policy.return_value = mock_policy

    mock_claim = Claim(id=uuid4(), status="approved")
    mock_evaluate_claim.return_value = mock_claim

    mock_queue_settlement.return_value = {"settlement_status": "processing"}

    claim, settlement_info = await orchestrate_claim_for_worker(
        mock_db,
        worker=mock_worker,
        trigger=mock_trigger,
        gps_lat=10.0,
        gps_lng=20.0,
        platform_active_at_trigger=True,
    )

    assert claim == mock_claim
    assert settlement_info == {"settlement_status": "processing"}

    mock_get_policy.assert_called_once_with(mock_db, mock_worker.id)
    mock_evaluate_claim.assert_called_once()
    mock_publish_event.assert_called_once_with(mock_claim, mock_worker)
    mock_queue_settlement.assert_called_once_with(mock_claim, mock_worker)

@pytest.mark.asyncio
@patch("services.claims_orchestrator.get_latest_active_policy")
async def test_orchestrate_claim_for_worker_no_policy(mock_get_policy):
    mock_db = AsyncMock()
    mock_worker = MagicMock()
    mock_trigger = MagicMock()

    mock_get_policy.return_value = None

    claim, settlement_info = await orchestrate_claim_for_worker(
        mock_db,
        worker=mock_worker,
        trigger=mock_trigger,
        gps_lat=10.0,
        gps_lng=20.0,
    )

    assert claim is None
    assert settlement_info == {"reason": "no_active_policy"}
