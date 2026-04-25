from __future__ import annotations

import pytest

from services.hermes.payout_service import build_idempotency_key
from services.hermes.upi_mock import mock_gateway_transfer


def test_idempotency_key_uses_trigger_plus_worker_ids():
    trigger_id = "00000000-0000-0000-0000-000000000123"
    worker_id = "00000000-0000-0000-0000-000000000456"
    assert build_idempotency_key(trigger_id, worker_id) == f"{trigger_id}:{worker_id}"


@pytest.mark.asyncio
async def test_gateway_mock_returns_same_result_for_same_idempotency_key():
    key = "evt123:worker456"
    first = await mock_gateway_transfer(
        provider="razorpay_test",
        upi_id="worker@ybl",
        amount=100.0,
        payout_id="CLM0001",
        purpose="payout",
        idempotency_key=key,
    )
    second = await mock_gateway_transfer(
        provider="razorpay_test",
        upi_id="worker@ybl",
        amount=100.0,
        payout_id="CLM0001",
        purpose="payout",
        idempotency_key=key,
    )
    assert first.success == second.success
    assert first.payout_id == second.payout_id
    assert first.bank_ref == second.bank_ref


@pytest.mark.asyncio
async def test_tokens_are_different_after_cache_clear():
    """
    Ensures that different tokens are generated for the same idempotency key
    if the cache is cleared, proving that the random generation is no longer
    predictably tied to the key.
    """
    from services.hermes.upi_mock import _IDEMPOTENCY_CACHE
    key = "same_key"

    _IDEMPOTENCY_CACHE.clear()
    first = await mock_gateway_transfer(
        provider="razorpay_test",
        upi_id="worker@ybl",
        amount=100.0,
        payout_id="CLM0001",
        purpose="payout",
        idempotency_key=key,
    )

    _IDEMPOTENCY_CACHE.clear()
    second = await mock_gateway_transfer(
        provider="razorpay_test",
        upi_id="worker@ybl",
        amount=100.0,
        payout_id="CLM0001",
        purpose="payout",
        idempotency_key=key,
    )

    # If both were successful, they should have different IDs and UTRs
    if first.success and second.success:
        assert first.payout_id != second.payout_id
        assert first.bank_ref != second.bank_ref
