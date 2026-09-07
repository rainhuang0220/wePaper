from __future__ import annotations

import re
from pathlib import PurePosixPath, PureWindowsPath

_UNSAFE = re.compile(r'[\x00-\x1f\x7f?"\\<>|:;]')
_ALLOWED_EXT = {".pdf"}


def sanitize_filename(name: str, fallback: str = "file.pdf") -> str:
    raw = (name or "").replace("\\", "/")
    base = PurePosixPath(raw).name or PureWindowsPath(name or "").name
    base = _UNSAFE.sub("", base)
    base = re.sub(r"\s+", " ", base).strip().strip(".")
    if not base or base in {".", ".."}:
        return fallback
    return base[:240]


def safe_storage_name(digest: str, filename: str) -> str:
    hex_id = "".join(c for c in digest.lower() if c in "0123456789abcdef") or "blob"
    suffix = PurePosixPath(sanitize_filename(filename, "file.bin")).suffix.lower()
    ext = suffix if suffix in _ALLOWED_EXT else ".bin"
    return f"{hex_id}{ext}"
