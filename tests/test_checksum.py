import hashlib
from pathlib import Path

from wepaper.checksum import sha256_bytes, sha256_file, verify_checksum


def test_sha256_bytes_matches_stdlib() -> None:
    payload = b"%PDF-1.4 minimal"
    assert sha256_bytes(payload) == hashlib.sha256(payload).hexdigest()


def test_sha256_file(tmp_path: Path) -> None:
    p = tmp_path / "a.pdf"
    p.write_bytes(b"hello-pdf")
    assert sha256_file(p) == hashlib.sha256(b"hello-pdf").hexdigest()


def test_verify_checksum_detects_corruption() -> None:
    good = sha256_bytes(b"abc")
    assert verify_checksum(b"abc", good) is True
    assert verify_checksum(b"abd", good) is False
    assert verify_checksum(b"abc", "00" * 32) is False
