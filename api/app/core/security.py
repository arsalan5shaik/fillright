from cryptography.fernet import Fernet

from app.core.config import get_settings


def _fernet() -> Fernet:
    key = get_settings().answer_encryption_key
    if not key:
        raise RuntimeError("ANSWER_ENCRYPTION_KEY is not configured")
    return Fernet(key.encode())


def encrypt_value(value: str) -> str:
    return _fernet().encrypt(value.encode()).decode()


def decrypt_value(value: str) -> str:
    return _fernet().decrypt(value.encode()).decode()
