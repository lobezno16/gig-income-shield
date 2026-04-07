from __future__ import annotations

import hashlib
import secrets
from dataclasses import dataclass

import structlog
from jose import ExpiredSignatureError, JWTError, jwt

from auth_utils import ALGORITHM, create_otp_token
from config import get_settings

OTP_TTL_SECONDS = 300
OTP_SEND_WINDOW_SECONDS = 900
MAX_SEND_ATTEMPTS = 3
MAX_VERIFY_ATTEMPTS = 5

logger = structlog.get_logger("otp-service")
settings = get_settings()


@dataclass(slots=True)
class OtpSendResult:
    otp_token: str
    expires_in_seconds: int
    mock_otp: str | None = None


@dataclass(slots=True)
class OtpVerifyResult:
    verified: bool


class OtpServiceError(Exception):
    pass


class OtpRateLimitError(OtpServiceError):
    def __init__(self, retry_after_seconds: int) -> None:
        super().__init__("OTP rate limit exceeded")
        self.retry_after_seconds = retry_after_seconds


class OtpInvalidTokenError(OtpServiceError):
    pass


class OtpExpiredError(OtpServiceError):
    pass


class OtpWrongCodeError(OtpServiceError):
    pass


class OtpMaxAttemptsError(OtpServiceError):
    pass


def _otp_key(phone: str) -> str:
    return f"otp:{phone}"


def _send_attempts_key(phone: str) -> str:
    return f"otp_attempts:{phone}"


def _verify_attempts_key(phone: str) -> str:
    return f"otp_verify_attempts:{phone}"


def _session_key(phone: str) -> str:
    return f"otp_session:{phone}"


def _verified_key(phone: str, otp_token: str) -> str:
    token_hash = hashlib.sha256(otp_token.encode("utf-8")).hexdigest()
    return f"otp_verified:{phone}:{token_hash}"


def _decode_and_validate_otp_token(phone: str, otp_token: str) -> None:
    try:
        payload = jwt.decode(otp_token, settings.secret_key, algorithms=[ALGORITHM])
    except ExpiredSignatureError as exc:
        raise OtpExpiredError("OTP token expired") from exc
    except JWTError as exc:
        raise OtpInvalidTokenError("OTP token is invalid") from exc

    if payload.get("purpose") != "otp_verify":
        raise OtpInvalidTokenError("OTP token purpose mismatch")

    if payload.get("sub") != phone:
        raise OtpInvalidTokenError("OTP token phone mismatch")


async def _invalidate_otp_state(phone: str, redis_client) -> None:
    await redis_client.delete(
        _otp_key(phone),
        _verify_attempts_key(phone),
        _session_key(phone),
    )


async def send_otp(phone: str, redis_client) -> OtpSendResult:
    send_attempts_key = _send_attempts_key(phone)
    send_attempts = await redis_client.incr(send_attempts_key)
    if send_attempts == 1:
        await redis_client.expire(send_attempts_key, OTP_SEND_WINDOW_SECONDS)

    if send_attempts > MAX_SEND_ATTEMPTS:
        retry_after = await redis_client.ttl(send_attempts_key)
        if retry_after is None or retry_after <= 0:
            retry_after = OTP_SEND_WINDOW_SECONDS
        raise OtpRateLimitError(int(retry_after))

    otp = f"{secrets.randbelow(1_000_000):06d}"
    otp_token = create_otp_token(phone=phone, expires_minutes=5)

    await redis_client.set(_otp_key(phone), otp, ex=OTP_TTL_SECONDS)
    await redis_client.set(_session_key(phone), otp_token, ex=OTP_TTL_SECONDS)
    await redis_client.delete(_verify_attempts_key(phone))

    if settings.environment == "development":
        logger.debug("otp_generated", phone=phone, otp=otp)
        return OtpSendResult(
            otp_token=otp_token,
            expires_in_seconds=OTP_TTL_SECONDS,
            mock_otp=otp,
        )

    return OtpSendResult(
        otp_token=otp_token,
        expires_in_seconds=OTP_TTL_SECONDS,
    )


async def verify_otp(phone: str, otp: str, otp_token: str, redis_client) -> OtpVerifyResult:
    _decode_and_validate_otp_token(phone=phone, otp_token=otp_token)

    active_session_token = await redis_client.get(_session_key(phone))
    if not active_session_token:
        raise OtpExpiredError("OTP session has expired")
    if active_session_token != otp_token:
        raise OtpInvalidTokenError("OTP token does not match active challenge")

    expected_otp = await redis_client.get(_otp_key(phone))
    if not expected_otp:
        raise OtpExpiredError("OTP has expired")

    verify_attempts_key = _verify_attempts_key(phone)
    verify_attempts = await redis_client.incr(verify_attempts_key)
    if verify_attempts == 1:
        await redis_client.expire(verify_attempts_key, OTP_TTL_SECONDS)

    if verify_attempts > MAX_VERIFY_ATTEMPTS:
        await _invalidate_otp_state(phone, redis_client)
        raise OtpMaxAttemptsError("Maximum OTP verification attempts exceeded")

    if otp != expected_otp:
        if verify_attempts >= MAX_VERIFY_ATTEMPTS:
            await _invalidate_otp_state(phone, redis_client)
            raise OtpMaxAttemptsError("Maximum OTP verification attempts exceeded")
        raise OtpWrongCodeError("OTP code is incorrect")

    await _invalidate_otp_state(phone, redis_client)
    await redis_client.set(_verified_key(phone, otp_token), "1", ex=OTP_SEND_WINDOW_SECONDS)
    return OtpVerifyResult(verified=True)


async def consume_phone_verification(phone: str, otp_token: str, redis_client) -> bool:
    verification_key = _verified_key(phone, otp_token)
    deleted = await redis_client.delete(verification_key)
    return int(deleted) == 1
