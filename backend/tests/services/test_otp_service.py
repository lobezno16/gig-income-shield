import pytest
from unittest.mock import AsyncMock, patch

from services.otp_service import (
    verify_otp,
    OtpMaxAttemptsError,
    MAX_VERIFY_ATTEMPTS,
    _otp_key,
    _verify_attempts_key,
    _session_key,
)

@pytest.mark.asyncio
@patch("services.otp_service._decode_and_validate_otp_token")
async def test_verify_otp_max_attempts_exceeded(mock_decode):
    mock_decode.return_value = None
    phone = "+1234567890"
    otp = "123456"
    otp_token = "mock_token"

    redis_client = AsyncMock()

    # Simulate active session token matches
    redis_client.get.side_effect = lambda k: {
        _session_key(phone): otp_token,
        _otp_key(phone): "654321",  # Some expected OTP, doesn't matter for the first check if max attempts triggers first
    }.get(k)

    # Mock incr to return MAX_VERIFY_ATTEMPTS + 1 to simulate exceeding limit
    redis_client.incr.return_value = MAX_VERIFY_ATTEMPTS + 1

    with pytest.raises(OtpMaxAttemptsError) as exc_info:
        await verify_otp(phone, otp, otp_token, redis_client)

    assert "Maximum OTP verification attempts exceeded" in str(exc_info.value)

    # Verify redis_client.incr was called with the correct key
    redis_client.incr.assert_called_once_with(_verify_attempts_key(phone))

    # Verify _invalidate_otp_state was called which calls redis_client.delete
    redis_client.delete.assert_called_once_with(
        _otp_key(phone),
        _verify_attempts_key(phone),
        _session_key(phone),
    )

@pytest.mark.asyncio
@patch("services.otp_service._decode_and_validate_otp_token")
async def test_verify_otp_max_attempts_exceeded_on_wrong_code(mock_decode):
    mock_decode.return_value = None
    phone = "+1234567890"
    otp = "wrong_code"
    otp_token = "mock_token"

    redis_client = AsyncMock()

    # Simulate active session token matches
    redis_client.get.side_effect = lambda k: {
        _session_key(phone): otp_token,
        _otp_key(phone): "654321",  # Wrong code
    }.get(k)

    # If otp != expected_otp and verify_attempts >= MAX_VERIFY_ATTEMPTS, it raises the max attempts error.
    redis_client.incr.return_value = MAX_VERIFY_ATTEMPTS

    with pytest.raises(OtpMaxAttemptsError) as exc_info:
        await verify_otp(phone, otp, otp_token, redis_client)

    assert "Maximum OTP verification attempts exceeded" in str(exc_info.value)

    # Verify redis_client.incr was called with the correct key
    redis_client.incr.assert_called_once_with(_verify_attempts_key(phone))

    # Verify _invalidate_otp_state was called which calls redis_client.delete
    redis_client.delete.assert_called_once_with(
        _otp_key(phone),
        _verify_attempts_key(phone),
        _session_key(phone),
    )
