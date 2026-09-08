# Automatic sync reliability review

Date: 2026-09-08. Scope: v1.7.0 daemon + live catalog.

Independent Subagent C review, then fixes before ship.

## Verdict

HIGH/MEDIUM findings from the adversarial review were fixed. LOW items remain as known limitations.

## Attacks

| Scenario | Result | Notes |
| --- | --- | --- |
| Watcher missed event | PASS | Frozen version probe stays idle until periodic reconcile |
| Event storm | PASS | Debounce coalesces a burst to one sync |
| Partial PDF write | PASS | Size tracker requires two quiet same-size observations; defer does not skip the detect sleep |
| Laptop sleep | PASS | Tick gap ≥ 15s → `WAKE` |
| Daemon crash | PASS | Broad `except`; lock; `KeepAlive` / `SuccessfulExit=false`; isolated venv |
| Stale cursor | PASS | Failed batch does not commit `library_version`; success passes version into `note_sync_end` |
| Duplicated upload | PASS | Checksum plan; content-addressed blobs |
| Zotero closed | PASS | `OFFLINE` + `retry_seconds` |
| Server unreachable | PASS | `health()` never raises; failed sync waits `retry_seconds` (no 2s hammer, no 300s blind wait) |
| Browser stale tab | PASS | Visibility/focus check; hidden tabs do not poll |
| Polling thundering | PASS | Version unchanged → no `/papers` refetch |
| Catalog update while filtering | PASS | Monotonic `catalogGen` drops stale responses |

## HIGH / MEDIUM fixed

1. **HIGH** Uncaught `httpx.ConnectError` killed `run_daemon` → LaunchAgent exit 1 × 5000+. `health()` returns False; daemon catches Exception.
2. **HIGH** launchd could not read `~/Desktop/wePaper/.venv/pyvenv.cfg` (TCC). Isolated venv at `~/.config/wepaper/venv`.
3. **HIGH** Coalesce `continue` skipped sleep (CPU/API storm). Every loop iteration now sleeps `daemon_pause_seconds`.
4. **HIGH** PDF stability was mtime-only; `previous_size` unused. Daemon tracks per-path sizes and defers until two quiet equal observations.
5. **HIGH** Catalog fetch used `limit=100` with no pagination. Client now walks pages (`limit=200`) until `total`.
6. **HIGH** In-flight catalog fetch could overwrite a newer search. Shared `catalogGen` plus filter snapshot.
7. **MEDIUM** Failed periodic reconcile retried every 2s. `last_attempt_at` + `retry_seconds` backoff.
8. **MEDIUM** Idle server-down gap was 300s. Last-failure retry uses `retry_seconds`.
9. **MEDIUM** `KeepAlive` + lock exit 2 crash-looped a second instance. Lock returns 0; `SuccessfulExit=false`.
10. **MEDIUM** `wepaper status` ignored `agent.env`. `AgentConfig.load()` reads it without overriding the shell.

## Remaining limitations (LOW / NOTE)

- Background tabs may still throttle timers; focus/visibility recovers.
- Library-wide `Last-Modified-Version` can wake a no-op reconcile for unrelated Zotero edits.
- Isolated venv must be reinstalled after agent-code updates (`wepaper daemon install`).
- Configured name `wePaper` is not present in the current Zotero library; `Agent Memory` is.
- Zotero Local API writes need an authorize dialog; live metadata E2E on the operator library was not forced.
