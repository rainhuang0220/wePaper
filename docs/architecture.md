# wePaper architecture

Personal Zotero collection → local sync agent → public HTTPS paper library.

## Decision

**Local API read-only daemon + full collection reconcile + authenticated HTTPS ingest.**

```
Zotero (Local API, usually :23119)
        │  Local API v3 (GET only)
        ▼
wePaper Sync Agent (`wepaper sync` / `wepaper daemon`)
        │  HTTPS + bearer token
        ▼
wePaper Server (FastAPI)
        ├── SQLite metadata
        ├── PDF blobs on disk (content-addressed)
        └── Public web UI + browser-native PDF
```

This matches Zotero’s intended integration surface ([Local API](https://www.zotero.org/support/dev/web_api/v3/local_api)). The public server never sees the Mac filesystem. The agent never writes `zotero.sqlite` and never mutates the Zotero library.

Rejected as primary: filesystem watch, live sqlite, WebDAV, a Zotero plugin, Web API-only.

## Why not the alternatives

| Approach | Why not V1 primary |
|----------|--------------------|
| Watch `storage/` | Misses metadata, collection membership, linked files, deletes |
| Read live `zotero.sqlite` | Officially discouraged while Zotero is open; schema drift |
| Web API only | Misses unsynced edits and linked files |
| WebDAV | Opaque Zotero packaging; no metadata |
| Plugin | Install friction and upgrade coupling |

v1.6 uses Zotero Local API only. A zotero.org Web API key path is not implemented.

## Sync

1. Resolve configured collection names (default `wePaper`) to keys; walk subcollections.
2. Every run discovers the **current** collection tree (not `since=` intersect). That is what makes collection-removal detectable.
3. Diff against the server’s paper list. Apply NEW / UPDATED / UPLOAD / REMOVED (hide).
4. PDF bytes: Local API file URL → read-only copy → SHA-256 → idempotent `PUT` of the attachment.
5. Collection removal → **hide** (list and PDF 404). Permanent Zotero deletion → tombstone.
6. Identity: `(zotero_item_key, zotero_attachment_key)` plus content hash for change/dedupe.
7. `library_version` is committed only when the batch has zero failures.
8. Daemon polls every ~60s with an exclusive lock; backoff when Zotero is down.

`wepaper doctor` explains how to enable Local API if Zotero returns 403.

## Server

- Public GET: paper list, paper detail, PDF stream (Range), comments, health, SPA.
- `/paper/:id` 302s to `/paper/:id/pdf` for every client (`Cache-Control: private, no-store`, `Vary: Sec-CH-UA-Mobile, User-Agent`). Desktop and Android use the browser PDF/download path. The broken v1.5 inline viewer is not the default.
- `/paper/:id/pdf` is always raw `application/pdf` on every device.
- `/paper/:id/discussion` is the paper discussion surface.
- `/paper/:id/viewer` remains a local diagnostic HTML viewer only.
- Private write: ingest / hide / tombstone / sync state (Bearer token). Tokens are never shipped to the frontend.
- Open public writes (intentionally unauthenticated, validated): reading status and paper comments/replies/likes.
- SQLite + on-disk blobs keyed by `sha256`. The storage interface can later move to object storage without changing paper identity.
- Visibility: `public` | `unlisted` | `private`. V1 lists and streams `public` only. Collection membership publishes as `public` unless a `#wepaper:private` tag is present.

## Public URL

Canonical origin: `https://wepaper.plainlist.space` (subdomain TLS, nginx `/` → `127.0.0.1:8788`, UI built with `WEPAPER_BASE=/`).

`https://plainlist.space/wepaper/` 301-redirects to the subdomain. The earlier path-on-`plainlist.space` setup is historical; see [research/v11-origin.md](research/v11-origin.md).

## Stack

| Piece | Choice | Reason |
|-------|--------|--------|
| Server + agent | Python 3.12, FastAPI, one package | Tests, one language, small deploy |
| DB | SQLite + `wepaper.db.migrate()` | Single-user, persistent, no extra migrator |
| Web | Vite + React catalog + discussion; native `/pdf` reading | Title click/tap is a full navigation to `/paper/:id` → 302 raw PDF. Discussion is a separate route. |
| Process | uvicorn on loopback + nginx + TLS | Matches a typical VPS |
| Public origin | `wepaper.plainlist.space` | Current demo |

## Modules

- `wepaper.normalize` — Zotero JSON → paper records
- `wepaper.checksum` / `wepaper.sanitize` — hash + safe names
- `wepaper.zotero` — Local API client (fakeable)
- `wepaper.sync_plan` — discover/diff actions
- `wepaper.agent` / `wepaper.remote` — apply + HTTPS client
- `wepaper.db` — schema + connection
- `wepaper.server` — public vs private HTTP
- `wepaper.device` — historical mobile-vs-desktop classifier (unused on the default `/paper/:id` path)
- `wepaper.reading_status` — mutually exclusive library labels
- `wepaper.comments` — body/name bounds and comment payloads

Reading status is a wePaper-owned annotation on `papers.reading_status`. Comments live in `paper_comments` keyed by `paper_id` (`zotero_item_key`). Zotero upsert updates metadata and PDF bytes only; it never writes status or comments. A hidden paper that later reappears with the same `zotero_item_key` keeps status and discussion.

The diagnostic viewer still pins `pdfjs-dist@5.7.284` with `enableScripting` off. Default reading does not load PDF.js. CSP is `script-src 'self'`.

## Security split

`PUBLIC READ ≠ SYNC WRITE`. Anonymous visitors can list public papers, read PDFs, change reading status, and post comments. Every mutating `/api/v1/sync/*` route requires `Authorization: Bearer`. Comment/status writes are validated (length, enums, parameterized SQL, React text rendering). Blobs are never mounted as static files. Hidden / private / tombstoned papers 404 on HTML, PDF, and comments.
