# wePaper architecture review (adversarial)

> **Historical (2026-09-06).** Pre-ship critique. Not the v1.6.0 product spec. Current behavior is in [docs/architecture.md](../architecture.md) and the [README](../../README.md).

**Role:** production critic. No feature work.  
**Inputs:** `docs/architecture.md`, `docs/research/zotero-architecture.md`, `docs/research/environment.md`, `TASK_LEDGER.md`.  
**Verdict:** the Local API + hide/tombstone + bearer-write split is the right *shape*. The locked V1 write-up is not shippable. It under-specifies the ingest protocol, crash-safe cursors, visibility enforcement, blob identity, and every operational fact already true on this Mac and VPS.

Implementers must treat every **High** item as a blocking requirement, not a later hardening pass. “We will be careful in code” is not a mitigation.

---

## High severity (must fix before ship)

### H1. Default-public PDFs are copyright infringement, not a library feature

**Failure mode.** The product is a *public* HTTPS list plus PDF.js. The publish gate is “member of collection `wePaper`” (optional `#wepaper:private` opt-out). A personal Zotero library is full of publisher PDFs (IEEE, ACM, Elsevier, Springer). Putting those bytes on `https://wepaper.plainlist.space` with anonymous GET + Range is public distribution, not private archival. Scrapers will walk the list. `#wepaper:private` is an easy typo away from a takedown. There is no robots/license/OA check, no per-item confirm, no rate limit.

**Required mitigation.**

- Default new ingest to `unlisted` or `private`. Collection membership is *eligibility*, not publish.
- Require an explicit publish action (tag `#wepaper:public` **or** a confirmed allow-list). Opt-in, not opt-out.
- Enforce the same visibility on **every** PDF/Range/download route, not only the HTML list.
- Rate-limit anonymous PDF bandwidth. Do not offer a zip-the-library API.
- Document that the operator is the publisher of record. Refuse to treat “personal library” as a legal theory.
- Do not ship a world-readable catalog until this gate exists and is tested (publish → listed; unpublish → list *and* PDF 404/401).

### H2. Hide/unpublish is specified for the list and omitted for the blob

**Failure mode.** Visibility is `public | unlisted | private`; V1 “lists `public` only.” The PDF route is “PDF stream (Range).” After collection removal the paper disappears from `/` and remains fetchable at `/papers/{id}/pdf` or `/blobs/{sha256}` if anyone bookmarked it, guessed a key, or kept a PDF.js tab. Tombstone that deletes the DB row and leaves a content-addressed file on a static mount is the same hole.

**Required mitigation.**

- Authorize blob reads through the paper/attachment row: if visibility is not `public` (or `unlisted` with the secret link token), return 404.
- Never mount the blob directory as `StaticFiles` or an nginx `alias` that bypasses the app.
- On hide: keep the blob, reject public reads. On tombstone: delete the *reference*; delete the blob only when the reference count is 0 (see H8).
- Tests: hide → list omit + PDF 404; unlisted → list omit + PDF only with token; two papers sharing a hash → hiding one does not 404 the other.

### H3. Incremental “intersect with scoped tree” drops collection-removal (and can drop adds)

**Failure mode.** Research polling step 3: *“Intersect changed keys with items in scoped collection tree.”* Removal from `wePaper` bumps the item version and **removes** it from `/collections/{key}/items`. Intersection with the *current* tree drops that key. `/deleted` does not fire (the item still exists). The architecture’s “collection removal → hide” never runs. The paper stays public forever.

If `scoped_collection_keys` is a cached set and is not rebuilt, a new subcollection’s items have collection keys the agent does not know. Adds are silently ignored.

Trash is specified as “hide or tombstone.” `includeTrashed=1` can look like a metadata update and re-publish a trashed item.

**Required mitigation.**

- On every poll: `items?since=` **and** `deleted?since=` **and** `collections?since=`. For **every** changed item key, GET the item (or a 404/gone) and **re-evaluate** the publish predicate. Do not intersect-then-fetch.
- Removal from the scoped key set, or `deleted` / trash, is a first-class apply action: hide or tombstone. Never “not in tree ⇒ skip.”
- Rebuild the collection tree every poll (or on any collection version change). Persist `scoped_collection_keys` as output, not as a filter of what you are allowed to see.
- Define trash: trashed ⇒ hide (not public). Permanent `/deleted` ⇒ tombstone.
- Test the four cases: add to collection; remove from collection; trash; empty-trash. A test that only adds will rubber-stamp this bug.

### H4. Cursor advanced before a durable apply permanently skips work

**Failure mode.** Spec: *“Store max `Last-Modified-Version` from responses as new cursor.”* If the agent writes that cursor, then crashes, or uploads 40 of 80 PDFs, or the server accepts metadata and rejects a blob, the next poll uses `since=new` and those keys never come back. Network interruption and “retry” cannot repair a cursor that claims the batch is done.

