from __future__ import annotations

from pathlib import Path

import httpx

from wepaper.agent import run_daemon
from wepaper.config import AgentConfig


def _config(tmp_path: Path) -> AgentConfig:
    return AgentConfig(
        collection_names=["wePaper"],
        server_url="http://127.0.0.1:1",
        sync_token="token",
        poll_seconds=1,
        state_dir=tmp_path,
        zotero_api="http://127.0.0.1:9/api",
    )


def test_run_daemon_retries_connect_error_instead_of_exiting(tmp_path: Path, monkeypatch) -> None:
    calls = {"n": 0}

    def boom(*_args, **_kwargs):
        calls["n"] += 1
        if calls["n"] < 3:
            raise httpx.ConnectError("connection refused")
        raise KeyboardInterrupt()

    monkeypatch.setattr("wepaper.agent.run_agent_cycle", boom)
    monkeypatch.setattr("wepaper.agent.time.sleep", lambda _seconds: None)
    assert run_daemon(config=_config(tmp_path)) == 0
    assert calls["n"] >= 3


def test_second_daemon_exits_cleanly_when_lock_held(tmp_path: Path) -> None:
    config = _config(tmp_path)
    config.state_dir.mkdir(parents=True, exist_ok=True)
    lock = (config.state_dir / "wepaper.lock").open("w")
    import fcntl

    fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    assert run_daemon(config=config) == 0
