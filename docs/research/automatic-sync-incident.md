# Automatic Sync Incident

Investigation date: 2026-09-08 (UTC+8). Production: https://wepaper.plainlist.space. Stable release: v1.6.0.

**Incident paper (Zotero):** `G4EVWKWF` — *Human-like remembering and forgetting in LLM agents: an ACT-R-inspired memory architecture*, added to the **Agent Memory** collection at `2026-09-08T04:36:23Z`.

**Investigator note:** A brief manual `wepaper daemon` start during diagnosis (12:45 local) synced this paper to production at `2026-09-08T04:45:55+00:00`. All pre-incident conclusions below use evidence captured **before** that run.

---

## CURRENT_MECHANISM

Automatic sync is implemented as a macOS LaunchAgent that runs `wepaper daemon` in an infinite poll loop.

| Layer | Implementation | Source |
| --- | --- | --- |
| CLI entry | `wepaper daemon` → `run_daemon()` | `src/wepaper/cli.py:58-63` |
| Poll loop | `while True`: call `run_sync(once=True)`, sleep `poll_seconds` on success or `min(poll_seconds*2, 300)` on failure | `src/wepaper/agent.py:84-105` |
| Poll interval | Default **60 s** via `WEPAPER_POLL_SECONDS` | `src/wepaper/config.py:29`, `agent.env` |
| Sync model | **Full collection-tree reconcile** each cycle (not incremental `?since=` cursor polling) | `src/wepaper/zotero.py:89-158`, `docs/sync.md` |
| Concurrency | Exclusive `fcntl.flock` on `~/.config/wepaper/wepaper.lock`; second agent exits code **2** | `src/wepaper/agent.py:87-95` |
| Zotero source | Read-only Local API at `http://127.0.0.1:23119/api` | `src/wepaper/config.py:31` |
| Remote target | Authenticated HTTPS to `WEPAPER_SERVER_URL` | `src/wepaper/remote.py` |
| LaunchAgent | Label `space.plainlist.wepaper`, `RunAtLoad=true`, `KeepAlive=true`, no log paths | `src/wepaper/launchd.py`, `~/Library/LaunchAgents/space.plainlist.wepaper.plist` |
| Config | `~/.config/wepaper/agent.env` sourced by plist wrapper | `launchd.py:55` |
| Local state | `~/.config/wepaper/state.json` stores last committed `library_version` | `src/wepaper/agent.py:179-195` |

**Configured agent.env (secrets redacted):**

```
WEPAPER_COLLECTION='wePaper,Agent Memory'
WEPAPER_SERVER_URL='https://wepaper.plainlist.space'
WEPAPER_SYNC_TOKEN=<REDACTED>   # present, non-empty
WEPAPER_POLL_SECONDS=60
```

**LaunchAgent plist (installed 2026-09-07 01:45):**

```xml
ProgramArguments: /bin/zsh -lc "set -a && source ~/.config/wepaper/agent.env && exec ~/Desktop/wePaper/.venv/bin/wepaper daemon"
RunAtLoad: true
KeepAlive: true
LimitLoadToSessionType: Aqua   # from launchctl list output
```

No `StandardOutPath`, `StandardErrorPath`, or `EnvironmentVariables` keys — daemon stdout/stderr are discarded by launchd.

---

## WHY_IT_DID_NOT_SYNC

The newly added paper did not appear because **the local sync daemon was not running**, so no poll cycle executed after the paper was added.

| Checkpoint | Expected if healthy | Observed at incident time |
| --- | --- | --- |
| LaunchAgent loaded | PID present, `active count ≥ 1` | `active count = 0`, PID `-`, `state = spawn scheduled` |
| `wepaper daemon` process | Long-lived Python process | `pgrep -fl 'wepaper daemon'` → **no matches** |
| Last automatic sync | Within ~60 s of Zotero change | Production `last_success_at = 2026-09-07T16:04:12+00:00` (**12.5 h before** paper added) |
| Zotero library version | Matches or trails production cursor | Zotero LMV **1706** vs production cursor **1701** (Δ5) |
| Incident paper on production | `G4EVWKWF` listed | **Absent** from `/api/v1/papers` (newest public item was `PSELS7ZT`) and from `/api/v1/sync/papers` (9 items vs 10 in Zotero) |

