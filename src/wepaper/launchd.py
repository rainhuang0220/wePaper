from __future__ import annotations

from pathlib import Path
import html
import os
import re
import shutil
import subprocess

PLIST_NAME = "space.plainlist.wepaper.plist"
LABEL = "space.plainlist.wepaper"


def _env_file() -> Path:
    return Path(os.environ.get("WEPAPER_STATE_DIR") or Path.home() / ".config" / "wepaper") / "agent.env"


def _plist_path(destination: str | None = None) -> Path:
    return Path(destination or Path.home() / "Library" / "LaunchAgents" / PLIST_NAME)


def write_agent_env() -> Path:
    path = _env_file()
    path.parent.mkdir(parents=True, exist_ok=True)
    token = os.environ.get("WEPAPER_SYNC_TOKEN", "")
    if path.exists() and not token:
        return path

    def q(value: str) -> str:
        return "'" + value.replace("'", "'\"'\"'") + "'"

    body = "\n".join(
        [
            f"WEPAPER_COLLECTION={q(os.environ.get('WEPAPER_COLLECTION', 'wePaper'))}",
            f"WEPAPER_SERVER_URL={q(os.environ.get('WEPAPER_SERVER_URL', 'https://wepaper.plainlist.space'))}",
            f"WEPAPER_SYNC_TOKEN={q(token)}",
            f"WEPAPER_DETECT_SECONDS={os.environ.get('WEPAPER_DETECT_SECONDS', '2')}",
            f"WEPAPER_DEBOUNCE_SECONDS={os.environ.get('WEPAPER_DEBOUNCE_SECONDS', '2')}",
            f"WEPAPER_RECONCILE_SECONDS={os.environ.get('WEPAPER_RECONCILE_SECONDS', '300')}",
            f"WEPAPER_RETRY_SECONDS={os.environ.get('WEPAPER_RETRY_SECONDS', '5')}",
            f"WEPAPER_PDF_QUIET_SECONDS={os.environ.get('WEPAPER_PDF_QUIET_SECONDS', '2')}",
            "",
        ]
    )
    path.write_text(body)
    path.chmod(0o600)
    return path


def write_run_script(env_path: Path, wepaper: str) -> Path:
    script = env_path.parent / "run-daemon.sh"
    script.write_text(
        "\n".join(
            [
                "#!/bin/sh",
                "set -a",
                f'. "{env_path}"',
                "set +a",
                f'exec "{wepaper}" daemon',
                "",
            ]
        )
    )
    script.chmod(0o700)
    return script


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _wepaper_bin() -> str:
    isolated = _env_file().parent / "venv" / "bin" / "wepaper"
    if isolated.is_file():
        return str(isolated)
    repo_bin = _repo_root() / ".venv" / "bin" / "wepaper"
    return shutil.which("wepaper") or (str(repo_bin) if repo_bin.is_file() else "wepaper")


def _uv_bin() -> str:
    return shutil.which("uv") or str(Path.home() / ".local" / "bin" / "uv")


def ensure_runtime_venv() -> str:
    """Install a copy of wepaper outside Desktop so launchd is not blocked by TCC."""
    dest = _env_file().parent / "venv"
    python = dest / "bin" / "python"
    wepaper = dest / "bin" / "wepaper"
    if not python.is_file():
        subprocess.run([_uv_bin(), "venv", str(dest)], check=True)
    subprocess.run(
        [_uv_bin(), "pip", "install", "--python", str(python), str(_repo_root())],
        check=True,
    )
    if not wepaper.is_file():
        raise RuntimeError(f"failed to install wepaper into {dest}")
    return str(wepaper)


def install_launch_agent(
    destination: str | None = None,
    *,
    load: bool = True,
    isolate: bool | None = None,
) -> None:
    env_path = write_agent_env()
    wepaper = ensure_runtime_venv() if (load if isolate is None else isolate) else _wepaper_bin()
    script = write_run_script(env_path, wepaper)
    log_dir = env_path.parent / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)
    dest = _plist_path(destination)
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(
        f"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>{LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/sh</string>
    <string>{html.escape(str(script))}</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key><false/>
  </dict>
  <key>ThrottleInterval</key><integer>10</integer>
  <key>StandardOutPath</key><string>{html.escape(str(log_dir / "daemon.out.log"))}</string>
  <key>StandardErrorPath</key><string>{html.escape(str(log_dir / "daemon.err.log"))}</string>
</dict>
</plist>
"""
    )
    dest.chmod(0o600)
    if load:
        domain = f"gui/{os.getuid()}/{LABEL}"
        subprocess.run(["launchctl", "bootout", domain], check=False)
        subprocess.run(["launchctl", "bootstrap", f"gui/{os.getuid()}", str(dest)], check=False)
    print(f"Installed {dest}")
    print(f"Env file {env_path} (mode 0600, not in git)")
    print(f"Logs {log_dir}")


def uninstall_launch_agent(destination: str | None = None, *, unload: bool = True) -> None:
    dest = _plist_path(destination)
    if unload:
        subprocess.run(["launchctl", "bootout", f"gui/{os.getuid()}/{LABEL}"], check=False)
    if dest.is_file():
        dest.unlink()
        print(f"Removed {dest}")
    else:
        print(f"No plist at {dest}")


def launch_agent_runtime() -> dict[str, object]:
    try:
        listed = subprocess.run(
            ["launchctl", "list", LABEL],
            capture_output=True,
            text=True,
            check=False,
        )
    except OSError:
        return {"loaded": False, "running": False, "pid": None, "last_exit": None}
    if listed.returncode != 0:
        return {"loaded": False, "running": False, "pid": None, "last_exit": None}
    text = listed.stdout
    pid_match = re.search(r'"PID"\s*=\s*(\d+)', text)
    exit_match = re.search(r'"LastExitStatus"\s*=\s*(\d+)', text)
    pid = int(pid_match.group(1)) if pid_match else None
    last_exit = int(exit_match.group(1)) if exit_match else None
    return {"loaded": True, "running": pid is not None, "pid": pid, "last_exit": last_exit}
