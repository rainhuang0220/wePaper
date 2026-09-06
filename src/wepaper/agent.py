from __future__ import annotations

import json
import logging
import time
from pathlib import Path

from wepaper.config import AgentConfig
from wepaper.remote import ServerClient
from wepaper.sync_plan import Action, plan_sync
from wepaper.zotero import LocalAPI, Probe, ZoteroError, ZoteroSource

log = logging.getLogger("wepaper.sync")


def _log(action: str, **fields: object) -> None:
    extra = " ".join(f"{key}={value}" for key, value in fields.items() if value is not None)
    log.info("%s %s", action, extra)


def run_doctor(source: ZoteroSource | None = None, config: AgentConfig | None = None) -> int:
    config = config or AgentConfig.load()
    source = source or LocalAPI(config.zotero_api)
    probe = source.probe() if isinstance(source, LocalAPI) else source.probe()
    print(f"Zotero running: {probe.running}")
    print(f"Local API: {probe.local_api}")
    print(f"Detail: {probe.message}")
    if probe.server_id:
        print(f"Zotero-Server-ID: {probe.server_id}")
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
    print("Server:", config.server_url)
    return 0 if matched else 1


def run_status(config: AgentConfig | None = None) -> int:
    config = config or AgentConfig.load()
    path = config.state_dir / "state.json"
    if not path.is_file():
        print("No local sync state yet.")
        return 1
    print(path.read_text())
    return 0


def run_sync(
    *,
    once: bool = True,
    source: ZoteroSource | None = None,
    remote: ServerClient | None = None,
    config: AgentConfig | None = None,
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
        return _sync_once(source, remote, config)
    finally:
        if close_source and isinstance(source, LocalAPI):
            source.close()


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
        return 2
    while True:
        try:
            code = run_sync(once=True, config=config)
            if code == 0:
                time.sleep(config.poll_seconds)
            else:
                log.info("RETRYING in %ss", min(config.poll_seconds * 2, 300))
                time.sleep(min(config.poll_seconds * 2, 300))
        except KeyboardInterrupt:
            return 0


def _sync_once(source: ZoteroSource, remote: ServerClient, config: AgentConfig) -> int:
    probe: Probe = source.probe()
    if not probe.local_api:
        log.error("FAILED reason=zotero %s", probe.message)
        return 2
    try:
        discovered, library_version, server_id = source.discover(config.collection_names)
    except ZoteroError as exc:
        log.error("FAILED reason=%s %s", exc.code, exc)
        return 2
    for paper in discovered:
        _log("DISCOVERED", item=paper.state.item_key, title=paper.record.title, pdfs=len(paper.state.attachments))
    if not remote.health():
        log.error("FAILED reason=server_unhealthy url=%s", config.server_url)
        return 2
    remote_state = remote.remote_papers()
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
        return 1
    remote.put_state(library_version, server_id)
    _save_state(config, committed=True, library_version=library_version, server_id=server_id, failed=0)
    return 0


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


def _save_state(
    config: AgentConfig,
    *,
    committed: bool,
    library_version: int,
    server_id: str | None,
    failed: int,
) -> None:
    config.state_dir.mkdir(parents=True, exist_ok=True)
    payload = {
        "committed": committed,
        "library_version": library_version if committed else None,
        "pending_library_version": library_version,
        "zotero_server_id": server_id,
        "failed": failed,
    }
    (config.state_dir / "state.json").write_text(json.dumps(payload, indent=2) + "\n")
