from __future__ import annotations

import json
import logging
import time
from datetime import datetime, timezone
from pathlib import Path

from wepaper.config import AgentConfig
from wepaper.launchd import launch_agent_runtime
from wepaper.loop import ChangeLoop, LoopConfig, TickAction, TickResult, should_defer_for_pdfs
from wepaper.remote import ServerClient
from wepaper.sync_plan import Action, plan_sync
from wepaper.zotero import LocalAPI, Probe, ZoteroError, ZoteroSource

log = logging.getLogger("wepaper.sync")


def _log(action: str, **fields: object) -> None:
    extra = " ".join(f"{key}={value}" for key, value in fields.items() if value is not None)
    log.info("%s %s", action, extra)


def _now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def run_doctor(source: ZoteroSource | None = None, config: AgentConfig | None = None) -> int:
    config = config or AgentConfig.load()
    source = source or LocalAPI(config.zotero_api)
    probe = source.probe()
    print(f"Zotero running: {probe.running}")
    print(f"Local API: {probe.local_api}")
    print(f"Detail: {probe.message}")
    if probe.server_id:
        print(f"Zotero-Server-ID: {probe.server_id}")
    runtime = launch_agent_runtime()
    if runtime["running"]:
        print(f"Daemon: running (pid {runtime['pid']})")
    elif runtime["loaded"]:
        print("Daemon: loaded but not running")
    else:
        print("Daemon: not installed")
    server = ServerClient(config.server_url, config.sync_token or "unused")
    print(f"Server: {'reachable' if server.health() else 'unreachable'} ({config.server_url})")
    if not probe.local_api:
        return 2
    try:
        collections = source.collections()
    except ZoteroError as exc:
        print(f"Collections: FAILED {exc}")
        return 2
    names = [item.get("data", {}).get("name") for item in collections]
    print("Collections:", ", ".join(str(name) for name in names) or "(none)")
    print("Configured:", ", ".join(config.collection_names))
    matched = [name for name in config.collection_names if name in names]
    print("Matched:", ", ".join(matched) or "(none)")
    if config.sync_token:
        print("Sync token: present")
    else:
        print("Sync token: MISSING (set WEPAPER_SYNC_TOKEN)")
    return 0 if matched else 1


def run_status(config: AgentConfig | None = None) -> int:
    config = config or AgentConfig.load()
    runtime = launch_agent_runtime()
    if runtime["running"]:
        print(f"Daemon: running (pid {runtime['pid']})")
    elif runtime["loaded"]:
        print("Daemon: loaded but not running")
    else:
        print("Daemon: not installed")
    source = LocalAPI(config.zotero_api)
    try:
        probe = source.probe()
        print(f"Zotero: {'reachable' if probe.local_api else 'unreachable'}")
        if probe.local_api:
            names = [item.get("data", {}).get("name") for item in source.collections()]
            matched = [name for name in config.collection_names if name in names]
            print("Collection:", ", ".join(matched) or "(none matched)")
    finally:
        source.close()
    server = ServerClient(config.server_url, config.sync_token or "unused")
    print(f"Server: {'reachable' if server.health() else 'unreachable'}")
    state = _read_state(config)
    print(f"Last detected change: {state.get('last_detected_change') or 'none'}")
    print(f"Last successful sync: {state.get('last_successful_sync') or 'none'}")
    print(f"Last error: {state.get('last_error') or 'none'}")
    print(f"Pending sync: {'yes' if state.get('pending_sync') else 'no'}")
    return 0 if runtime["running"] or state.get("committed") else 1


def run_sync(
    *,
    once: bool = True,
    source: ZoteroSource | None = None,
    remote: ServerClient | None = None,
    config: AgentConfig | None = None,
    defer_unstable: bool = False,
) -> int:
    config = config or AgentConfig.load()
    close_source = False
    if source is None:
        source = LocalAPI(config.zotero_api)
        close_source = True
    if remote is None:
        if not config.sync_token:
            log.error("FAILED reason=missing_sync_token")
            return 2
        remote = ServerClient(config.server_url, config.sync_token)
    try:
        code, _version = _sync_once(source, remote, config, defer_unstable=defer_unstable)
        return code
    finally:
        if close_source and isinstance(source, LocalAPI):
            source.close()


