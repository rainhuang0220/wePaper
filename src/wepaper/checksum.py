from __future__ import annotations

import hashlib
from pathlib import Path


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while True:
            chunk = handle.read(1024 * 1024)
            if not chunk:
                break
            digest.update(chunk)
    return digest.hexdigest()


def verify_checksum(data: bytes, expected_hex: str) -> bool:
    if not expected_hex or len(expected_hex) != 64:
        return False
    actual = sha256_bytes(data)
    return actual == expected_hex.lower()
