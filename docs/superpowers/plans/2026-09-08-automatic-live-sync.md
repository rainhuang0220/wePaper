# Automatic Zotero Live Sync Implementation Plan

> **For agentic workers:** Use TDD. Existing daemon is the mechanism; fix it, do not invent a second daemon.

**Goal:** Zotero collection changes reach production and an already-open catalog tab without `sync --once` or F5.

**Architecture:** Keep `wepaper daemon` + LaunchAgent. Hybrid loop: cheap Local API `Last-Modified-Version` poll (2s) + 2s debounce + full collection reconcile; periodic reconcile every 5 minutes; single-flight coalescing. Public `GET /api/v1/library/version` + 4s catalog poll (visibility wakeup).

**Tech Stack:** Python 3.12 agent/server, React catalog, macOS launchd.

## Global Constraints

- Do not write `zotero.sqlite`.
- Do not put the sync token in the plist or frontend.
- Do not pollute production with fake papers.
- `WEPAPER_COLLECTION` remains source of truth (membership, not PDF-file watching).
- Default detect 2s / debounce 2s / reconcile 300s. Target P50 ≤ 5s, P95 ≤ 15s while awake+online.
- Uncaught exceptions must not kill the daemon.

## Root cause already proven

LaunchAgent `space.plainlist.wepaper` is installed but crash-loops (`last exit code = 1`, `runs ≈ 5282`, `state = spawn scheduled`). `ServerClient.health()` and other httpx calls raise `ConnectError`; `run_daemon()` only catches `KeyboardInterrupt`.

Incident paper: `G4EVWKWF` added 2026-09-08T04:36:23Z to Agent Memory; absent until a diagnostic daemon run.

## File map

- Create: `src/wepaper/loop.py` — detect/debounce/single-flight/periodic
- Modify: `src/wepaper/remote.py` — health never raises
- Modify: `src/wepaper/agent.py` — resilient daemon, status/doctor
- Modify: `src/wepaper/zotero.py` — `library_version()`, digest cache, PDF stability
- Modify: `src/wepaper/config.py` — detect/debounce/reconcile
- Modify: `src/wepaper/launchd.py` — logs, wrapper, no zsh -lc, uninstall
- Modify: `src/wepaper/cli.py` — `daemon install|uninstall|status`
- Modify: `src/wepaper/server.py` — `GET /api/v1/library/version`
- Modify: `web/src/api.ts`, `web/src/pages/LibraryPage.tsx`, `web/src/catalogFreshness.ts`
- Test: `tests/test_remote.py`, `tests/test_daemon_loop.py`, `tests/test_change_loop.py`, `tests/test_library_version.py`, `tests/test_launchd.py`, `web/e2e/live-catalog.spec.ts`

## Tasks

1. RED/GREEN: health() + daemon survives exceptions
2. RED/GREEN: ChangeLoop debounce, burst coalesce, single-flight, periodic, wake catch-up
3. RED/GREEN: PDF stability; skip half-written; no false REMOVED
4. RED/GREEN: library/version; unchanged → same body; upsert/hide/pdf replace bump
5. RED/GREEN: LaunchAgent plist has logs, no token, wrapper not zsh -lc
6. Wire daemon + doctor/status
7. Frontend live refresh; Playwright: version unchanged no extra papers fetch; version change updates; search/filter survive; visibility check
8. Docs + SemVer 1.7.0
9. Reliability review; fix HIGH/MEDIUM
10. Real Zotero E2E without `sync --once`; deploy
