import pytest
from unittest.mock import patch
from crypto import encrypt_field, decrypt_field
from config import Settings

def test_encrypt_decrypt_roundtrip():
    # Setup mock settings to avoid dependency on env vars
    test_settings = Settings(
        SECRET_KEY="test-secret-key-that-is-at-least-32-chars-long",
        ENVIRONMENT="testing",
        DATABASE_URL="sqlite+aiosqlite:///:memory:"
    )

    with patch("crypto.get_settings", return_value=test_settings):
        original_text = "This is a sensitive secret!"
        encrypted_text = encrypt_field(original_text)

        assert encrypted_text != original_text
        assert isinstance(encrypted_text, str)

        decrypted_text = decrypt_field(encrypted_text)
        assert decrypted_text == original_text

def test_encrypt_different_outputs_for_same_input():
    # Fernet uses randomized IV, so same input should yield different encrypted strings
    test_settings = Settings(
        SECRET_KEY="test-secret-key-that-is-at-least-32-chars-long",
        ENVIRONMENT="testing",
        DATABASE_URL="sqlite+aiosqlite:///:memory:"
    )

    with patch("crypto.get_settings", return_value=test_settings):
        text = "Constant"
        enc1 = encrypt_field(text)
        enc2 = encrypt_field(text)

        assert enc1 != enc2
        assert decrypt_field(enc1) == decrypt_field(enc2) == text

def test_empty_string():
    test_settings = Settings(
        SECRET_KEY="test-secret-key-that-is-at-least-32-chars-long",
        ENVIRONMENT="testing",
        DATABASE_URL="sqlite+aiosqlite:///:memory:"
    )

    with patch("crypto.get_settings", return_value=test_settings):
        original_text = ""
        encrypted_text = encrypt_field(original_text)
        decrypted_text = decrypt_field(encrypted_text)

        assert decrypted_text == original_text

def test_decrypt_invalid_token():
    from cryptography.fernet import InvalidToken

    test_settings = Settings(
        SECRET_KEY="test-secret-key-that-is-at-least-32-chars-long",
        ENVIRONMENT="testing",
        DATABASE_URL="sqlite+aiosqlite:///:memory:"
    )

    with patch("crypto.get_settings", return_value=test_settings):
        with pytest.raises(InvalidToken):
            decrypt_field("invalid-token")
