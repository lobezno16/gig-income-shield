from __future__ import annotations

import base64
import hashlib

from cryptography.fernet import Fernet

from config import get_settings


def _get_fernet() -> Fernet:
    key = hashlib.sha256(get_settings().secret_key.encode("utf-8")).digest()
    return Fernet(base64.urlsafe_b64encode(key))


def encrypt_field(value: str) -> str:
    return _get_fernet().encrypt(value.encode("utf-8")).decode("utf-8")


def decrypt_field(value: str) -> str:
    return _get_fernet().decrypt(value.encode("utf-8")).decode("utf-8")
