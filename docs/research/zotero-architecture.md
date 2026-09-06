# Zotero → wePaper Sync Architecture Research

**Date:** 2026-09-06  
**Scope:** Zotero 7.x (with notes on 9/10 where behavior diverges)  
**Goal:** Choose a stable, boring, debuggable V1 architecture for syncing a named Zotero collection tree to a public wePaper server.

---

## Executive Recommendation (TL;DR)

**Winner for wePaper V1: Independent macOS sync daemon + Zotero Local API (read-only), version-polling hybrid.**

| Dimension | Choice |
|-----------|--------|
| **Primary data source** | `http://127.0.0.1:23119/api/` (Local API v3) |
| **Incremental sync** | Library `Last-Modified-Version` + `?since=` + `/deleted?since=` |
| **PDF bytes** | `GET /users/0/items/{attachmentKey}/file` → follow 302 to `file://` path, read-only copy |
| **Collection scope** | Resolve configured root collection key (e.g. "wePaper") + recursive subcollections |
| **When Zotero is down** | Queue work; optionally metadata-only fallback via Web API if user opts in |
| **Remove from collection** | **Hide/unpublish on server** (default); do not delete Zotero data |
| **Identity** | `(zotero_item_key, zotero_attachment_key, md5)` per PDF revision |
| **Never do** | Write to `zotero.sqlite`; watch filesystem alone; use WebDAV as wePaper transport |