Zotero can also advance the library version *during* a long sync. Using a version from an early response while later GETs see a newer `Last-Modified-Version` commits a torn snapshot.

**Required mitigation.**

- Two-phase cursor: `pending_version` vs `committed_version`. Commit **only** after every planned apply has a terminal state (ok / rejected-with-reason / skipped-missing-file).
- Persist a per-item/per-attachment work ledger: `planned | uploading | applied | failed`. Restart resumes the ledger; it does not skip to `since=`.
- If any response’s `Last-Modified-Version` exceeds the version you started with, abort the batch (do not commit) and restart the poll.
- Never increment the cursor because a PDF is “temporarily missing.” Missing file ⇒ `failed` with retry; cursor stays.
- Test: kill the agent after N successful ingest calls; restart; remaining items still apply. Kill after cursor write with incomplete ledger — must not be representable.

### H5. Ingest has no protocol: retries duplicate, stale retries undo hide, two agents corrupt state

**Failure mode.** Architecture says “HTTPS + bearer” and “idempotent upload.” There is no request schema, no idempotency key, no server-side item version, no single-flight lock. Concrete collisions:

- Timeout after the server committed ⇒ client retries ⇒ second blob row or a second copy on disk.
- Agent restarts; launchd starts a second process before the first dies; two polls apply hide vs ingest.
- A delayed retry of an old ingest body re-publishes a paper the user already removed (last-write-wins without Zotero `version`).
- Same attachment queued twice in one process (60s poll overlapping a 10-minute upload).

**Required mitigation.**

- Split APIs: `PUT /blobs/{sha256}` (bytes, `Content-Length`, expected hash) and `PUT /papers/{zotero_item_key}` (metadata + attachment pointers + **Zotero item version**).
- Blob PUT is idempotent: if the hash exists and verifies, return 200 and do not write again (`If-None-Match` / early hash probe).
- Metadata PUT is compare-and-swap on `(zotero_item_key, zotero_version)`: stale version ⇒ 409, do not apply.
- Hide/tombstone carry the version too. A stale ingest must not unhide.
- Agent: `fcntl`/pidfile lock so only one daemon applies. Upload single-flight per `attachment_key`.
- Server: one writer (see H14). Tests for timeout-retry, overlapping polls, and stale ingest-after-hide.

### H6. Partial or interrupted upload can become the canonical PDF

**Failure mode.** A dropped TCP stream, a killed uvicorn worker, or a client that closes early can leave a truncated file at the blob path. If the server hashes after a partial write and stores that hash, or worse writes to the final `sha256` name before verification, every viewer gets a broken PDF and retries look “already uploaded.” A `%PDF-` prefix with a missing `%%EOF` still opens in PDF.js as a blank/corrupt document.

**Required mitigation.**

- Client sends `X-Content-SHA256` (or path `{sha256}`) and `Content-Length`. Server rejects length mismatch and unexpected EOF **before** commit.
- Write `{sha256}.part` on the same filesystem, stream to disk (no full `request.body` in RAM), fsync, re-hash, then atomic `rename` to `{sha256}`. Insert/update the DB row only after rename.
- Reject if computed hash ≠ claimed hash. Delete the `.part`. Do not keep a blob under the wrong name.
- Sweep `.part` older than N minutes on startup.
- Optional cheap gate: first bytes `%%PDF-` (or `%PDF-`). Not sufficient alone; hash is the commit gate.
- Tests: truncated body, wrong hash, kill-during-write, retry after each.

### H7. Reading the PDF while Zotero is still writing publishes garbage as truth

**Failure mode.** Add-file, Replace File, and Zotero file-sync write bytes after the attachment row exists. Local API can return `file://` and an `md5` that does not match the file yet (empty, previous, or mid-copy). The agent copies a short file, SHA-256s it, uploads, and advances work. Later the real PDF lands; if the agent keyed “already synced” on attachment key alone, it never uploads again. If it keyed on a stale Zotero `md5` that later updates, you get a second chance — unless H4 already committed the cursor.

**Required mitigation.**

- After the read-only copy, compute MD5 and SHA-256. Upload **only** if MD5 equals attachment `md5` and size > 0.
- If `md5` is empty, or hashes disagree, or mtime changed between stat and copy: do not apply; retry with backoff; do not commit cursor.
- Bound retries; surface `wepaper doctor` / sync status “attachment X not stable.”
- Never open Zotero storage with a write lock. Copy to agent staging first.
- Test with a fixture that changes bytes between metadata GET and file read.

### H8. Blob identity is contradictory; naive GC deletes the wrong paper