def run_agent_cycle(
    loop: ChangeLoop,
    *,
    source: ZoteroSource,
    remote: ServerClient,
    config: AgentConfig,
    now: float,
) -> TickResult:
    version = None
    probe = source.probe()
    if probe.local_api:
        getter = getattr(source, "source_version", None)
        if callable(getter):
            try:
                version = getter()
            except Exception:  # noqa: BLE001
                version = None
    result = loop.tick(now, version)
    if result.action == TickAction.DEBOUNCING and result.reason == "version":
        _log("CHANGE_DETECTED", version=version)
        _log("DEBOUNCING", seconds=config.debounce_seconds)
        _merge_state(config, last_detected_change=_now_iso(), pending_sync=True)
    if result.action not in {TickAction.SYNC, TickAction.PERIODIC, TickAction.WAKE}:
        return result
    if not loop.note_sync_start(now):
        return result
    _log("SYNC_STARTED", reason=result.reason or result.action)
    try:
        code, synced = _sync_once(
            source,
            remote,
            config,
            defer_unstable=True,
            observed_sizes=loop.state.pdf_sizes,
        )
        if code == 3:
            loop.note_sync_end(now, ok=False, deferred=True)
            loop.state.coalesce = False
            _merge_state(config, pending_sync=True, last_error=None)
        else:
            loop.note_sync_end(now, ok=code == 0, version=synced if code == 0 else None)
            if code == 0:
                _log("SYNC_COMPLETE", version=synced)
                _merge_state(config, last_successful_sync=_now_iso(), last_error=None, pending_sync=False)
            else:
                _log("ERROR", code=code)
                _log("RETRYING")
                _merge_state(config, last_error=f"sync_exit_{code}", pending_sync=True)
    except Exception as exc:  # noqa: BLE001
        loop.note_sync_end(now, ok=False)
        _log("ERROR", error=exc)
        _log("RETRYING")
        _merge_state(config, last_error=str(exc), pending_sync=True)
    return result


def run_daemon(config: AgentConfig | None = None) -> int:
    config = config or AgentConfig.load()
    config.state_dir.mkdir(parents=True, exist_ok=True)
    lock_path = config.state_dir / "wepaper.lock"
    lock = lock_path.open("w")
    try:
        import fcntl

        fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        log.error("FAILED reason=another_agent_running")
        return 0
    loop = ChangeLoop(
        LoopConfig(
            detect_seconds=config.detect_seconds,
            debounce_seconds=config.debounce_seconds,
            reconcile_seconds=config.reconcile_seconds,
            retry_seconds=config.retry_seconds,
            wake_gap_seconds=max(config.detect_seconds * 4, 15.0),
            pdf_quiet_seconds=config.pdf_quiet_seconds,
        )
    )
    source: ZoteroSource | None = None
    remote: ServerClient | None = None
    try:
        source = LocalAPI(config.zotero_api)
        if not config.sync_token:
            log.error("FAILED reason=missing_sync_token")
            return 2
        remote = ServerClient(config.server_url, config.sync_token)
        while True:
            try:
                now = time.time()
                result = run_agent_cycle(loop, source=source, remote=remote, config=config, now=now)
                loop.state.coalesce = False
                time.sleep(daemon_pause_seconds(config, result))
            except KeyboardInterrupt:
                return 0
            except Exception as exc:  # noqa: BLE001
                log.error("ERROR %s", exc)
                log.info("RETRYING in %ss", config.retry_seconds)
                time.sleep(config.retry_seconds)
    finally:
        if isinstance(source, LocalAPI):
            source.close()


def daemon_pause_seconds(config: AgentConfig, result: TickResult) -> float:
    if result.action == TickAction.OFFLINE:
        return config.retry_seconds
    return config.detect_seconds