**Timeline:**

```
2026-09-07T16:04:12Z  Last successful automatic sync (production + local state.json)
        │             LaunchAgent last held lock ~2026-09-07 22:24 local (wepaper.lock mtime)
        │             Daemon not running for remainder of session (5282+ launchd spawn attempts, exit 1)
2026-09-08T04:36:23Z  G4EVWKWF added to Agent Memory in Zotero (LMV → 1706)
        │             No daemon process → no sync triggered
2026-09-08T04:45:55Z  Paper appeared only after manual daemon start during investigation (contamination)
```

**Layer-by-layer status at incident time:**

| Layer | Status | Evidence |
| --- | --- | --- |
| Zotero running + Local API | ✅ OK | `curl http://127.0.0.1:23119/connector/ping` → 200; `wepaper doctor` → Local API ready |
| Zotero collection config | ✅ Partial match | Collections: `Agent Memory`, `MIS`. Configured `wePaper, Agent Memory`. `wePaper` **not found**; `Agent Memory` matched. Paper was in matched collection. |
| Server URL | ✅ Correct | `WEPAPER_SERVER_URL='https://wepaper.plainlist.space'`; `curl …/api/v1/health` → `{"status":"ok"}` |
| Sync token | ✅ Present | `wepaper doctor` → "Sync token: present"; authenticated `/api/v1/sync/papers` → 200 |
| Local agent daemon | ❌ **NOT RUNNING** | `launchctl print gui/501/space.plainlist.wepaper` → `active count = 0`, `last exit code = 1`, `runs = 5282` |
| Production API/DB | ✅ Reachable | Health OK; 9 synced papers served correctly for all *prior* items |

**Missing item proof (pre-contamination):**

Zotero **Agent Memory** (10 items, newest first):

```
G4EVWKWF | 2026-09-08T04:36:23Z | Human-like remembering and forgetting…   ← INCIDENT PAPER
PSELS7ZT | 2026-09-06T11:52:09Z | Remember, verify, or ask?…
… (8 older items)
```

Production public catalog (`GET /api/v1/papers?limit=5`) newest entry before manual daemon:

```
PSELS7ZT | 2026-09-06T11:52:09Z   ← G4EVWKWF NOT PRESENT
```

Production sync store (`GET /api/v1/sync/papers` with bearer token): **9 papers**, `library_version: 1701` — one short of Zotero's 10.

Incident paper had a valid PDF attachment (`XTKY79TQ`, `application/pdf`, file on disk via Local API) — absence was not due to missing PDF.

---

## ROOT_CAUSE

**Failing layer: local LaunchAgent sync daemon (`space.plainlist.wepaper`).**

The daemon was registered in launchd but **not staying alive**. At investigation time:

```text
$ launchctl list | rg plainlist
-    1    space.plainlist.wepaper          # PID "-" = not running; second column = last exit code 1

$ launchctl print gui/501/space.plainlist.wepaper
    active count = 0
    state = spawn scheduled
    runs = 5282
    last exit code = 1
    minimum runtime = 10
    properties = keepalive | runatload | inferred program

$ pgrep -fl 'wepaper daemon'
(no output)
```

With `KeepAlive=true`, launchd repeatedly attempted restart (~5282 runs) but each instance exited with code **1** before the next 60 s poll could pick up `G4EVWKWF`.

**Why exit 1 matters:** `run_daemon()` is an infinite loop and should not exit on sync failure (it sleeps and retries). Exit code **1** indicates the process **terminated entirely**.

**Proven exception:** `ServerClient.health()` called `httpx.Client.get()` with no try/except. A refused connection raises `httpx.ConnectError`. `run_daemon()` only caught `KeyboardInterrupt`. The same pattern applies to `remote_papers()` / `put_state()` (`raise_for_status()`). Reproduced under a launchd-like environment (`PATH=/usr/bin:/bin:/usr/sbin:/sbin`) by pointing the server at `127.0.0.1:1`: process exits **1** with a Rich traceback. The plist captured **no logs**, so historical 5282 exits did not leave a stderr file.