**Failure mode.** `docs/architecture.md` keys blobs by `sha256` (content-addressed). Research keys unique blob id as `(attachment_key, md5)` and also says “optionally retain old revision.” Implementers will pick one and get the other wrong:

- SHA-256 only, delete-on-tombstone: two papers share a PDF; deleting one unlinks the file; the other 404s.
- `(attachment_key, md5)` only: the same 8 MB file stored N times. Host has **≈5.1G free**.
- Replace-PDF without a pointer swap: list metadata still points at the old hash; or the URL is `/papers/{key}/pdf` and nginx/browser still have the old bytes (H9).

**Required mitigation.**

- Canonical blob id = `sha256` of bytes. Paper identity = `zotero_item_key`. Attachment identity = `zotero_attachment_key`. Revision = `(attachment_key → sha256, zotero_md5, mtime)`.
- Reference-count blobs. Tombstone/replace decrements. Unlink the file only at 0. Do not “retain old revisions” on this host unless an operator flag says so.
- One paper, many attachments: each row points at its own hash. UI selects a primary; the others remain attachments, not a second list card (H-medium).
- Lock this in `wepaper.identity` (the architecture typo `wepero.identity` is a smell that the seam is still fictional). Tests: shared hash, replace, tombstone-one-of-two.

### H9. PDF replace + cache + mutable URLs serve the old file (or a mix)

**Failure mode.** User replaces the PDF. Server updates the row. Public URL stays `/papers/{key}/pdf` or `/files/{filename}`. Browsers, PDF.js, and nginx `expires` keep the old object. Range requests against a cached object of a *new* length yield 416 or spliced pages. Concurrent tabs see two different documents under one title.

**Required mitigation.**

- Content URL **includes** the hash: `/blobs/{sha256}` (or query `?h=`). `Cache-Control: public, max-age=31536000, immutable` only on hash URLs.
- Mutable convenience URL (`/papers/{key}/pdf`) must be `Cache-Control: no-store` or `max-age=0` + `ETag: "{sha256}"` + `Vary`. Prefer 302 to the hash URL.
- After replace, the old hash URL may 404 once unrefferenced; the new hash URL is a new cache key.
- Tests: replace → new ETag/Location; old hash no longer authorized if unrefferenced; PDF.js second load gets new bytes.

### H10. Filenames and titles are not specified as non-identity — collision, rename, traversal

**Failure mode.** Architecture says the server stores “PDF blobs on disk (content-addressed)” but never specifies public paths. If the implementer uses `filename`, title slug, or the Zotero `file://` basename:

- Two “Attention.pdf” overwrite one blob.
- Rename/title edit breaks every link and PDF.js bookmark.
- `filename` = `../../etc/passwd` or `..\..\nginx\conf` writes or reads outside the blob root.
- Linked-file `file://` paths are **arbitrary user paths**. Echoing them to the server, or serving a “debug path,” is directory traversal.
- nginx `alias` without a trailing slash + `location /pdf/` is the classic unrestricted traversal.

Unicode: macOS NFD vs NFC, `文件.pdf`, `%2e%2e`, overlong UTF-8. Two normalized forms of the same name as two files, or a bypass of a denylist.

**Required mitigation.**

- On-disk blob names = `[0-9a-f]{64}` only. Reject any ingest field used as a path segment except that hex.
- Public routes: `/papers/{zotero_item_key}` and `/blobs/{sha256}`. Keys are `[A-Z0-9]{8}` (Zotero) and hex SHA-256. 404 on any `..`, `/`, `\`, or extra segment.
- Download name is `Content-Disposition` with RFC 5987 `filename*`; never the filesystem name.
- Agent may read Zotero’s `file://` **locally**; the server never receives a filesystem path.
- nginx: `alias`/`root` only to the blob dir; try_files to a known hash; no `^~` that strips into `/var`. Do not expose `/api/docs` write routes (H11).
- Tests: `../`, encoded dots, unicode normalization, two identical filenames, title rename does not change the paper URL.

### H11. Secrets and the write API will leak through the obvious holes

**Failure mode.** Bearer “never shipped to the frontend” is a slogan. The VPS already runs 宝塔 + sibling vhosts. Default FastAPI `/docs` and `/openapi.json` advertise ingest/hide/tombstone. `VITE_*` env ships to the bundle. nginx access logs record `Authorization`. systemd `Environment=` in a world-readable unit, a token in the LaunchAgent plist, or `wepaper doctor` printing the secret, all count as exposed. A public `/health` that dumps data-dir paths helps an attacker who finds a traversal.

There is no token rotation, no separate read-only token, and no mention of disabling docs in production.

**Required mitigation.**

