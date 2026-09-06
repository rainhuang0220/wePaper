# wePaper architecture

Personal Zotero collection → local sync agent → public HTTPS paper library.

## Decision

**Local API read-only daemon + full collection reconcile + authenticated HTTPS ingest.**

```
Zotero 10 (Mac, :23119)
        │  Local API v3 (GET only)
        ▼
wePaper Sync Agent (`wepaper sync` / `wepaper daemon`)
        │  HTTPS + bearer token
        ▼
wePaper Server (FastAPI)
        ├── SQLite metadata
        ├── PDF blobs on disk (content-addressed)
        └── Public web UI + PDF.js
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

Web API remains an optional metadata fallback if the user later provides a key. V1 does not require it.

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

- Public GET: paper list, paper detail, PDF stream (Range), health, SPA.
- Private write: ingest / hide / tombstone / sync state. Bearer token. Never shipped to the frontend.
- SQLite + on-disk blobs keyed by `sha256`. The storage interface can later move to object storage without changing paper identity.
- Visibility: `public` | `unlisted` | `private`. V1 lists and streams `public` only. Collection membership publishes as `public` unless a `#wepaper:private` tag is present.

## Public URL (V1)

`https://wepaper.plainlist.space`

Tencent intercepts HTTP-01 for hostnames that are not on the filed domain set. A path on the existing `plainlist.space` certificate is the working HTTPS door. nginx strips `/wepaper/` and proxies to `127.0.0.1:8788`. The UI is built with `WEPAPER_BASE=/wepaper/`.

Intended later: `https://wepaper.plainlist.space` once an A record exists.

## Stack

| Piece | Choice | Reason |
|-------|--------|--------|
| Server + agent | Python 3.12, FastAPI, one package | Tests, one language, small deploy |
| DB | SQLite + `wepaper.db.migrate()` | Single-user, persistent, no extra migrator |
| Web | Vite + React + pdfjs-dist | Mature chat-style viewer, static assets |
| Process | uvicorn on loopback + nginx + existing TLS | Matches the host |
| Host | `ubuntu@175.24.134.228` | Already serving `plainlist.space` |

## Modules

- `wepaper.normalize` — Zotero JSON → paper records
- `wepaper.checksum` / `wepaper.sanitize` — hash + safe names
- `wepaper.zotero` — Local API client (fakeable)
- `wepaper.sync_plan` — discover/diff actions
- `wepaper.agent` / `wepaper.remote` — apply + HTTPS client
- `wepaper.db` — schema + connection
- `wepaper.server` — public vs private HTTP

## Security split

`PUBLIC READ ≠ PUBLIC WRITE`. Anonymous visitors can list public papers and read their PDFs. Every mutating `/api/v1/sync/*` route requires `Authorization: Bearer`. Blobs are never mounted as static files. Hidden / private / tombstoned papers 404 on HTML and PDF.
