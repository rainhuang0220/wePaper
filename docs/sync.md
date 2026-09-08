# Sync

```
Zotero (running) → Local API → wepaper daemon → HTTPS → wePaper server → open catalog tab
```

Normal workflow: add or move a paper into the configured collection and do nothing else. The daemon notices the library version change, reconciles the collection, and the public page updates itself.

`wepaper sync --once` is a diagnostic / repair command. It is not the everyday path.

## Commands

```bash
wepaper doctor            # Zotero, Local API, collections, daemon, server
wepaper status            # running? last change / last sync / last error
wepaper daemon            # foreground hybrid loop
wepaper daemon install    # macOS LaunchAgent (login + KeepAlive)
wepaper daemon uninstall
wepaper daemon status     # same snapshot as status
wepaper sync --once       # one full collection-tree reconcile
```

`wepaper install-agent` remains an alias for `daemon install`.

## Configure

```bash
export WEPAPER_COLLECTION="wePaper,Agent Memory"
export WEPAPER_SERVER_URL="https://wepaper.plainlist.space"
export WEPAPER_SYNC_TOKEN="…"   # never commit; never put in VITE_* or the plist
```

Every listed collection name is published, including its subcollections. Names are comma-separated.

Optional timing (defaults shown):

| Variable | Default | Role |
| --- | --- | --- |
| `WEPAPER_DETECT_SECONDS` | `2` | Cheap Local API version poll |
| `WEPAPER_DEBOUNCE_SECONDS` | `2` | Quiet period after a version change |
| `WEPAPER_RECONCILE_SECONDS` | `300` | Periodic full reconcile |
| `WEPAPER_RETRY_SECONDS` | `5` | Backoff when Zotero or the server is down |
| `WEPAPER_PDF_QUIET_SECONDS` | `2` | Do not upload a PDF whose mtime is newer than this; the daemon also waits until size is unchanged across two polls |

Expected latency while the Mac is awake and online: typically a few seconds (P50 ≤ 5 s, P95 ≤ 15 s) from a finished Zotero write to production catalog data. After sleep or a network drop, the daemon reconciles on the next wake/retry.

## Enable Local API

Zotero → Settings → Advanced → **Allow other applications on this computer to communicate with Zotero**.

The agent sends `User-Agent: wePaper-Sync/0.1` and `Zotero-Allowed-Request: 1`. It never writes the Zotero library.

## How the daemon decides to sync

**Fast path.** Every 2 s the agent reads `Last-Modified-Version` from `GET /users/0/items?limit=1`. A change logs `CHANGE_DETECTED`, waits 2 s of stability (`DEBOUNCING`), then reconciles the configured collection tree.

**Correctness path.** Every 5 minutes, on daemon startup, and after a long gap (laptop sleep), it reconciles even if the version probe looked quiet. That catches missed events.

**Single-flight.** At most one sync runs. Changes that arrive mid-sync are picked up on the next detect tick after a mandatory sleep (no busy-loop). Unstable PDFs defer the upload instead of publishing a half-written file. A failed sync retries every `retry_seconds`, not every detect tick.

Idle cost is one localhost GET. PDFs are hashed only when a reconcile runs, and unchanged files reuse a process-local mtime/size cache.

## LaunchAgent

`wepaper daemon install` writes:

- `~/.config/wepaper/agent.env` (mode `0600`, token lives here)
- `~/.config/wepaper/venv` (a copy of wepaper, so launchd does not need Desktop TCC)
- `~/.config/wepaper/run-daemon.sh` (sources the env file; no token in the plist)
- `~/Library/LaunchAgents/space.plainlist.wepaper.plist` (`RunAtLoad`, `KeepAlive` only after a crash)
- `~/.config/wepaper/logs/daemon.{out,err}.log`

Re-run `daemon install` after pulling agent code so the isolated venv is refreshed.

It starts at login and restarts if the process exits. The plist uses `/bin/sh` and the wrapper script so a login-shell `.zshrc` cannot kill the job.

```bash
wepaper status
tail -f ~/.config/wepaper/logs/daemon.err.log
```

If `status` says the daemon is loaded but not running, check the err log. Transient server or Zotero errors should log `ERROR` / `RETRYING` and stay alive.

## What each event does

| Zotero change | wePaper |
| --- | --- |
| New item in the collection | upsert metadata + upload PDFs |
| Item moved into the collection | same as new |
| Metadata edit | metadata only |
| PDF replace (hash change) | upload new blob |
| Leave the collection | **hide** (list and PDF 404) |
| Permanent delete | tombstone |
| Same bytes, two items | one blob on disk |

A failed batch does **not** commit `library_version`. Restart resumes a full reconcile of the collection tree.

Reading status and comments are wePaper-owned. Metadata updates, PDF replacements, hide, and later reappearance of the same `zotero_item_key` preserve `reading_status` and the discussion thread.

## Live catalog

`GET /api/v1/library/version` is public and cheap. The open library page polls it every 4 seconds and on tab visibility/focus. When the version changes it refetches the current search/filter in place — no full reload, no lost query.

Background tabs may be throttled by the browser. Bringing the tab forward runs an immediate version check.

## Visibility

Collection membership makes a paper eligible. Tags:

- `#wepaper:private` → never listed, PDF 404
- `#wepaper:unlisted` → not listed; reserved for later secret links
- default in V1 → `public` (the operator is the publisher of record)

`robots.txt` disallows crawlers. There is no zip-the-library API.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| New paper never appears | `wepaper status`; Zotero running; paper is in a **matched** collection; daemon logs |
| Daemon not running | `wepaper daemon install`; `launchctl list space.plainlist.wepaper` |
| Server unreachable | `WEPAPER_SERVER_URL`; token in `agent.env` not in the plist |
| Must press F5 | You are on a build older than v1.7, or the tab has been backgrounded a long time — focus it |
| Need a one-shot repair | `wepaper sync --once` then leave the daemon running |
