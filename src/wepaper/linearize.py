from __future__ import annotations

import logging
from pathlib import Path

from wepaper.settings import Settings

log = logging.getLogger("wepaper")


def linearized_path(settings: Settings, storage_key: str) -> Path:
    root = (settings.blob_dir / "linearized").resolve()
    dest = (root / storage_key[:2] / storage_key[2:4] / storage_key).resolve()
    dest.relative_to(root)
    return dest


def ensure_linearized(source: Path, dest: Path) -> Path | None:
    if not source.is_file():
        return None
    if dest.is_file() and dest.stat().st_mtime >= source.stat().st_mtime and dest.stat().st_size > 8:
        return dest
    dest.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    tmp = dest.with_name(f"{dest.name}.partial")
    try:
        import pikepdf

        with pikepdf.open(source) as pdf:
            pdf.save(tmp, linearize=True)
        data = tmp.read_bytes()
        if not data.startswith(b"%PDF") or len(data) < 8:
            tmp.unlink(missing_ok=True)
            return None
        tmp.replace(dest)
        dest.chmod(0o600)
        return dest
    except Exception:
        log.warning("linearize failed for %s", source.name)
        tmp.unlink(missing_ok=True)
        return None


def linearize_blob_tree(settings: Settings) -> int:
    root = settings.blob_dir.resolve()
    if not root.is_dir():
        return 0
    count = 0
    for path in root.rglob("*.pdf"):
        if "linearized" in path.parts or path.name.endswith(".partial"):
            continue
        dest = linearized_path(settings, path.name)
        if ensure_linearized(path, dest):
            count += 1
    return count