**Ruled out as primary cause:**

| Hypothesis | Ruling evidence |
| --- | --- |
| Wrong server URL | Config matches production; health + authenticated sync endpoints OK |
| Missing sync token | Token present in `agent.env`; authenticated calls returned 200 |
| Zotero Local API down | Ping 200; doctor OK at investigation time |
| Wrong collection (paper not in scope) | Paper in `Agent Memory`, which is configured and matched |
| Stale cursor preventing discovery | Reconcile scans full collection tree each cycle; cursor only gates commit (`agent.py:153-157`) |
| Lock held by second agent | `lsof wepaper.lock` → not held; would exit **2** not **1** |
| Production server failure | Server healthy; prior 9 papers served; manual daemon synced immediately |

**Contributing factors:**

1. **No log redirection in plist** — 5282 failures left no stderr trail.
2. **Plist hard-codes repo venv path** (`~/Desktop/wePaper/.venv/bin/wepaper`) — couples production sync to a dev checkout on Desktop; fragile across moves/rebuilds (though binary was present and executable at investigation time).
3. **Daemon crash stops all automatic sync** — unlike sync failure (which retries in-loop), an uncaught exception kills the process; KeepAlive respawns every ≥10 s but never completes a successful poll cycle while crashing.

---

## FIX

### Immediate (restore automatic sync)

1. **Confirm daemon stays up after manual start:**

   ```bash
   launchctl bootout gui/$(id -u)/space.plainlist.wepaper 2>/dev/null
   launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/space.plainlist.wepaper.plist
   sleep 15
   launchctl print gui/$(id -u)/space.plainlist.wepaper | rg 'active count|last exit code|pid'
   pgrep -fl 'wepaper daemon'
   ```

2. **If still exiting:** run foreground once to capture stderr, then fix underlying exception:

   ```bash
   set -a && source ~/.config/wepaper/agent.env && set +a
   /Users/rainhuang/Desktop/wePaper/.venv/bin/wepaper daemon
   ```

### Hardening (prevent recurrence)

1. **Add log paths to plist** (and reinstall via `wepaper install-agent` after updating `launchd.py`):

   ```xml
   <key>StandardOutPath</key><string>/Users/rainhuang/.config/wepaper/daemon.stdout.log</string>
   <key>StandardErrorPath</key><string>/Users/rainhuang/.config/wepaper/daemon.stderr.log</string>
   ```

2. **Wrap `run_sync()` in `run_daemon()` with broad exception handler** so transient HTTP/Zotero errors log and retry instead of killing the process (code fix in `agent.py`).

3. **Install wepaper globally** (`pip install` / dedicated venv outside Desktop repo) and point plist at stable path instead of `~/Desktop/wePaper/.venv/bin/wepaper`.

4. **Remove stale collection name** `wePaper` from `WEPAPER_COLLECTION` if that collection no longer exists (cosmetic; `Agent Memory` alone is sufficient).

5. **Monitoring:** alert if `launchctl list space.plainlist.wepaper` shows PID `-` or if production `last_success_at` is older than 5 minutes.

---

## EXPECTED_LATENCY

When the daemon is **healthy and running**:

| Phase | Latency |
| --- | --- |
| Poll interval | **60 s** (`WEPAPER_POLL_SECONDS=60`) |
| Zotero discovery | ~1–3 s for 10-item collection (Local API round-trips) |
| Metadata upsert | <1 s per new item |
| PDF upload | Depends on file size + network (incident PDF uploaded in ~1.7 s during manual test) |
| Public catalog visibility | Immediate after successful upsert (no separate publish step for default public items) |

**Theoretical end-to-end for a new paper with PDF:** ~**60–90 s** after Zotero save (dominated by poll interval), assuming Zotero is running and Local API is enabled.

On sync failure (return code 1 from `_sync_once`), the daemon sleeps **`min(120, 300) = 120 s`** before retry — not applicable when the process crashes entirely (current bug).

---

## EVIDENCE

