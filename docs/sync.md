# Sync

```
Zotero (running) → Local API → wepaper sync → HTTPS → wePaper server
```

## Commands

```bash
wepaper doctor          # Zotero running? Local API? collection present?
wepaper sync --once     # one incremental/full reconcile
wepaper daemon          # poll loop + exclusive lock
wepaper status          # last local cursor
wepaper install-agent   # macOS launchd
```

## Configure

```bash
export WEPAPER_COLLECTION="wePaper,Agent Memory"
export WEPAPER_SERVER_URL="https://wepaper.plainlist.space"
export WEPAPER_SYNC_TOKEN="…"   # never commit; never put in VITE_*
```

The first matching collection name wins, including subcollections.

## Enable Local API

Zotero → Settings → Advanced → **Allow other applications on this computer to communicate with Zotero**.

The agent sends `User-Agent: wePaper-Sync/0.1` and `Zotero-Allowed-Request: 1`. It never writes the Zotero library.

## What each event does

| Zotero change | wePaper |
| --- | --- |
| New item in the collection | upsert metadata + upload PDFs |
| Metadata edit | metadata only |
| PDF replace (hash change) | upload new blob |
| Leave the collection | **hide** (list and PDF 404) |
| Permanent delete | tombstone |
| Same bytes, two items | one blob on disk |

A failed batch does **not** commit `library_version`. Restart resumes a full reconcile of the collection tree.

Reading status is wePaper-owned. Metadata updates, PDF replacements, hide, and later reappearance of the same `zotero_item_key` preserve `reading_status`. Filename changes do not affect it.

## Visibility

Collection membership makes a paper eligible. Tags:

- `#wepaper:private` → never listed, PDF 404
- `#wepaper:unlisted` → not listed; reserved for later secret links
- default in V1 → `public` (the operator is the publisher of record)

`robots.txt` disallows crawlers. There is no zip-the-library API.