- Write routes: `Authorization: Bearer` only, constant-time compare, no query-string token.
- Production: `openapi_url=None`, no `/docs`. CORS deny `*` on write routes.
- Token in `0600` files on Mac and VPS; never `VITE_`; never git. Doctor may say “token configured: yes/no,” never the value.
- nginx: do not log `Authorization`; do not proxy `/docs`.
- `/health` is `{ok, version}` only.
- Rotate-able token; reject empty/default tokens at boot.

### H12. Hostile or malformed PDFs become XSS and resource bombs on the public origin

**Failure mode.** PDF.js has a history of XSS via crafted PDFs. A public upload path (stolen bearer, or a future “helpful” public submit) plus `pdfjs-dist` on the same origin as the site cookie/token is an XSS sink. Zip-bomb streams exhaust the 5.1G disk or the browser tab. The architecture says “mature viewer” and stops.

**Required mitigation.**

- Pin `pdfjs-dist`; serve the viewer in a sandboxed iframe (`sandbox="allow-scripts"`, no same-origin).
- Strict CSP on the app origin: default-deny, no `unsafe-eval` except what a pinned PDF.js actually requires — prefer moving the viewer to a separate origin/path with a tight CSP.
- `X-Content-Type-Options: nosniff`, `X-Frame-Options` for the app (not the sandbox), `Content-Type: application/pdf` only for real blobs.
- Do not parse PDF objects in Python beyond a size/header check. No extra PDF libraries on the ingest path.
- Max bytes (H13). Tests: oversize rejected; viewer is cross-origin/sandboxed.

### H13. No size quota on a host with ≈5.1G free — one thesis or a 5k import kills the box

**Failure mode.** Environment: disk ~90% free, **≈5.1G**. Architecture: unlimited PDFs, optional old-revision retain, Python 3.12 (host is **3.10** — a pyenv/docker install is more disk), Vite build, SQLite, nginx logs. Average 5 MB × 1000 papers = 5 GB plus 2× temp during ingest. 5000 papers is not a later scale problem; it is a host-death problem. A single giant PDF streamed into memory in FastAPI OOMs the VPS and takes sibling products with it.

Failed uploads that leave `.part` files, WAL growth, and `journalctl` finish the job.

**Required mitigation.**

- Hard cap per PDF (start **50 MB** unless the operator raises it). Reject before writing past cap.
- Hard cap on total blob bytes (start **3 GB** on this host, leave slack for OS + siblings). Ingest returns 507 when exceeded; agent stops and reports. Do not delete other vhosts’ data to make room.
- Stream only; no `await request.body()`. nginx `client_max_body_size` matches the cap.
- Do not install Docker images or a second Python as the default deploy. Target the existing 3.10 **or** a small user-local 3.12 venv — pick one in the plan and measure disk before copy.
- No revision archive on this host. GC unrefferenced blobs. Sweep `.part`.
- First import: estimate `count * avg size` and refuse if over budget.

### H14. SQLite + restart + concurrent viewers is unspecified and will serialize or corrupt

**Failure mode.** “uvicorn on loopback” does not say workers. Multiple workers + SQLite writers = `database is locked` and half-applied ingest. Without WAL, a PDF.js page that fires dozens of Range GETs (if they incorrectly hit app+DB) blocks ingest. Server restart mid-rename leaves a missing final blob and a DB row that points at it (list shows the paper, PDF 404). Disk-full during a SQLite write can corrupt the only copy of the catalog.

**Required mitigation.**

- One ingest writer. Prefer **one** uvicorn worker, or a dedicated writer + WAL + `busy_timeout`.
- `PRAGMA journal_mode=WAL; foreign_keys=ON;` backups before migrate.
- Serve bytes with nginx `X-Accel-Redirect` / `sendfile` so Range and concurrent viewers do not touch SQLite.
- Restart: recover `.part`, verify every DB hash exists on disk, mark missing as unpublished-until-repair.
- Tests: restart during ingest; parallel Range on one PDF; ingest during list reads.

### H15. Local API is disabled *right now*; Connector ping is a false healthy

**Failure mode.** Environment (2026-09-06): Zotero 10.0.1, Connector on `:23119` **OK**, Local API **`403 Local API is not enabled`**. Architecture’s entire primary path is GET `/api/...`. A probe of the Connector port, or `GET /` without `/api`, reports “Zotero up” and the agent loops 403. `wepaper doctor` “explains how to enable” does not make smoke, E2E, or production sync possible. This is a current-machine hard stop, not a footnote.

Mozilla `User-Agent` or an `Origin` header (browser fetch, some HTTP wrappers, copied curl from DevTools) is a second 403: `Request not allowed`. Zotero 10 also rejects a `Host` that is not `localhost` / `127.0.0.1` / `[::1]`. Either looks like “API broken” and is easy to ship.

**Required mitigation.**

