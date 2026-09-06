from __future__ import annotations

from pathlib import Path
import html
import os
import shutil
import subprocess

PLIST_NAME = "space.plainlist.wepaper.plist"


def _env_file() -> Path:
    return Path(os.environ.get("WEPAPER_STATE_DIR") or Path.home() / ".config" / "wepaper") / "agent.env"


def write_agent_env() -> Path:
    path = _env_file()
    path.parent.mkdir(parents=True, exist_ok=True)
    token = os.environ.get("WEPAPER_SYNC_TOKEN", "")
    if path.exists() and not token:
        return path
    body = "\n".join(
        [
            f"WEPAPER_COLLECTION={os.environ.get('WEPAPER_COLLECTION', 'wePaper')}",
            f"WEPAPER_SERVER_URL={os.environ.get('WEPAPER_SERVER_URL', 'https://plainlist.space/wepaper')}",
            f"WEPAPER_SYNC_TOKEN={token}",
            f"WEPAPER_POLL_SECONDS={os.environ.get('WEPAPER_POLL_SECONDS', '60')}",
            "",
        ]
    )
    path.write_text(body)
    path.chmod(0o600)
    return path


def install_launch_agent(destination: str | None = None) -> None:
    repo_bin = Path(__file__).resolve().parents[2] / ".venv" / "bin" / "wepaper"
    wepaper = html.escape(shutil.which("wepaper") or (str(repo_bin) if repo_bin.is_file() else "wepaper"))
    env_path = html.escape(str(write_agent_env()))
    dest = Path(destination or Path.home() / "Library" / "LaunchAgents" / PLIST_NAME)
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(
        f"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>space.plainlist.wepaper</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/zsh</string>
    <string>-lc</string>
    <string>set -a &amp;&amp; source {env_path} &amp;&amp; exec {wepaper} daemon</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
</dict>
</plist>
"""
    )
    dest.chmod(0o600)
    subprocess.run(["launchctl", "bootout", f"gui/{os.getuid()}/space.plainlist.wepaper"], check=False)
    subprocess.run(["launchctl", "bootstrap", f"gui/{os.getuid()}", str(dest)], check=False)
    print(f"Installed {dest}")
    print(f"Env file {env_path} (mode 0600, not in git)")
