from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


def _home_config() -> Path:
    return Path(os.environ.get("WEPAPER_STATE_DIR") or Path.home() / ".config" / "wepaper")


def _apply_agent_env() -> None:
    path = _home_config() / "agent.env"
    if not path.is_file():
        return
    for raw in path.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        if not key.startswith("WEPAPER_") or key in os.environ:
            continue
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
            value = value[1:-1]
        os.environ[key] = value


@dataclass(slots=True)
class AgentConfig:
    collection_names: list[str]
    server_url: str
    sync_token: str
    poll_seconds: int
    state_dir: Path
    zotero_api: str
    detect_seconds: float = 2.0
    debounce_seconds: float = 2.0
    reconcile_seconds: float = 300.0
    retry_seconds: float = 5.0
    pdf_quiet_seconds: float = 2.0

    @classmethod
    def load(cls) -> AgentConfig:
        _apply_agent_env()
        raw = os.environ.get("WEPAPER_COLLECTION", "wePaper")
        names = [part.strip() for part in raw.split(",") if part.strip()]
        return cls(
            collection_names=names or ["wePaper"],
            server_url=os.environ.get("WEPAPER_SERVER_URL", "http://127.0.0.1:8788"),
            sync_token=os.environ.get("WEPAPER_SYNC_TOKEN", ""),
            poll_seconds=int(os.environ.get("WEPAPER_POLL_SECONDS", "60")),
            state_dir=_home_config(),
            zotero_api=os.environ.get("WEPAPER_ZOTERO_API", "http://127.0.0.1:23119/api"),
            detect_seconds=float(os.environ.get("WEPAPER_DETECT_SECONDS", "2")),
            debounce_seconds=float(os.environ.get("WEPAPER_DEBOUNCE_SECONDS", "2")),
            reconcile_seconds=float(os.environ.get("WEPAPER_RECONCILE_SECONDS", "300")),
            retry_seconds=float(os.environ.get("WEPAPER_RETRY_SECONDS", "5")),
            pdf_quiet_seconds=float(os.environ.get("WEPAPER_PDF_QUIET_SECONDS", "2")),
        )