- Health checks must hit `GET /api/` (or `/api/users/0/items?limit=1`) with `Zotero-API-Version: 3`, UA `wePaper-Sync/1.0` (never `Mozilla/`), header `Zotero-Allowed-Request: 1`, `Host: 127.0.0.1`. Treat Connector-only as **not ready**.
- Map 403 bodies: “Local API is not enabled” vs “Request not allowed.” Doctor text is the Settings checkbox vs UA/Origin, not a generic “is Zotero running?”
- Do not start incremental sync until a real `/api/` 200. Backoff. Never fall through to “sync all local files” or BBT.
- Ledger smoke is blocked until a human enables the Local API. Do not invent a sqlite/BBT primary path in V1 (that contradicts the lock) and do not pretend the agent works today.

### H16. Zotero 10 local versions are not Web API versions

**Failure mode.** On Zotero 10, `Last-Modified-Version` / `version` from Local API are **instance-local**. They do not match `api.zotero.org`. Mixing them (Web API fallback “later,” a copied cursor, a second machine) skips or re-downloads at random. Profile reset / DB repair / new `Zotero-Server-ID` makes an old local cursor lie: `?since=12847` on a library that is now at 200 looks like “nothing changed” or explodes.

Architecture mentions the header; it does not require a reset policy. Research marks this “Low (future).” The environment **is Zotero 10.0.1**. It is present tense.

**Required mitigation.**

- Persist `{source: "local", zotero_server_id, library_version}`. If `Zotero-Server-ID` is missing or **changes**, treat cursor as empty and full-reconcile (do not hide-all as a side effect; diff against server state).
- Web API, if ever added, is a **separate** cursor file. Never reuse local versions.
- Tests: fake a Server-ID change → reconcile; refuse to apply a web version to a local cursor.

### H17. There is no `wePaper` collection; name resolve can publish the wrong library or nothing

**Failure mode.** Live collections: `Agent Memory` (`M277TYYA`), `MIS` (`WU6FW67F`). No `wePaper`. Bootstrap “resolve name `wePaper`” fails. Unspecified behavior is the bug: exit 0 and serve an empty site that “looks shipped”; wait forever; **or** fall back to all items / first collection. Falling back to `Agent Memory` is a confidentiality incident, not an empty state.

Name match is also unstable: two “wePaper” collections; user renames the real one; agent re-resolves and either hides everything or binds the wrong tree (H3).

**Required mitigation.**

- Configure **collection key**, not only a name. Name is a setup hint. Persist the key.
- If the key 404s: **stop publishing new items**, alert, do **not** hide-all automatically, do **not** pick another collection.
- If unset and no name match: refuse to sync. Doctor: create the collection in Zotero and set the key. No default to `Agent Memory` / `MIS` / “all items.”
- Do not create the collection via Local API writes (V1 is read-only).

### H18. `wepaper.plainlist.space` has no DNS — public HTTPS cannot exist

**Failure mode.** Architecture’s public URL is `https://wepaper.plainlist.space`. Environment: DNSPod zone has sibling A records; **this name has none**. Certbot HTTP-01 and “public E2E” fail. Shipping nginx config for a name nobody resolves looks done and is not.

**Required mitigation.**

- Before calling production up: A/AAAA `wepaper.plainlist.space` → `175.24.134.228`, then HTTP-01, then TLS vhost.
- This is a human DNSPod action. Until it exists, do not mark Deployment/Public E2E complete. Do not silently use a sibling hostname and then document the wrong URL.
- Health and docs use the name that actually resolves.

### H19. First-class 5000-paper incremental design does not exist (and will OOM the agent)

**Failure mode.** Local API returns **unbounded** lists unless `limit`/`start` are set. `GET /users/0/items?since=0` on a 5k+ library (or a busy library with BBT) loads the world into one Python list. The web UI is unspecified; a single `GET /papers` that returns every abstract + every attachment URL will lock a phone browser. There is no batch ingest, no backpressure, and no periodic **reconcile** — only “full import on empty cursor” plus incremental. Drift after H4/H5 bugs is undetectable.

**Required mitigation.**

- Every Local API list call uses explicit `limit`/`start` (e.g. 100). Stream pages.
- Server list API: cursor pagination, metadata-only; abstracts optional; no blob bytes in JSON.
- After incremental apply, a periodic reconcile (daily or `wepaper sync --full`): compare scoped tree to server keys; hide extras; ingest missing. Incremental is not enough.
- Do not claim 5000-paper support on a 5.1G disk (H13). State the real cap derived from quota.

### H20. Duplicate upload of the same bytes is not designed (disk + race)

**Failure mode.** Related to H5/H8 but a distinct operator failure: one bibliographic item with two child PDFs that are the same file; or poll + retry; or replace that is actually identical bytes (Zotero `mtime` changed, `md5` did not). Without a probe-before-PUT, the VPS writes the file twice (or writes a `.part` that fills the disk) and the agent thinks “upload is the expensive path.”

