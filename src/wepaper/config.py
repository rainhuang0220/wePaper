from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


def _home_config() -> Path:
    return Path(os.environ.get("WEPAPER_STATE_DIR") or Path.home() / ".config" / "wepaper")


@dataclass(slots=True)
class AgentConfig:
    collection_names: list[str]
    server_url: str
    sync_token: str
    poll_seconds: int
    state_dir: Path
    zotero_api: str

    @classmethod
    def load(cls) -> AgentConfig:
        raw = os.environ.get("WEPAPER_COLLECTION", "wePaper")
        names = [part.strip() for part in raw.split(",") if part.strip()]
        return cls(
            collection_names=names or ["wePaper"],
            server_url=os.environ.get("WEPAPER_SERVER_URL", "http://127.0.0.1:8788"),
            sync_token=os.environ.get("WEPAPER_SYNC_TOKEN", ""),
            poll_seconds=int(os.environ.get("WEPAPER_POLL_SECONDS", "60")),
            state_dir=_home_config(),
            zotero_api=os.environ.get("WEPAPER_ZOTERO_API", "http://127.0.0.1:23119/api"),
        )