**Why this wins:** It is the integration path Zotero explicitly built to replace direct SQLite access ([Local API announcement](https://groups.google.com/g/zotero-dev/c/ElvHhIFAXrY/m/fA7SKKwsAgAJ)). It delivers complete metadata (including `collections`, `creators`, `tags`, attachment `md5`/`mtime`), supports incremental change detection via official versioning semantics ([Syncing](https://www.zotero.org/support/dev/web_api/v3/syncing)), resolves PDF locations without guessing storage layout, and is read-only by default—zero corruption risk to the user's library.

**Runner-up (conditional fallback only):** Web API v3 with personal API key—for metadata when Local API is unavailable and the library is synced to zotero.org. Not sufficient alone for linked files or unsynced local-only changes.

---

## Table of Contents

1. [Zotero Data on macOS](#1-zotero-data-on-macos)
2. [Zotero Local API (127.0.0.1:23119)](#2-zotero-local-api-12700123119)
3. [Zotero Web API v3](#3-zotero-web-api-v3)
4. [Attachment Types & PDF Storage](#4-attachment-types--pdf-storage)
5. [Item Key vs Attachment Key](#5-item-key-vs-attachment-key)
6. [Metadata Fields](#6-metadata-fields)
7. [Collections vs Filesystem](#7-collections-vs-filesystem)
8. [File Change Detection & Zotero Sync](#8-file-change-detection--zotero-sync)
9. [Incremental Sync via Library Version](#9-incremental-sync-via-library-version)
10. [Zotero Running vs Not Running](#10-zotero-running-vs-not-running)
11. [Architecture Comparison Matrix](#11-architecture-comparison-matrix)
12. [Recommended V1 Design](#12-recommended-v1-design)
13. [Event Detection Catalog](#13-event-detection-catalog)
14. [Operational Policies](#14-operational-policies)
15. [Risks & Surprises](#15-risks--surprises)
16. [Primary Source Index](#16-primary-source-index)

---

## 1. Zotero Data on macOS

### Default location

| OS | Default data directory |
|----|------------------------|
| macOS | `/Users/<username>/Zotero` |
| Windows | `C:\Users\<username>\Zotero` |
| Linux | `~/Zotero` |

Source: [The Zotero Data Directory](https://www.zotero.org/support/zotero_data/)

The authoritative way to find the active directory is **Settings → Advanced → Files and Folders → Show Data Directory**. Custom locations are supported but Zotero does not move data automatically—you must relocate `zotero.sqlite`, `storage/`, and sibling folders together. Source: [Advanced preferences](https://www.zotero.org/support/preferences/advanced)

### Directory contents (relevant to sync)

```
<data-dir>/
├── zotero.sqlite          # SQLite DB: metadata, collections, tags, notes
├── zotero.sqlite.bak      # Automatic backup (periodic)
├── zotero.sqlite.<n>.bak  # Upgrade backups
└── storage/
    └── <ATTACHMENT_KEY>/  # 8-char folder per stored attachment
        └── filename.pdf
```

- **`zotero.sqlite`**: item metadata, notes, tags, collection membership, etc. Read at startup.
- **`storage/`**: copied ("stored") attachment files only. **Linked files are not here.**
- **Close Zotero before copying/moving** the data directory. Source: [Zotero Data Directory — Backing Up](https://www.zotero.org/support/zotero_data/)

### Unsafe locations (corruption risk)

Never place the data directory in cloud-sync folders (Dropbox, iCloud Drive, Google Drive), network drives accessed concurrently, or external disks that may unmount while Zotero is open. Source: [Advanced — Unsafe Data Directory Locations](https://www.zotero.org/support/preferences/advanced), [Corrupted Database KB](https://www.zotero.org/support/kb/corrupted_database), [Cloud Storage KB](https://www.zotero.org/support/kb/data_directory_in_cloud_storage_folder)

**wePaper implication:** The sync agent must not watch or copy the entire data directory into cloud storage. It reads via API and uploads selected bytes over HTTPS.

---

## 2. Zotero Local API (127.0.0.1:23119)

### Availability & prerequisites

| Requirement | Detail |
|-------------|--------|
| **Zotero version** | Local API shipped in **Zotero 7 beta 88+**; stable in Zotero 7.x. Not available in Zotero 6. Source: [zotero-dev announcement](https://groups.google.com/g/zotero-dev/c/ElvHhIFAXrY/m/fA7SKKwsAgAJ) |
| **Zotero must be running** | Server binds to `localhost:23119`. Connection refused when app is quit. |
| **Preference** | Settings → Advanced → General → **"Allow other applications on this computer to communicate with Zotero"**. If disabled: `403 Forbidden`. Source: [Local API](https://www.zotero.org/support/dev/web_api/v3/local_api) |
| **Offline** | Works fully offline (serves local DB). |
| **Rate limits** | None (local). |

### Base URL & versioning

```
http://localhost:23119/api/
```

- Only **API v3** is supported locally.
- Send `Zotero-API-Version: 3` header (recommended).
- Probe `GET /api/` and read `Zotero-API-Version` response header when supporting multiple Zotero versions.

Source: [Local API](https://www.zotero.org/support/dev/web_api/v3/local_api), [Basics](https://www.zotero.org/support/dev/web_api/v3/basics)

### Authentication

| Operation | Auth |
|-----------|------|
| **Read (GET)** | **No API key required** |
| **Write (POST/PUT/PATCH/DELETE)** | Zotero **10+** only; local API key via `POST /api/local/authorize` + user dialog. **wePaper V1: no writes.** |

Source: [Local API — Authorizing Writes](https://www.zotero.org/support/dev/web_api/v3/local_api)

**wePaper V1 uses read-only endpoints only.**

### Security headers (critical for daemon authors)

Requests are rejected (`403`, body: `Request not allowed`) when:

- `User-Agent` starts with `Mozilla/` **or** an `Origin` header is present, **unless** `Zotero-Allowed-Request: 1` is sent.
- `Host` is not `localhost`, `127.0.0.1`, or `[::1]` (Zotero 10+).

Use a non-browser User-Agent (e.g. `wePaper-Sync/1.0`) **or** include `Zotero-Allowed-Request: 1`.

Sources: [GitHub commit 2603373](https://github.com/zotero/zotero/commit/2603373b860acb555062c01a5bb434d6c712aa3e), [zotero-dev 403 thread](https://groups.google.com/g/zotero-dev/c/5KM1QVUOeck), [Zotero 10 for Developers](https://www.zotero.org/support/dev/zotero_10_for_developers)

**Do not expose port 23119 externally.** Local API reads the full library without authentication.

### User/library ID

Pass **`0`** as the user ID (current logged-in user) or the numeric user ID from the API Keys page. Other user IDs return `400`.

```
GET http://127.0.0.1:23119/api/users/0/collections
```

### Key endpoints for wePaper

#### Collections (discover "wePaper" tree)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/users/0/collections` | All collections |
| GET | `/users/0/collections/top` | Top-level collections |
| GET | `/users/0/collections/{collectionKey}` | Single collection metadata |
| GET | `/users/0/collections/{collectionKey}/collections` | **Subcollections** |

#### Items

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/users/0/collections/{collectionKey}/items/top` | Top-level items in collection |
| GET | `/users/0/collections/{collectionKey}/items` | All items (incl. attachments as items) |
| GET | `/users/0/items/{itemKey}` | Single item JSON |
| GET | `/users/0/items/{itemKey}/children` | **Child attachments & notes** |
| GET | `/users/0/items?since={version}&format=versions&includeTrashed=1` | Changed item keys + versions |
| GET | `/users/0/deleted?since={version}` | Deleted keys since version |

#### Tags

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/users/0/collections/{collectionKey}/items/tags` | Tags within scoped collection |

#### File download (Local API-specific behavior)

| Method | Path | Behavior |
|--------|------|----------|
| GET | `/users/0/items/{attachmentKey}/file` | **`302` redirect to `file://` URL** on disk |
| GET | `/users/0/items/{attachmentKey}/file/view` | Same redirect (view semantics) |
| GET | `/users/0/items/{attachmentKey}/file/view/url` | Returns URL as **plain text** (no redirect) |

Source: [Local API — notable differences](https://www.zotero.org/support/dev/web_api/v3/local_api)

**Safe PDF copy workflow:**

1. `GET .../items/{attachmentKey}` → read `linkMode`, `md5`, `mtime`, `filename`, `contentType`.
2. `GET .../items/{attachmentKey}/file` → follow redirect to absolute `file://` path.
3. **Read-only** stream copy to wePaper staging (never write/move/rename in Zotero storage).
4. Verify SHA-256/MD5 against metadata before upload.

The Local API resolves linked vs stored paths correctly—filesystem watchers do not.

#### Local-only extras

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/users/0/searches/{searchKey}/items` | Execute saved search (Web API cannot) |

### Local API divergences from Web API

| Topic | Local behavior |
|-------|----------------|
| Pagination | **No default limit**—returns full result set unless `limit`/`start` supplied |
| Atom format | `501 Not Implemented` |
| File upload PATCH (binary diff) | `405 Method Not Allowed` |
| Sort/search | May differ slightly from Web API for equal keys / quicksearch |
| **Zotero 10+ versions** | Local `version` / `Last-Modified-Version` are **instance-local**, unrelated to Web API versions. Partition cache by `Zotero-Server-ID` header. |

Sources: [Local API](https://www.zotero.org/support/dev/web_api/v3/local_api), [Basics — Caching](https://www.zotero.org/support/dev/web_api/v3/basics)

---

## 3. Zotero Web API v3

### Base URL

```
https://api.zotero.org
```

HTTPS required. API v3 is current default; send `Zotero-API-Version: 3`.

Source: [Basics](https://www.zotero.org/support/dev/web_api/v3/basics)

### API keys

Create at [zotero.org/settings/keys](https://www.zotero.org/settings/keys). Pass via:

```
Zotero-API-Key: <key>
```

or `Authorization: Bearer <key>`.

Verify access:

```
GET https://api.zotero.org/keys/current
```

Response includes `userID`, `access.user.library`, `access.user.files`, `access.user.write`.

Source: [Syncing — Verify key access](https://www.zotero.org/support/dev/web_api/v3/syncing)

**Key scopes needed for wePaper fallback:** `library` (read) + `files` (read) minimum; **no write** for V1.

### Version headers

| Header | Direction | Applies to |
|--------|-----------|------------|
| `Last-Modified-Version` | Response | Library (multi-object GET) or single object |
| `If-Modified-Since-Version` | Request | Conditional GET → `304 Not Modified` |
| `If-Unmodified-Since-Version` | Request | Write precondition → `412` on conflict |

Source: [Syncing — Version Numbers](https://www.zotero.org/support/dev/web_api/v3/syncing)

### Incremental read pattern (official)

For each library:

```http
GET /users/{userID}/collections?since={lastVersion}&format=versions
GET /users/{userID}/items/top?since={lastVersion}&format=versions&includeTrashed=1
GET /users/{userID}/items?since={lastVersion}&format=versions&includeTrashed=1
GET /users/{userID}/deleted?since={lastVersion}
```

Then fetch changed objects by key (`itemKey=` up to 50 per request).

After each response, compare `Last-Modified-Version` to detect concurrent remote changes; restart if library version advanced mid-sync.

Source: [Syncing — Full-Library Syncing](https://www.zotero.org/support/dev/web_api/v3/syncing)

### File download (Web API)

```http
GET https://api.zotero.org/users/{userID}/items/{attachmentKey}/file
Zotero-API-Key: {key}
```

- Redirects to **Amazon S3**—client must follow redirects (`curl -L`).
- Compare response `ETag` to attachment item's `md5` field.
- If mismatch persists, file may exist only on WebDAV, not Zotero File Storage.

Sources: [File Uploads — Download existing file](https://www.zotero.org/support/dev/web_api/v3/file_upload), [Forum: curl -L required](https://forums.zotero.org/discussion/79654/download-attached-pdf-using-api)

**404 causes:** file not synced to Zotero servers; wrong key (parent item vs attachment); insufficient key permissions.

Source: [Forum: file not found](https://forums.zotero.org/discussion/114153/file-not-found-when-downloading-file-through-api)

### Web API limitations for wePaper

| Limitation | Impact |
|------------|--------|
| Requires internet + API key | Cannot serve as sole source for offline-first users |
| Linked files (`linked_file`) | **Not on zotero.org**—no file download |
| Unsynced local edits | Not visible until Zotero syncs to server |
| Rate limits | Backoff / 429 handling required ([Basics](https://www.zotero.org/support/dev/web_api/v3/basics)) |
| Public file URLs | `/file/view` requires auth; cannot redirect anonymous users to API URL ([Forum](https://forums.zotero.org/discussion/114153/file-not-found-when-downloading-file-through-api)) |

---

## 4. Attachment Types & PDF Storage

### Four attachment link modes

| `linkMode` | Name | Stored in `storage/`? | Synced to zotero.org? | Synced via WebDAV? |
|------------|------|----------------------|----------------------|-------------------|
| `imported_file` | Stored copy of local file | **Yes** | Yes (Zotero File Storage) | Yes |
| `imported_url` | Stored copy of downloaded URL / PDF snapshot | **Yes** (or multi-file snapshot dir) | Yes | Yes |
| `linked_file` | Link to external filesystem path | **No** | **No** | **No** |
| `linked_url` | Bookmark / URI | No file bytes | Metadata only | N/A |

Sources: [Library Items — Attachments](https://www.zotero.org/support/kb/library_items), [Attaching Files](https://www.zotero.org/support/attaching_files), [File Uploads — templates](https://www.zotero.org/support/dev/web_api/v3/file_upload)

### Stored file layout

```
<data-dir>/storage/<ATTACHMENT_ITEM_KEY>/<filename>
```

- Folder name = **attachment item's 8-character key**, not parent bibliographic item key.
- Path in DB (`itemAttachments.path`) looks like `storage:filename.pdf`—the key comes from `items.key` for the attachment row.

Sources: [Attaching Files — Accessing Files](https://www.zotero.org/support/attaching_files), [Forum: storage key = attachment key](https://forums.zotero.org/discussion/112137/zotero-storage-key-system), [Forum: SQL join pattern](https://forums.zotero.org/discussion/116370/how-to-find-the-directory-where-pdf-attachments-are-stored-in-zotero-sqlite)

### Attachment metadata (API JSON)

```json
{
  "itemType": "attachment",
  "linkMode": "imported_file",
  "title": "My Document",
  "contentType": "application/pdf",
  "filename": "doc.pdf",
  "md5": "4fa38e3f2c360ca181e633d02bab91f5",
  "mtime": "1331171741767",
  "parentItem": "PARENT_KEY"
}
```

`md5` and `mtime` (milliseconds) are the authoritative file-change signals for stored attachments.

Source: [File Uploads](https://www.zotero.org/support/dev/web_api/v3/file_upload)

---

## 5. Item Key vs Attachment Key

| Concept | Key belongs to | Example use |
|---------|---------------|---------------|
| **Top-level item key** | Bibliographic record (`journalArticle`, `book`, …) | Metadata sync identity; collection membership |
| **Attachment key** | Child `itemType: attachment` | File download URL; `storage/` folder name |
| **Parent ↔ child** | `parentItem` on attachment; or `GET /items/{parentKey}/children` | Discover PDFs |

**Common bug:** calling `/items/{parentKey}/file` → 404. Must use **attachment key**.

Source: [Forum: attachment key for /file](https://forums.zotero.org/discussion/73432/api-access-to-attachments)

**Multiple PDFs:** one parent can have many child attachments. Enumerate via `/children`, filter `itemType == attachment` and `contentType` contains `pdf` (or desired MIME types).

---

## 6. Metadata Fields

### Item JSON shape (API v3)

Each item returns:

```json
{
  "key": "X42A7DEE",
  "version": 42,
  "library": { "type": "user", "id": 475425 },
  "data": {
    "key": "X42A7DEE",
    "version": 42,
    "itemType": "journalArticle",
    "title": "...",
    "creators": [{ "creatorType": "author", "firstName": "...", "lastName": "..." }],
    "abstractNote": "...",
    "publicationTitle": "...",
    "date": "2024",
    "DOI": "10.1234/example",
    "url": "...",
    "tags": [{ "tag": "machine-learning", "type": 1 }],
    "collections": ["BX9965IJ", "9KH9TNSJ"],
    "relations": {},
    "dateAdded": "2011-01-13T03:37:29Z",
    "dateModified": "2011-01-13T03:37:29Z"
  }
}
```

Source: [Basics — example item](https://gist.github.com/f1030b9609aadc51ddec)

### wePaper-relevant fields

| Field | Notes |
|-------|-------|
| `title` | Primary display title |
| `creators` | Array with `creatorType`, `firstName`/`lastName` or `name` |
| `date` | Display date string |
| `publicationTitle` | Journal/book venue |
| `DOI` | Item-type-dependent; also check `extra` for CSL extras |
| `abstractNote` | Abstract text |
| `tags` | `{ tag, type }` — type 1 = automatic |
| `collections` | **Array of collection keys** — membership is on the item, not the collection |
| `dateModified` | Useful for debugging; prefer `version` for sync |
| `extra` | CSL extra fields; fallback for DOI etc. |

Field names are internal English names from the [Zotero data schema](https://github.com/zotero/zotero-schema). Local API returns localized item **type** names but field keys remain schema IDs.

Source: [Direct SQLite — Data Model](https://www.zotero.org/support/dev/client_coding/direct_sqlite_database_access)

### Collection membership semantics

- Items belong to **zero or more collections** via `data.collections[]`.
- Removing a collection key from the array removes membership ([Write Requests — PATCH collections](https://www.zotero.org/support/dev/web_api/v3/write_requests)).
- **Collection deletion ≠ item deletion**—items remain unless explicitly trashed/deleted.

---

## 7. Collections vs Filesystem

| Zotero Collection | macOS Folder |
|-------------------|--------------|
| Logical grouping in DB | Physical directory |
| Nested subcollections | No counterpart |
| Item can be in **multiple** collections | File has one path |
| Moving between collections = metadata edit | Moving files breaks Zotero storage |
| Identified by 8-char **collection key** | N/A |

**wePaper "wePaper" collection:** resolve once at setup by name → cache collection key → recursively walk `/collections/{key}/collections` for subcollections → union membership from `/collections/{key}/items/top` across the tree.

Filesystem folders under `storage/` map to **attachments**, not collections. Watching `storage/` cannot detect collection add/remove.

---

## 8. File Change Detection & Zotero Sync

### How Zotero detects file changes (internally)

For stored attachments, Zotero tracks:

- `md5` — content hash
- `mtime` — modification time in **milliseconds**
- `filename`, `contentType`

File upload API uses `If-Match` / `If-None-Match` with MD5 as ETag.

Source: [File Uploads](https://www.zotero.org/support/dev/web_api/v3/file_upload)

### Zotero File Storage vs WebDAV

| | Zotero File Storage | WebDAV |
|--|---------------------|--------|
| **Purpose** | Zotero-hosted attachment sync | User-provided file sync |
| **Group libraries** | Supported | **Not supported** |
| **Web library PDF view** | Yes | No |
| **API file download** | S3 redirect | May 404 on API if only on WebDAV |
| **wePaper relevance** | Fallback path for Web API PDFs | **Not a viable wePaper integration**—Zotero owns the protocol; files are zipped/opaque to third parties |

Sources: [Syncing — File Syncing](https://www.zotero.org/support/sync), [File Uploads — ETag/WebDAV note](https://www.zotero.org/support/dev/web_api/v3/file_upload)

### WebDAV is not a wePaper data tap

WebDAV sync is between **Zotero clients and the user's WebDAV server**, using Zotero-specific storage layout. It does not expose collection structure or metadata. Using WebDAV as wePaper's upstream would require reverse-engineering Zotero's proprietary file packaging—unsupported and brittle.

---

## 9. Incremental Sync via Library Version

### Version semantics

- Every library mutation increments a monotonic **library version** (opaque integer).
- Modified objects receive the new library version.
- `?since={version}` returns objects with version **>** since.
- `/deleted?since={version}` returns deleted keys.

Source: [Syncing](https://www.zotero.org/support/dev/web_api/v3/syncing)

### Recommended wePaper cursor state

Persist per Mac:

```json
{
  "source": "local",
  "zotero_server_id": "sPMHtLD6HHBd",
  "library_version": 12847,
  "scoped_collection_keys": ["ABC12345", "DEF67890"],
  "last_sync_at": "2026-09-06T12:00:00Z"
}
```

(Zotero 10+: include `zotero_server_id` from response header.)

### Polling loop (idempotent)

```
1. GET /api/users/0/items?since={cursor}&format=versions&includeTrashed=1
2. GET /api/users/0/deleted?since={cursor}
3. Intersect changed keys with items in scoped collection tree
4. For each key: GET item → if top-level, sync metadata; enumerate children for PDFs
5. Compare attachment md5/mtime vs wePaper state → upload if changed
6. Store max Last-Modified-Version from responses as new cursor
```

**Why not pure filesystem watch:** storage folder changes don't encode collection membership, metadata edits, or deletes. **Why not pure polling without versions:** full library scan is O(n) and slow on large libraries.

**Hybrid = version polling (primary) + optional LaunchAgent restart trigger when Zotero launches** (detect Local API availability).

---

## 10. Zotero Running vs Not Running

| State | Local API | Web API fallback | Filesystem/SQLite |
|-------|-----------|------------------|-------------------|
| **Zotero running, API enabled** | Full metadata + all local PDF paths | N/A (prefer local) | Not needed |
| **Zotero running, API disabled** | `403` until user enables | Metadata if synced + key | — |
| **Zotero quit** | Connection refused | Metadata only; PDFs if on Zotero Storage | Read-only SQLite/files possible but **discouraged** |
| **Zotero syncing** | Reads still served from local DB | Server may lag | — |

### V1 policy recommendation

1. **Primary:** Require Zotero running (menubar app is fine). Show clear UI when unavailable.
2. **Optional fallback:** Web API for metadata refresh only (user provides API key).
3. **Do not** read `zotero.sqlite` in V1—even read-only access while Zotero runs risks issues per official docs.
4. **LaunchAgent:** register daemon to poll; on Zotero launch, trigger catch-up sync.

Source: [Direct SQLite Access](https://www.zotero.org/support/dev/client_coding/direct_sqlite_database_access)

---

## 11. Architecture Comparison Matrix

Scoring: ✅ Good · ⚠️ Partial · ❌ Poor

| Architecture | Correctness | Metadata | PDF location | Collection filter | Incremental | Delete/detect | Mac 7.x | Upgrade stability | Server deploy | Zotero corruption risk |
|--------------|-------------|----------|--------------|-------------------|-------------|---------------|---------|-------------------|---------------|------------------------|
| **1. Watch `storage/` filesystem** | ❌ | ❌ | ⚠️ stored only | ❌ | ⚠️ mtime/inotify | ❌ | ✅ | ⚠️ | ✅ easy | ✅ none (if read-only) |
| **2. Read `zotero.sqlite` (RO)** | ⚠️ | ✅ | ⚠️ manual join | ✅ SQL | ⚠️ custom | ⚠️ custom | ✅ | ❌ schema changes | ✅ easy | ⚠️ **risk if Zotero open** |
| **3. Local API (read-only)** | ✅ | ✅ | ✅ via `/file` | ✅ | ✅ `?since=` | ✅ `/deleted` | ✅ | ✅ official surface | ✅ daemon | ✅ **none** |
| **4. Web API only** | ⚠️ | ✅ | ⚠️ synced stored only | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ easy | ✅ none |
| **5. WebDAV** | ❌ | ❌ | ⚠️ opaque | ❌ | ❌ | ❌ | ✅ | ⚠️ | ❌ hard | ✅ none |
| **6. Zotero plugin (JS API)** | ✅ | ✅ | ✅ | ✅ | ⚠️ custom events | ✅ | ✅ | ⚠️ per major version | ⚠️ XPI install | ⚠️ if buggy |
| **7. Desktop sync daemon (Local API)** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ none |
| **8. Hybrid: Local API + Web fallback** | ✅ | ✅ | ✅ local优先 | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ medium | ✅ none |

### Per-architecture notes

#### 1. Watch `storage/` filesystem

- Detects file replacement in `storage/<attachmentKey>/` via mtime/size.
- **Misses:** metadata edits, collection add/remove, linked files, trash/delete, rename in DB without file change.
- **False positives:** Zotero temp files during sync.

#### 2. Read `zotero.sqlite`

Official stance: *"generally preferable to access via Web API or JavaScript API"*; read-only only; **modifying while Zotero runs → corruption**; schema changes between releases.

Source: [Direct SQLite Access](https://www.zotero.org/support/dev/client_coding/direct_sqlite_database_access)

User constraint: **NEVER write to zotero.sqlite** — even read-only is a second-class path.

#### 3. Local API

Purpose-built replacement for SQLite scraping ([announcement](https://groups.google.com/g/zotero-dev/c/ElvHhIFAXrY/m/fA7SKKwsAgAJ)). Near-complete Web API v3 parity for reads.

#### 4. Web API only

Viable for **cloud-always-synced** libraries; fails for linked files and offline edits.

#### 5. WebDAV

Designed for Zotero ↔ WebDAV server sync, not third-party library mirroring.

#### 6. Zotero plugin

Runs in-process with full JS API (`Zotero.Items`, `Zotero.Attachments.linkFromFile`, etc.). Could push to wePaper on change. Downsides: install friction, Zotero 7 bootstrapped plugin model ([Zotero 7 for Developers](https://www.zotero.org/support/dev/zotero_7_for_developers)), review/maintenance burden, harder to debug than standalone daemon.

#### 7. Independent desktop sync daemon

**Same as #3** but packaged as launchd-friendly CLI/menubar agent with own state DB, retry logic, HTTPS upload. **Best separation of concerns.**

#### 8. Hybrid

Local API primary; Web API when Local API unavailable **for metadata only**; never dual-write.

---

## 12. Recommended V1 Design

### Component diagram

```
┌─────────────────────────────────────────────────────────────┐
│  Mac (user)                                                 │
│  ┌──────────┐    read-only     ┌─────────────────────────┐  │
│  │ Zotero 7 │ ◄─────────────── │ wePaper Sync Agent      │  │
│  │ :23119   │   Local API v3   │ (launchd / menubar)     │  │
│  └──────────┘                  └───────────┬─────────────┘  │
│                                            │ HTTPS          │
└────────────────────────────────────────────┼────────────────┘
                                             ▼
                              ┌──────────────────────────┐
                              │ wePaper Public Server    │
                              │ (metadata + PDF store)   │
                              └──────────────────────────┘
                                             │
                                             ▼
                              ┌──────────────────────────┐
                              │ Web UI (public read)     │
                              └──────────────────────────┘
```

### Configuration

| Setting | Example |
|---------|---------|
| Root collection name | `wePaper` |
| Root collection key | Resolved at setup via `GET /collections` name match |
| Include subcollections | `true` (recursive) |
| Poll interval | 60–300 s (backoff when idle) |
| Publish policy | Membership in scoped tree **AND** optional tag gate |

### Sync agent responsibilities

1. **Bootstrap:** resolve collection key; build subcollection key set; initial full import of scoped items.
2. **Incremental:** version polling per §9.
3. **Metadata push:** map Zotero JSON → wePaper schema; idempotent upsert by `zotero_item_key`.
4. **PDF push:** for each publishable attachment, if `md5` changed → copy bytes → upload with hash verification.
5. **Deletions:** process `/deleted` for items fully deleted from library → tombstone on server; collection-only removal → hide (§14).
6. **Never** write to Zotero (no Local API writes in V1).

### Server responsibilities

- Authenticate sync agent (API token / mTLS).
- Store immutable PDF blobs keyed by `(attachment_key, md5)`.
- Serve public read UI; enforce publish/hide flags.

---

## 13. Event Detection Catalog

| Event | Detection signal | wePaper action |
|-------|------------------|----------------|
| **Add to collection** | Item's `collections[]` now intersects scoped keys; or new item appears in `/collections/{key}/items/top` | Upsert metadata; queue PDFs |
| **Metadata update** | Item `version` increases (via `?since=`); `dateModified` changes | Patch metadata on server |
| **PDF replace** | Attachment `md5` or `mtime` changes | Upload new blob; retain old revision optionally |
| **New attachment on existing item** | New child in `/items/{parent}/children` | Ingest new PDF |
| **Remove from collection** | Item `collections[]` no longer intersects scoped keys (item version bump) | **Hide** on public site (default) |
| **Move between subcollections** | Still in scoped tree | Update collection path labels only |
| **Trash item** | Appears in `/items/trash` or deleted key in `/deleted` | Hide or tombstone |
| **Delete item permanently** | Key in `/deleted` `items[]` | Tombstone / archive on server |
| **Duplicate in Zotero** | New item key (duplicate creates new key) | Treat as new record |
| **Linked file added** | Attachment `linkMode: linked_file` | Resolve via Local API `/file` redirect; warn if path missing |

---

## 14. Operational Policies

### Remove-from-collection default: **Hide (unpublish)**

**Rationale:** Removing from the "wePaper" collection is a *withdrawal from public view*, not destruction of the user's research library. The item may reappear later. Hard delete on server loses history and complicates re-sync.

| Policy | When |
|--------|------|
| **Hide** (default) | Item left scoped collection tree |
| **Archive** | User explicitly marks `#wepaper:archive` or server-side admin action |
| **Delete** | Permanent Zotero item deletion (`/deleted`) + optional grace period |

### Identity keys

```
PaperIdentity     = zotero_item_key          (top-level bibliographic item)
AttachmentIdentity = zotero_attachment_key   (child attachment item)
ContentRevision   = md5                       (from Zotero attachment metadata)
Unique blob ID    = (attachment_key, md5)     (content-addressed storage)
```

Also store `parent_item_key`, `filename`, `mtime`, and wePaper `content_sha256` computed at upload for independent verification.

### Polling vs watcher vs hybrid

| Strategy | Verdict |
|----------|---------|
| **Filesystem watcher** | Supplementary at best; insufficient alone |
| **Pure time-based full scan** | Simple but does not scale |
| **Version polling (`?since=`)** | **Primary — official sync semantics** |
| **Hybrid** | **Version polling + sync-on-Zotero-launch + short interval poll (1–5 min)** |

### PDF download safety rules

1. Use Local API `/file` redirect—never construct `storage/` paths manually unless validating against API.
2. **Read-only** file I/O; copy to temp staging.
3. Verify hash matches attachment `md5` before upload.
4. Do not open files with write locks; do not touch `zotero.sqlite` or `.zotero` profile.
5. Skip attachments with missing files (`linkMode: linked_file` path not found) → log warning, sync metadata only.

### Multiple PDFs / supplementary files

- Enumerate **all** child attachments where `itemType == attachment` and MIME matches policy (e.g. `application/pdf`, optionally `application/zip` for supplementary).
- Each attachment gets its own `AttachmentIdentity` and blob.
- Display order: Zotero child order; flag primary PDF via earliest added or filename heuristic (`*.pdf` excluding `SI_*` etc.—configurable).

### Visibility / publishable policy hook

**Default gate:** item is publishable iff:

1. Top-level item is member of scoped collection tree (including subcollections), **AND**
2. Optional: has tag `#wepaper:public` or lacks `#wepaper:private`

Implement as configurable predicate in sync agent. Collection membership alone matches the stated product model ("papers in named Collection").

---

## 15. Risks & Surprises

| Risk | Severity | Mitigation |
|------|----------|------------|
| **Local API requires Zotero running** | Medium | Menubar presence; launchd retry; user messaging |
| **Linked files not on Web API** | Medium | Local API only; document requirement for stored files |
| **Zotero 10 local version partition** | Low (future) | Track `Zotero-Server-ID`; reset cursor on ID change |
| **Zotero 10 write support in Local API** | Low | V1 stays read-only—ignore write paths |
| **`Mozilla/` User-Agent 403** | High (dev trap) | Use native HTTP client UA or `Zotero-Allowed-Request: 1` |
| **Web API file 404** | Medium | Ensure Zotero File Storage sync; not WebDAV-only |
| **Collection membership is item property** | Low | Must diff `collections[]`, not infer from collection endpoint alone |
| **Attachment key ≠ parent key** | High (bug) | Always download via attachment key |
| **Direct SQLite schema changes** | Medium | Avoid SQLite path entirely |
| **Rate limits on Web API fallback** | Low | Batch requests; respect 429/Backoff |
| **No public Zotero file URLs** | Info | wePaper must host PDFs itself ([Forum](https://forums.zotero.org/discussion/114153/file-not-found-when-downloading-file-through-api)) |

### Surprises worth noting

1. **Local API was explicitly created to end SQLite scraping** — using it aligns with Zotero team intent.
2. **`storage/<key>` uses attachment key**, not parent paper key—counterintuitive when browsing filesystem.
3. **Collection removal does not delete items** — server must hide, not delete, by default.
4. **WebDAV files may be invisible to Web API `/file`** even when present locally.
5. **Local API returns unbounded result sets** — large libraries need explicit `limit`/`start` in the daemon to avoid memory spikes.

---

## 16. Primary Source Index

| Topic | URL |
|-------|-----|
| Zotero Data Directory | https://www.zotero.org/support/zotero_data/ |
| Advanced Preferences | https://www.zotero.org/support/preferences/advanced |
| Attaching Files | https://www.zotero.org/support/attaching_files |
| Library Items / Attachment Types | https://www.zotero.org/support/kb/library_items |
| Syncing (user) | https://www.zotero.org/support/sync |
| Web API Basics | https://www.zotero.org/support/dev/web_api/v3/basics |
| Local API | https://www.zotero.org/support/dev/web_api/v3/local_api |
| Web API Syncing | https://www.zotero.org/support/dev/web_api/v3/syncing |
| Web API Write Requests | https://www.zotero.org/support/dev/web_api/v3/write_requests |
| Web API File Uploads (incl. download) | https://www.zotero.org/support/dev/web_api/v3/file_upload |
| Web API Full-Text Content | https://www.zotero.org/support/dev/web_api/v3/fulltext_content |
| Direct SQLite Access | https://www.zotero.org/support/dev/client_coding/direct_sqlite_database_access |
| Plugin Development | https://www.zotero.org/support/dev/client_coding/plugin_development |
| Zotero 7 for Developers | https://www.zotero.org/support/dev/zotero_7_for_developers |
| Zotero 10 for Developers | https://www.zotero.org/support/dev/zotero_10_for_developers |
| Local API announcement (7 beta 88) | https://groups.google.com/g/zotero-dev/c/ElvHhIFAXrY/m/fA7SKKwsAgAJ |
| Local API 403 / User-Agent | https://groups.google.com/g/zotero-dev/c/5KM1QVUOeck |
| Storage key = attachment key | https://forums.zotero.org/discussion/112137/zotero-storage-key-system |
| Attachment /file endpoint | https://forums.zotero.org/discussion/73432/api-access-to-attachments |
| curl -L for S3 redirect | https://forums.zotero.org/discussion/79654/download-attached-pdf-using-api |
| Example item JSON | https://gist.github.com/f1030b9609aadc51ddec |
| Zotero schema (fields/types) | https://github.com/zotero/zotero-schema |

---

*End of research document.*