**Required mitigation.**

- Agent: if local SHA-256 already equals the server’s pointer for that `attachment_key`, skip PUT.
- `HEAD /blobs/{sha256}` authorized; 200 ⇒ skip bytes, still PUT metadata if needed.
- `mtime`-only change with same `md5` ⇒ metadata, no upload.
- Metrics: bytes skipped vs bytes written. A test must prove the skip.

---

## Medium

### M1. Multiple PDFs and supplementary files become one viewer or N public papers

**Failure mode.** One item, many children: publisher PDF, preprint, SI, slides, a snapshot whose `contentType` is not `application/pdf`. Architecture identity includes `attachment_key` but the UI is “list + PDF.js” singular. Implementers will either drop extras (lost SI) or create one card per attachment (duplicate titles, copyright × N). Notes, annotations, and `imported_url` HTML snapshots get ingested as papers if `/items` is used instead of `/items/top` + `/children` filtered.

**Required mitigation.**

- Papers are top-level bibliographic items **or** standalone `attachment` PDFs. Never annotation/note items.
- Attachments: `itemType == attachment` and `contentType` is `application/pdf` (allow a small MIME allow-list). Skip snapshots that are not PDFs.
- Store all matching PDFs; mark **one** primary (explicit tag `#wepaper:primary`, else first `application/pdf` by `dateAdded`). Viewer default = primary; other PDFs are named links.
- Tests: two PDFs, SI-only, standalone PDF, note-only item (excluded).

### M2. Missing attachment or missing metadata must not create a 200 empty reader

**Failure mode.** Linked file deleted; “Available online” not downloaded; empty title; no creators; parent is a bare PDF. List shows a paper; PDF.js loads a 404 or a 0-byte blob. Incremental then “succeeds.”

**Required mitigation.**

- Metadata can apply without a blob. Public list: paper is `public` only if visibility says so **and** at least one verified blob exists (or an explicit “metadata-only” flag — default **no**, do not list PDF-less papers as readable).
- Missing file: sync status `needs_file`, retry, never fake a blob.
- Title fallback: filename stem, then `Untitled ({item_key})`. Never empty `<h1>`.
- Standalone PDF: title from attachment title/filename; still a stable `item_key`.

### M3. Rename is three different events and only one is safe by default

**Failure mode.** (1) Attachment `filename` change, same md5 — must not re-upload; must update `Content-Disposition`. (2) Item title change — must not change `/papers/{key}`. (3) Collection rename — key must stay; re-resolve-by-name is H17. If the frontend uses title slugs in `react-router`, (2) 404s.

**Required mitigation.**

- All three are metadata patches. Assert no blob write when hash is unchanged.
- Router ids are Zotero keys only.
- Collection labels are cosmetic; membership is keys.

### M4. Delete/trash/hide/tombstone/re-add is a state machine, not two bullets

**Failure mode.** Architecture: remove → hide; permanent delete → tombstone. Re-adding the same item key to the collection must unhide and keep the same public URL. Tombstone then re-create in Zotero **reuses keys rarely** but a user can undelete from trash. A tombstone that hard-deletes the row makes undelete a “new” paper or a unique-constraint crash. Grace period is mentioned in research and missing from the lock.

**Required mitigation.**

- States: `public | unlisted | private | hidden | tombstoned`. Hide is reversible by membership. Tombstone is reversible for a grace window if the key reappears in Local API; after GC of the blob, re-ingest is a new revision of the same key.
- Unique constraint on `zotero_item_key` remains forever (do not DELETE the row on tombstone; set state).
- Tests: hide→add-back same URL; trash→hide; undelete→public if still in collection; permanent delete→tombstone; re-ingest same key.

### M5. Range requests will be wrong if Python serves files

**Failure mode.** Spec says “PDF stream (Range).” Starlette `FileResponse` can do 206, but a custom `StreamingResponse` often ignores `Range`, returns 200 of the full 50 MB, or mishandles suffix ranges. PDF.js then issues many ranges and either hammers the worker or hangs. Multipart/byteranges are unused by PDF.js; single-range is enough — if implemented.

**Required mitigation.**

- Prefer nginx `X-Accel-Redirect` to the hash file (sendfile, 206).
- If Python serves: use a Range implementation with tests for `0-`, `-1`, mid-span, unsatisfiable 416, and `If-Range` with ETag=sha256.
- One viewer + two concurrent viewers in Playwright: page 1 and last page render.

### M6. Cache invalidation for the *list* and for metadata edits

**Failure mode.** Even with hashed PDF URLs, `GET /api/papers` or SSR HTML can be cached by the browser or a 宝塔 static rule. Title/tag/hide updates look “not synced.” Service workers (if someone adds PWA later) freeze the catalog.

