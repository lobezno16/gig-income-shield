import pytest
from cryptography.fernet import InvalidToken

from models.worker import Worker, Platform, WorkerTier
from models.user import UserRole
from crypto import encrypt_field

def test_upi_id_decrypted_success():
    plain_upi = "testuser@upi"
    encrypted_upi = encrypt_field(plain_upi)

    worker = Worker(
        phone="1234567890",
        platform=Platform.zepto,
        city="TestCity",
        h3_hex="8a283082a677fff",
        upi_id=encrypted_upi,
        role=UserRole.worker,
    )

    assert worker.upi_id_decrypted == plain_upi

def test_upi_id_decrypted_failure_raises_exception():
    # Invalid token (e.g. plaintext string that fails decryption)
    plain_upi = "testuser@upi"

    worker = Worker(
        phone="1234567890",
        platform=Platform.zepto,
        city="TestCity",
        h3_hex="8a283082a677fff",
        upi_id=plain_upi,  # not encrypted
        role=UserRole.worker,
    )

    with pytest.raises(InvalidToken):
        _ = worker.upi_id_decrypted

def test_upi_id_decrypted_none():
    worker = Worker(
        phone="1234567890",
        platform=Platform.zepto,
        city="TestCity",
        h3_hex="8a283082a677fff",
        upi_id=None,
        role=UserRole.worker,
    )

    assert worker.upi_id_decrypted is None
