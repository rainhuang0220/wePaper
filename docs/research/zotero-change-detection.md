# Zotero Change Detection

Date: 2026-09-08. Scope: wePaper automatic sync after v1.6.0. Zotero 7/10 Local API.

## Recommendation

**Hybrid: cheap Local API version poll + debounce + collection reconcile, with a periodic full reconcile.**

Do not watch `zotero.sqlite` as the primary signal. Do not treat new `.pdf` files as collection membership. The configured collection tree remains authoritative.

This matches Zotero’s own Local API / Web API v3 versioning model (`Last-Modified-Version`, `?since=`) documented in [Web API v3 syncing](https://www.zotero.org/support/dev/web_api/v3/syncing) and the Local API announcement on [zotero-dev](https://groups.google.com/g/zotero-dev/c/ElvHhIFAXrY/m/fA7SKKwsAgAJ). Existing wePaper research already selected this hybrid: [zotero-architecture.md](zotero-architecture.md), [reference-research.md](reference-research.md).

## Compared Mechanisms

| Mechanism | Latency | Correctness | Restart-safe | Risk to Zotero | Verdict |
| --- | --- | --- | --- | --- | --- |
| Local API `Last-Modified-Version` poll (`GET /users/0/items?limit=1`) | ~2 s | Detects metadata, membership, deletes | Yes | Read-only | **FAST PATH** |
| `?since=` incremental item fetch | Low | Official incremental | Yes | Read-only | Useful later; small libraries can full-reconcile |
| Library/version only, no reconcile | Low | Misses missed events / process downtime | Partial | None | Insufficient alone |
| FSEvents on `storage/` | Sub-second | Misses collection membership, tags, titles | Weak | Easy to mis-handle | Signal only, not source of truth |
| Watch `zotero.sqlite` / WAL | Fast | WAL bursts, lock, false wakes; still not membership | Weak | **Must never write**; copy-while-WAL is unsafe | Optional read-only wakeup, not used as primary |
| Watch Zotero data directory in iCloud/Dropbox | — | Corruption | — | **Forbidden** | Do not |
| Periodic full collection reconcile | Minutes | Catches everything | Yes | Read-only | **CORRECTNESS PATH** |
| Zotero stream-server WebSocket | Near-live | Web-library / official clients; not Local API | Needs extra stack | None | Overkill for one Mac |
| Zotero plugin `Zotero.Items` hooks | Instant | High install friction | Plugin lifecycle | In-process | Not for v1 |

## FAST_PATH

Every **2 seconds**, while the daemon is awake:

1. `GET http://127.0.0.1:23119/api/users/0/items?limit=1` with `Zotero-Allowed-Request: 1`.
2. Read `Last-Modified-Version`.
3. If it differs from the last successful sync version: log `CHANGE_DETECTED`, wait **2 seconds** of a stable version (`DEBOUNCING`), then run the existing collection-tree reconcile (`SYNC_STARTED`).

Idle cost is one localhost GET. PDFs are not hashed unless a sync actually runs. Attachment checksums are cached by `(path, mtime, size)` for the process lifetime.

Collection membership is metadata on the item (`data.collections`). A paper moved into the configured collection bumps the library version even if no PDF file event occurred.

## CORRECTNESS_PATH

Every **300 seconds**, and after a long tick gap (sleep/wake, ~15 s):

- Reconcile the configured collection tree against the server, even if the version probe looks unchanged.
- Covers missed events, probe lies, laptop sleep, and daemon restart (startup always reconciles).

On Zotero closed: `OFFLINE`, retry, no crash. On reopen: next probe resumes; if the version changed, debounce then sync.

On production unreachable: `health()` returns false; the daemon logs `ERROR` / `RETRYING` and stays alive.

## Debounce

- Version chatter (import, rename, attachment create) resets the 2 s quiet window.
- A burst of 10 writes produces one sync after the last write stays still.
- Single-flight: at most one `run_sync` per library; a change during a run sets a follow-up reconcile.
- If a PDF `mtime` is newer than `WEPAPER_PDF_QUIET_SECONDS` (default 2), the daemon logs `DEBOUNCING reason=pdf_unstable` and does **not** apply `REMOVED` / upload. Manual `sync --once` does not wait (operator-driven).

## What NOT to do

- Write `zotero.sqlite` or copy it while WAL exists.
- Put the Zotero data directory in cloud file sync.
- Upload a PDF because a file appeared in `storage/` without collection membership.
- Rely on FSEvents alone.
- Let `httpx.ConnectError` kill the process (that is why the v1.6 LaunchAgent crash-looped).

## Sources

- [Zotero Web API v3 syncing](https://www.zotero.org/support/dev/web_api/v3/syncing) — `Last-Modified-Version`, `since`, `/deleted`
- [Zotero Local API (zotero-dev)](https://groups.google.com/g/zotero-dev/c/ElvHhIFAXrY/m/fA7SKKwsAgAJ)
- [Zotero data directory](https://www.zotero.org/support/zotero_data/) — close Zotero before copying; never treat sqlite as an API
- [zotero/stream-server](https://github.com/zotero/stream-server) — official push for web library versions; not required here
- wePaper `src/wepaper/zotero.py`, `src/wepaper/loop.py`, [zotero-architecture.md](zotero-architecture.md)
