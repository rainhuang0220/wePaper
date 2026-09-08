from pathlib import Path

from wepaper.agent import daemon_pause_seconds
from wepaper.config import AgentConfig
from wepaper.loop import TickAction, TickResult


def _config() -> AgentConfig:
    return AgentConfig(
        collection_names=["wePaper"],
        server_url="http://127.0.0.1:1",
        sync_token="token",
        poll_seconds=1,
        state_dir=Path("."),
        zotero_api="http://127.0.0.1:9/api",
        detect_seconds=2.0,
        retry_seconds=5.0,
    )


def test_daemon_always_pauses_after_sync_or_coalesce() -> None:
    config = _config()
    assert daemon_pause_seconds(config, TickResult(TickAction.SYNC, "startup")) == 2.0
    assert daemon_pause_seconds(config, TickResult(TickAction.IDLE, "unchanged")) == 2.0
    assert daemon_pause_seconds(config, TickResult(TickAction.PERIODIC, "reconcile")) == 2.0
    assert daemon_pause_seconds(config, TickResult(TickAction.OFFLINE, "zotero")) == 5.0
