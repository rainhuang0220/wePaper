from pathlib import Path

from wepaper.config import AgentConfig


def test_load_reads_agent_env_without_overriding(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("WEPAPER_STATE_DIR", str(tmp_path))
    monkeypatch.delenv("WEPAPER_COLLECTION", raising=False)
    monkeypatch.delenv("WEPAPER_SERVER_URL", raising=False)
    monkeypatch.setenv("WEPAPER_SYNC_TOKEN", "from-shell")
    (tmp_path / "agent.env").write_text(
        "WEPAPER_COLLECTION='Agent Memory'\n"
        "WEPAPER_SERVER_URL='https://wepaper.plainlist.space'\n"
        "WEPAPER_SYNC_TOKEN='from-file'\n"
    )
    config = AgentConfig.load()
    assert config.collection_names == ["Agent Memory"]
    assert config.server_url == "https://wepaper.plainlist.space"
    assert config.sync_token == "from-shell"