**Required mitigation.**

- List/detail JSON: `Cache-Control: no-store` or short max-age + ETag from a server `catalog_version` incremented on every apply.
- No service worker in V1.
- After hide, a hard reload without cache must omit the paper (Playwright `cache: 'reload'`).

### M7. Data consistency: metadata/blob/cursor/server can diverge with no reconcile

**Failure mode.** Paper row without blob; blob without row; agent cursor ahead of server; two attachments, one uploaded. Incremental will not see them again (H4). Architecture’s only full import is “empty cursor.”

**Required mitigation.**

- Apply order: durable blob, then metadata pointer, then agent ledger, then cursor (H4).
- `GET /admin/consistency` (auth): rows missing files, files missing rows, pointers to unknown hashes.
- `--full` reconcile (H19). Agent treats server as source of truth for “what is published,” Zotero as source of truth for “what should be.”

### M8. Unicode, NFC/NFD, and Content-Disposition

**Failure mode.** macOS `file://` paths are often NFD. Hashing bytes is fine; comparing *filenames* or building `file://` URLs without quoting is not. `Content-Disposition: filename="中文.pdf"` breaks in browsers. A denylist on `.pdf` that uses Unicode homoglyphs is theater if the path is already hash-only (H10) — but download names still need encoding.

**Required mitigation.**

- Treat Zotero `filename` as opaque display text. Open files via the Local API path (already escaped by Zotero), not by concatenating `storage/`.
- Send `filename*` UTF-8. Tests with CJK, combining marks, and spaces.

### M9. Giant-PDF viewer and agent memory (even under the 50 MB cap)

**Failure mode.** PDF.js loads large page rasters; a 50 MB scan can freeze mobile. Agent SHA-256 of a 50 MB file is fine if streamed; `Path.read_bytes()` is not.

**Required mitigation.**

- Hash with a streaming hasher. Playwright smoke on a large fixture (generate a sparse/big PDF), not only a 20 KB toy.
- Viewer: do not prefetch all attachments. Linearize/hint is optional; Range (M5) is required.

### M10. Server and agent restart without a pidfile / WAL story (ops)

**Failure mode.** systemd `Restart=always` + a stuck upload: two writers (H5). Mac LaunchAgent the same. SQLite copied while WAL exists → restore a torn DB.

**Required mitigation.**

- Exclusive lock; `Restart=on-failure`; timeout on a single apply.
- Backup = `sqlite3 .backup` or `VACUUM INTO`, never `cp` of a live file.
- Agent state DB on the Mac uses the same crash rules as the server.

### M11. Web API fallback (even “later”) will 404 linked files and desync versions

**Failure mode.** Architecture keeps Web API as optional metadata fallback. Linked files and unsynced edits are invisible. A metadata-only refresh that marks “synced” without a PDF will publish PDF-less papers (M2) or overwrite local titles with stale cloud titles.

**Required mitigation.**

- V1: no Web API fallback. If added: metadata only, never set `applied` for files, never share cursors (H16), never hide because the cloud collection view lagged.

### M12. Host/Python/deploy mismatch

**Failure mode.** Stack table says Python 3.12; host is 3.10. A “small venv” that compiles 3.12 or pulls `python:3.12` fights H13. FastAPI features or type syntax can break 3.10 if they write 3.12-only code.

**Required mitigation.**

- Declare the production interpreter (3.10 on the box **or** a measured 3.12). CI matches it. No container as the default on this disk.

### M13. Mozilla User-Agent 403 as a test-only footgun

**Failure mode.** Production httpx UA may be fine while Playwright/browser doctor and copied snippets 403. CI “Local API integration” against a real Zotero then flickers.

**Required mitigation.**

- One client module sets UA + `Zotero-Allowed-Request: 1` + API version. Tests assert those headers (fake transport). Browser is not a Local API client.

### M14. Filename collision on *download* and on Windows-ish names

**Failure mode.** Even with hash storage, `Content-Disposition` using the raw Zotero filename can collide in the user’s Downloads folder or include `NUL`/`/`. Low harm compared to H10, but the viewer “Save” button will look broken.

**Required mitigation.**

- Sanitize the download basename: strip path separators, max length, fallback `{attachment_key}.pdf`.

### M15. Concurrent viewers vs ingest lock (read availability)

**Failure mode.** A long ingest transaction that locks SQLite makes the public list hang. Looks like downtime.

**Required mitigation.**

- Short transactions. WAL. List queries do not join blob IO. nginx serves blobs.

---

## Low

### L1. `wepero.identity` typo and fictional modules

The module list is a wish: `wepaper.normalize`, `wepaper.identity`, `wepaper.zotero`, `wepaper.sync`, `wepaper.store`, `wepaper.http`. Good seams — but they do not exist yet, and one name is already wrong. Implement from tests against those interfaces; do not invent a seventh place for identity rules.