### Commands and outputs (2026-09-08 ~12:44–12:46 local)

**LaunchAgent status:**

```text
$ launchctl list | rg 'wepaper|plainlist'
-    1    space.plainlist.wepaper

$ launchctl print gui/501/space.plainlist.wepaper
    active count = 0
    state = spawn scheduled
    runs = 5282
    last exit code = 1
    program = /bin/zsh
    arguments = { /bin/zsh -lc "set -a && source …/agent.env && exec …/wepaper daemon" }

$ pgrep -fl 'wepaper daemon'
(no output — only unrelated `wepaper serve` dev server on port 8788)
```

**Config (redacted):**

```text
$ grep '^WEPAPER_' ~/.config/wepaper/agent.env | sed 's/SYNC_TOKEN=.*/SYNC_TOKEN=<REDACTED>/'
WEPAPER_COLLECTION='wePaper,Agent Memory'
WEPAPER_SERVER_URL='https://wepaper.plainlist.space'
WEPAPER_SYNC_TOKEN=<REDACTED>
WEPAPER_POLL_SECONDS=60
```

**Local state (pre-contamination, mtime 2026-09-08 00:04:11):**

```json
{
  "committed": true,
  "library_version": 1701,
  "pending_library_version": 1701,
  "zotero_server_id": "i2UU2nI5isXo",
  "failed": 0
}
```

**Production sync state (pre-contamination):**

```json
{
  "library_version": 1701,
  "zotero_server_id": "i2UU2nI5isXo",
  "last_sync_at": "2026-09-07T16:04:12+00:00",
  "last_success_at": "2026-09-07T16:04:12+00:00"
}
```

**`wepaper doctor` (with agent.env sourced):**

```text
Zotero running: True
Local API: True
Detail: Local API ready
Zotero-Server-ID: i2UU2nI5isXo
Collections: Agent Memory, MIS
Configured: wePaper, Agent Memory
Matched: Agent Memory
Sync token: present
Server: https://wepaper.plainlist.space
```

**Zotero Local API — incident paper:**

```text
GET /api/users/0/collections/M277TYYA/items/top
  → 10 items, Last-Modified-Version: 1706
  → newest: G4EVWKWF added 2026-09-08T04:36:23Z
  → attachment XTKY79TQ application/pdf, file on disk OK
```

**Production public catalog (pre-contamination, `limit=5`):**

```text
total: 9
newest keys: PSELS7ZT, MUZIM3FK, 7DPYRDQS …
G4EVWKWF: NOT LISTED
```

**Production health:**

```text
$ curl https://wepaper.plainlist.space/api/v1/health
{"status":"ok"}
```

**Manual daemon works (proves downstream path healthy):**

Starting the exact plist command manually produced:

```text
DISCOVERED item=G4EVWKWF … pdfs=1
NEW item=G4EVWKWF …
UPLOADED item=G4EVWKWF attachment=XTKY79TQ sha256=a4c550b3…
PUT /api/v1/sync/state → 200 (library_version 1706)
```

Process remained alive >60 s under simulated launchd environment (`env -i PATH=/usr/bin:/bin:/usr/sbin:/sbin …`).

**LaunchAgent simulated environment:**

```text
$ env -i HOME=$HOME USER=$USER PATH=/usr/bin:/bin:/usr/sbin:/sbin \
    /bin/zsh -lc 'set -a && source ~/.config/wepaper/agent.env && wepaper doctor'
→ all checks pass (same as above)
```

**Lock file:**

```text
$ ls -la ~/.config/wepaper/wepaper.lock
-rw-r--r--  0 bytes  mtime 2026-09-07 22:24:47
$ lsof ~/.config/wepaper/wepaper.lock
(not held by any process at investigation time)
```

### Code references

- Daemon loop: `src/wepaper/agent.py:84-105`
- Lock: `src/wepaper/agent.py:87-95`
- Full reconcile: `src/wepaper/zotero.py:105-158`
- LaunchAgent installer: `src/wepaper/launchd.py:39-66`
- Plist on disk: `/Users/rainhuang/Library/LaunchAgents/space.plainlist.wepaper.plist`
