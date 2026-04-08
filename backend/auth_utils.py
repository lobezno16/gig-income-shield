import secrets
from datetime import datetime, timedelta, timezone

from jose import JWTError, jwt

from config import get_settings

ALGORITHM = "HS256"
settings = get_settings()


def create_access_token(
    subject: str,
    role: str = "worker",
    expires_minutes: int = 1440,
) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": subject,
        "purpose": "access",
        "role": role,
        "jti": secrets.token_hex(16),
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=expires_minutes)).timestamp()),
    }
    return jwt.encode(payload, settings.secret_key, algorithm=ALGORITHM)


def create_otp_token(phone: str, expires_minutes: int = 5) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": phone,
        "purpose": "otp_verify",
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=expires_minutes)).timestamp()),
    }
    return jwt.encode(payload, settings.secret_key, algorithm=ALGORITHM)


def create_refresh_token(
    subject: str,
    role: str = "worker",
    expires_days: int = 7,
) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": subject,
        "purpose": "refresh",
        "role": role,
        "jti": secrets.token_hex(16),
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(days=expires_days)).timestamp()),
    }
    return jwt.encode(payload, settings.secret_key, algorithm=ALGORITHM)


async def decode_token(
    token: str,
    expected_purpose: str = "access",
    redis_client=None,
    check_blacklist: bool = False,
) -> dict | None:
    try:
        data = jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])
        if data.get("purpose") != expected_purpose:
            return None
        if check_blacklist and redis_client is not None:
            if await is_token_blacklisted(data, redis_client):
                return None
        return data
    except JWTError:
        return None


async def blacklist_token(token: str, redis_client) -> None:
    """Store token JTI in Redis with TTL matching token expiry."""
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])
        exp = int(payload.get("exp", 0) or 0)
        ttl = max(0, exp - int(datetime.now(timezone.utc).timestamp()))
        if ttl <= 0:
            return
        jti = payload.get("jti") or f"token:{payload.get('sub')}:{exp}"
        await redis_client.setex(f"blacklist:{jti}", ttl, "1")
    except JWTError:
        # Invalid token signatures/format do not require blacklisting.
        return


async def is_token_blacklisted(payload: dict, redis_client) -> bool:
    jti = payload.get("jti") or f"token:{payload.get('sub')}:{payload.get('exp', 0)}"
    result = await redis_client.get(f"blacklist:{jti}")
    return result is not None
