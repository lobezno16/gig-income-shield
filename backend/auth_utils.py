from datetime import datetime, timedelta, timezone

from jose import JWTError, jwt

from config import get_settings

ALGORITHM = "HS256"
settings = get_settings()


def create_access_token(
    subject: str,
    role: str = "worker",
    expires_minutes: int = 1440,
    phone: str | None = None,
) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": subject,
        "purpose": "access",
        "role": role,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=expires_minutes)).timestamp()),
    }
    if phone:
        payload["phone"] = phone
    return jwt.encode(payload, settings.secret_key, algorithm=ALGORITHM)


def create_otp_token(phone: str, expires_minutes: int = 5) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": phone,
        "phone": phone,
        "purpose": "otp_verify",
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=expires_minutes)).timestamp()),
    }
    return jwt.encode(payload, settings.secret_key, algorithm=ALGORITHM)


def create_refresh_token(
    subject: str,
    role: str = "worker",
    expires_days: int = 7,
    phone: str | None = None,
) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": subject,
        "purpose": "refresh",
        "role": role,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(days=expires_days)).timestamp()),
    }
    if phone:
        payload["phone"] = phone
    return jwt.encode(payload, settings.secret_key, algorithm=ALGORITHM)


def decode_token(token: str, expected_purpose: str = "access") -> dict | None:
    try:
        data = jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])
        if data.get("purpose") != expected_purpose:
            return None
        return data
    except JWTError:
        return None