def _sync_once(
    source: ZoteroSource,
    remote: ServerClient,
    config: AgentConfig,
    *,
    defer_unstable: bool = False,
    observed_sizes: dict[str, int] | None = None,
) -> tuple[int, int | None]:
    probe: Probe = source.probe()
    if not probe.local_api:
        log.error("FAILED reason=zotero %s", probe.message)
        return 2, None
    try:
        discovered, library_version, server_id = source.discover(config.collection_names)
    except ZoteroError as exc:
        log.error("FAILED reason=%s %s", exc.code, exc)
        return 2, None
    paths = [path for paper in discovered for path in paper.files.values()]
    if defer_unstable and should_defer_for_pdfs(
        paths,
        now=time.time(),
        quiet_seconds=config.pdf_quiet_seconds,
        observed_sizes=observed_sizes,
    ):
        _log("DEBOUNCING", reason="pdf_unstable")
        return 3, None
    for paper in discovered:
        _log("DISCOVERED", item=paper.state.item_key, title=paper.record.title, pdfs=len(paper.state.attachments))
    if not remote.health():
        log.error("FAILED reason=server_unhealthy url=%s", config.server_url)
        return 2, None
    try:
        remote_state = remote.remote_papers()
    except Exception as exc:  # noqa: BLE001
        log.error("ERROR %s", exc)
        return 2, None
    actions = plan_sync(discovered=[paper.state for paper in discovered], remote=remote_state)
    by_item = {paper.state.item_key: paper for paper in discovered}
    failed = 0
    for action in actions:
        try:
            if action.kind == Action.NEW:
                paper = by_item[action.item_key]
                remote.upsert_paper(_payload(paper.record))
                _log("NEW", item=action.item_key, title=paper.record.title)
            elif action.kind == Action.UPDATED:
                paper = by_item[action.item_key]
                remote.upsert_paper(_payload(paper.record))
                _log("UPDATED", item=action.item_key, title=paper.record.title)
            elif action.kind == Action.UNCHANGED and action.attachment_key is None:
                _log("UNCHANGED", item=action.item_key)
            elif action.kind == Action.UPLOAD:
                paper = by_item[action.item_key]
                if action.kind == Action.NEW or action.item_key:
                    remote.upsert_paper(_payload(paper.record))
                path = paper.files[action.attachment_key or ""]
                remote.upload_pdf(action.item_key, action.attachment_key or "", path, action.sha256 or "")
                _log("UPLOADED", item=action.item_key, attachment=action.attachment_key, sha256=action.sha256)
            elif action.kind == Action.REMOVED:
                remote.hide(action.item_key)
                _log("REMOVED", item=action.item_key)
        except Exception as exc:  # noqa: BLE001
            failed += 1
            _log("FAILED", item=action.item_key, attachment=action.attachment_key, error=exc)
            _log("RETRYING", item=action.item_key)
    if failed:
        _save_state(config, committed=False, library_version=library_version, server_id=server_id, failed=failed)
        return 1, None
    try:
        remote.put_state(library_version, server_id)
    except Exception as exc:  # noqa: BLE001
        log.error("ERROR %s", exc)
        _save_state(config, committed=False, library_version=library_version, server_id=server_id, failed=1)
        return 1, None
    _save_state(config, committed=True, library_version=library_version, server_id=server_id, failed=0)
    return 0, library_version


def _payload(record) -> dict:
    return {
        "zotero_item_key": record.zotero_item_key,
        "title": record.title[:2000],
        "authors": record.authors,
        "year": record.year,
        "venue": record.venue,
        "doi": record.doi,
        "abstract": record.abstract,
        "tags": record.tags,
        "collection": record.collection,
        "date_added": record.date_added,
        "date_modified": record.date_modified,
        "visibility": record.visibility,
        "zotero_version": record.zotero_version,
    }


def _read_state(config: AgentConfig) -> dict:
    path = config.state_dir / "state.json"
    if not path.is_file():
        return {}
    try:
        return json.loads(path.read_text())
    except json.JSONDecodeError:
        return {}


def _save_state(
    config: AgentConfig,
    *,
    committed: bool,
    library_version: int,
    server_id: str | None,
    failed: int,
) -> None:
    config.state_dir.mkdir(parents=True, exist_ok=True)
    current = _read_state(config)
    current.update(
        {
            "committed": committed,
            "library_version": library_version if committed else current.get("library_version"),
            "pending_library_version": library_version,
            "zotero_server_id": server_id,
            "failed": failed,
        }
    )
    (config.state_dir / "state.json").write_text(json.dumps(current, indent=2) + "\n")


def _merge_state(config: AgentConfig, **fields: object) -> None:
    config.state_dir.mkdir(parents=True, exist_ok=True)
    current = _read_state(config)
    current.update(fields)
    (config.state_dir / "state.json").write_text(json.dumps(current, indent=2) + "\n")
