from __future__ import annotations

from pathlib import Path

from wepaper.launchd import PLIST_NAME, install_launch_agent, uninstall_launch_agent, write_agent_env


def test_plist_has_logs_and_does_not_embed_token(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("WEPAPER_SYNC_TOKEN", "super-secret-token")
    monkeypatch.setenv("WEPAPER_STATE_DIR", str(tmp_path / "cfg"))
    monkeypatch.setenv("HOME", str(tmp_path))
    dest = tmp_path / "LaunchAgents" / PLIST_NAME
    install_launch_agent(str(dest), load=False, isolate=False)
    text = dest.read_text()
    assert "super-secret-token" not in text
    assert "StandardOutPath" in text
    assert "StandardErrorPath" in text
    assert "RunAtLoad" in text
    assert "KeepAlive" in text
    assert "SuccessfulExit" in text
    assert "zsh" not in text
    env = (tmp_path / "cfg" / "agent.env").read_text()
    assert "super-secret-token" in env
    wrapper = (tmp_path / "cfg" / "run-daemon.sh").read_text()
    assert "super-secret-token" not in wrapper
    assert "agent.env" in wrapper


def test_write_agent_env_preserves_existing_token(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("WEPAPER_STATE_DIR", str(tmp_path))
    monkeypatch.delenv("WEPAPER_SYNC_TOKEN", raising=False)
    path = tmp_path / "agent.env"
    path.write_text("WEPAPER_SYNC_TOKEN='already'\n")
    path.chmod(0o600)
    write_agent_env()
    assert "already" in path.read_text()


def test_uninstall_removes_plist(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("HOME", str(tmp_path))
    dest = tmp_path / "Library" / "LaunchAgents" / PLIST_NAME
    dest.parent.mkdir(parents=True)
    dest.write_text("<plist/>")
    uninstall_launch_agent(destination=str(dest), unload=False)
    assert not dest.exists()
