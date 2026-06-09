"""Local config + at-rest token encryption key.

Local dev tool: state lives under ~/.chroma_ultimate_ui by default.
"""
from __future__ import annotations

import os
from pathlib import Path

from cryptography.fernet import Fernet

DATA_DIR = Path(os.environ.get("CUI_DATA_DIR", Path.home() / ".chroma_ultimate_ui"))
DB_PATH = DATA_DIR / "store.db"
KEY_PATH = DATA_DIR / "secret.key"

# Migration batch size (rows fetched/written per page).
# Default 50 — the source server is weak, so keep pages small.
# Bump this (env CUI_BATCH or edit here) when the server can take more.
DEFAULT_BATCH = int(os.environ.get("CUI_BATCH", "100"))

# Dump runs strictly sequentially: one job (one collection) at a time, so the
# weak host is never hit by parallel copies. This is a hard cap, not a default.
MAX_CONCURRENT_JOBS = int(os.environ.get("CUI_MAX_CONCURRENT_JOBS", "1"))


def _load_or_create_key() -> bytes:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if KEY_PATH.exists():
        return KEY_PATH.read_bytes()
    key = Fernet.generate_key()
    KEY_PATH.write_bytes(key)
    KEY_PATH.chmod(0o600)
    return key


_fernet = Fernet(_load_or_create_key())


def encrypt(plaintext: str) -> str:
    if not plaintext:
        return ""
    return _fernet.encrypt(plaintext.encode()).decode()


def decrypt(ciphertext: str) -> str:
    if not ciphertext:
        return ""
    return _fernet.decrypt(ciphertext.encode()).decode()
