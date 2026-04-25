import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from datetime import datetime, timedelta, timezone

from backend.auth_utils import (
    blacklist_token,
    is_token_blacklisted,
    create_access_token,
    settings,
    ALGORITHM
)
from jose import jwt

@pytest.mark.asyncio
async def test_blacklist_token_valid():
    redis_client = AsyncMock()
    token = create_access_token(subject="user1", expires_minutes=10)

    await blacklist_token(token, redis_client)

    payload = jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])
    jti = payload["jti"]

    # TTL should be around 10 minutes (600 seconds)
    redis_client.setex.assert_called_once()
    args, kwargs = redis_client.setex.call_args
    assert args[0] == f"blacklist:{jti}"
    assert 590 <= args[1] <= 600
    assert args[2] == "1"

@pytest.mark.asyncio
async def test_blacklist_token_expired():
    redis_client = AsyncMock()

    # Create an expired token by mocking datetime during creation and blacklisting, or just mock jwt.decode
    with patch("backend.auth_utils.jwt.decode") as mock_decode:
        mock_decode.return_value = {
            "sub": "user1",
            "jti": "old_jti",
            "exp": int((datetime.now(timezone.utc) - timedelta(minutes=10)).timestamp())
        }
        await blacklist_token("dummy_token", redis_client)

    redis_client.setex.assert_not_called()

@pytest.mark.asyncio
async def test_blacklist_token_no_jti():
    redis_client = AsyncMock()

    exp_time = int((datetime.now(timezone.utc) + timedelta(minutes=10)).timestamp())
    with patch("backend.auth_utils.jwt.decode") as mock_decode:
        mock_decode.return_value = {
            "sub": "user1",
            "exp": exp_time
        }
        await blacklist_token("dummy_token", redis_client)

    redis_client.setex.assert_called_once()
    args, kwargs = redis_client.setex.call_args
    assert args[0] == f"blacklist:token:user1:{exp_time}"
    assert args[2] == "1"

@pytest.mark.asyncio
async def test_blacklist_token_invalid():
    redis_client = AsyncMock()

    await blacklist_token("invalid_token", redis_client)

    redis_client.setex.assert_not_called()

@pytest.mark.asyncio
async def test_is_token_blacklisted():
    redis_client = AsyncMock()
    redis_client.get.return_value = b"1"

    result = await is_token_blacklisted({"jti": "some_jti"}, redis_client)
    assert result is True
    redis_client.get.assert_called_once_with("blacklist:some_jti")

@pytest.mark.asyncio
async def test_is_token_not_blacklisted():
    redis_client = AsyncMock()
    redis_client.get.return_value = None

    result = await is_token_blacklisted({"jti": "some_jti"}, redis_client)
    assert result is False