### L2. Poll interval 60s vs long uploads

A fixed 60s poll during a 10-minute upload is fine only with single-flight (H5). Otherwise this is High. With the lock, it is just wasted GETs. Jitter the poll; do not queue a second full plan while `apply` runs.

### L3. Collection display path and multi-membership

An item can sit in `wePaper` and `MIS`. Labels are cosmetic. Do not fork two public papers. Do not require a unique collection path.

### L4. Duplicate Zotero items (same DOI, new key)

Zotero “Duplicate” is a new paper. V1 can accept two cards. Optional later: DOI collapse. Do not merge automatically (wrong paper, wrong PDF).

### L5. Better BibTeX JSON-RPC is reachable and unused

Correct to ignore for V1. Doctor should say “BBT is not used” so a future agent does not “helpfully” scrape it and write a second source of truth.

### L6. Group libraries and user id

Local API `users/0` is the logged-in user. Group collections named `wePaper` will not appear. Document “personal library only.” Do not silently switch IDs.

### L7. `imported_url` multi-file snapshots

`/file` is not always one PDF. MIME filter (M1) handles most. Log and skip directories.

### L8. Localization of item type names

Local API may localize type **labels**; field keys stay English. Normalize on keys (`journalArticle`), never on localized strings.

### L9. OpenAPI field extras / `extra` DOI

DOI sometimes lives only in `extra`. Missing DOI is not a ship blocker; do not fail ingest. Parse `extra` if easy.

### L10. Let’s Encrypt HTTP-01 vs 宝塔

Sibling vhosts already do this. Risk is a panel rewrite that steals `/.well-known` or a second certbot fighting 宝塔. Use the same path as an existing `*.plainlist.space` host; do not invent a parallel ACME client.

### L11. IPv6 `localhost` vs `127.0.0.1`

Zotero 10 Host allowlist includes `[::1]`. Pin the agent to `http://127.0.0.1:23119` to avoid dual-stack surprise.

### L12. Clock and JWT

If someone “improves” the bearer into a JWT with `exp`, Mac/VPS clock skew becomes a sync outage. Prefer a long random token (H11).

---

## What is already sound

These choices should stay. Do not “simplify” them back to a folder watcher.

1. **Read-only Local API as primary.** It is the surface Zotero built to replace sqlite scraping. It resolves stored vs linked paths. It does not write `zotero.sqlite`.
2. **Rejecting filesystem watch, live sqlite, WebDAV, and a plugin as V1 primary.** Those miss membership/deletes, fight schema/lock, hide metadata, or couple to XPI upgrades. The comparison matrix is right.
3. **Never write Zotero.** No Local API writes, no collection auto-create, no file moves in `storage/`.
4. **Hide vs tombstone (intent).** Leaving the collection is unpublish, not destroy. Permanent delete is a different event. (The algorithm in the research loop does not implement this yet — H3 — but the policy is correct.)
5. **Public read / private write.** A bearer that never belongs in the Vite bundle is the right split (must be enforced — H11/H2).
6. **Version polling + `/deleted` + official headers.** Incremental should be `?since=` and `Last-Modified-Version`, not mtime on `storage/`. Zotero 10 `Zotero-Server-ID` is the right extra field (must be *used* — H16).
7. **Identity directionally right.** `(zotero_item_key, zotero_attachment_key)` plus a content hash. Filenames are not ids. (Reconcile hash vs `(attachment_key, md5)` — H8.)
8. **PDF bytes via `/file` → `file://` copy, not path construction.** Manual `storage/<parentKey>` is a known footgun (folder is the **attachment** key).
9. **Deploy shape matches the host.** Loopback uvicorn + nginx + Let’s Encrypt + existing `plainlist.space` VPS. Small process, not a new platform. (DNS and disk still block — H18/H13.)
10. **Deep seams.** Normalize / identity / zotero-client / sync plan-apply / store / http is the right test boundary: fake the Zotero client; do not unit-test live sqlite.
11. **`wepaper doctor` as the Local API enable path.** Correct product instinct — incomplete until it distinguishes Connector vs `/api/` and UA 403 (H15).

---

## Implementer contract

Do not start Backend/Sync by copying the six-line poll in the research doc. Implement **H3–H9** as tests first (empty, add, update, replace, remove, delete, duplicate, interrupt, retry, restart, unicode, long title — the ledger already listed these). Treat H1, H2, H10–H13, H15–H18 as release gates: a green happy-path sync to a default-public open PDF directory on a full disk with no DNS is not a ship.

**Environment facts that remain true until a human changes them:** Local API disabled; no `wePaper` collection; no `wepaper.plainlist.space` A record; ≈5.1G free. The architecture must fail closed in all four states, not “try something else.”
