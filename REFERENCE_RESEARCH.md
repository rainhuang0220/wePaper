# wePaper reference research

**Date:** 2026-09-06  
**Scope:** Open-source and product benchmarks for a public personal Zotero paper library.  
**This document does not implement wePaper.** It records what real projects actually do after reading their READMEs, architecture notes, source trees, issues, and official docs.

## Product under design

wePaper is a **personal Zotero paper library on the public web**:

- One Zotero collection is the source of truth.
- A daemon syncs that collection into wePaper.
- The public site shows a paper list.
- Clicking a paper opens a PDF.js reader.
- **Public read, private write.**
- No social features, no AI Q&A.

The useful prior art is therefore *not* “another Zotero.” It is: how serious products sync metadata without corrupting the source, how they serve PDFs, how they keep a list readable at library scale, and how they keep write APIs off the public internet.

## Method

Primary sources only. Claims below come from repository READMEs, architecture docs, source files, official Zotero documentation, or GitHub issues. Secondary blog posts are used only to locate a repo, then discarded.

Repos and docs actually read (not title-skims):

| Source | What was read |
| --- | --- |
| [zotero/web-library](https://github.com/zotero/web-library) | README, `package.json`, `src/` tree, `src/js/routes.js`, `src/js/component/reader.jsx`, `src/html/index.html`, open issues |
| [joonsoome/on-prem-zotero-webui](https://github.com/joonsoome/on-prem-zotero-webui) | README, `docs/development-overview.md`, `app/main.py`, compose/Docker layout, issue #2 |
| [zotero/dataserver](https://github.com/zotero/dataserver) | tree (`controllers/`, `model/`, `htdocs/`, `include/`, `cloudformation/`). No root README. |
| [zotero/reader](https://github.com/zotero/reader) | README, `package.json` |
| [zotero/translation-server](https://github.com/zotero/translation-server) | README |
| Official Zotero docs | [Web API v3 basics](https://www.zotero.org/support/dev/web_api/v3/basics), [syncing](https://www.zotero.org/support/dev/web_api/v3/syncing), [file uploads](https://www.zotero.org/support/dev/web_api/v3/file_upload), [local API](https://www.zotero.org/support/dev/web_api/v3/local_api), [sync](https://www.zotero.org/support/sync) |
| [tnajdek/zotero-api-client](https://github.com/tnajdek/zotero-api-client) | README |
| [urschrei/pyzotero](https://github.com/urschrei/pyzotero) | README |
| [fauky/zotero-lxc](https://github.com/fauky/zotero-lxc), [uniuuu/zotprime](https://github.com/uniuuu/zotprime), [ilyasoloma/zotero-selfhost](https://github.com/ilyasoloma/zotero-selfhost) | READMEs |
| [paperless-ngx/paperless-ngx](https://github.com/paperless-ngx/paperless-ngx) | README, [usage](https://docs.paperless-ngx.com/usage/), `src/documents/views.py` (`serve_file`), PDF viewer component, FileResponse PR |
| [papermerge/papermerge-core](https://github.com/papermerge/papermerge-core) | README, [architecture](https://docs.papermerge.io/3.5/developer-manual/architecture/) |
| [karakeep-app/karakeep](https://github.com/karakeep-app/karakeep) | README |
| [sissbruecker/linkding](https://github.com/sissbruecker/linkding) | README |
| [pinkpixel-dev/kintara](https://github.com/pinkpixel-dev/kintara) | README |
| [aidenlx/zotlit](https://github.com/aidenlx/zotlit) | README + `read-source.ts` snapshot comments |
| [retorquere/zotero-better-bibtex](https://github.com/retorquere/zotero-better-bibtex) | README |
| [mozilla/pdf.js](https://github.com/mozilla/pdf.js) | README, [Getting Started](https://mozilla.github.io/pdf.js/getting_started/), [Setup wiki](https://github.com/mozilla/pdf.js/wiki/Setup-pdf.js-in-a-website), range-request issues |
| [wojtekmaj/react-pdf](https://github.com/wojtekmaj/react-pdf) | `packages/react-pdf/README.md` |
| [arxiv-vanity/arxiv-vanity](https://github.com/arxiv-vanity/arxiv-vanity) | README |
| Polar / JabRef / PaperMod / Atticus / Dokiel | READMEs or product docs; several are name collisions, noted below |

---

## Comparison table

| Project | Worth borrowing | Not suitable for wePaper | Architecture lesson |
| --- | --- | --- | --- |
| **zotero/web-library** | Virtualized item list (`react-window`), canonical routes (`/…/items/{key}/attachment/{id}/reader`), iframe isolation of the reader, `zotero-api-client` as a thin API layer, public-library demo config | Forking it. It is a full Zotero client (edit, groups, notes, annotations, citeproc, DnD). AGPL-3.0. Reader downloads the **entire PDF into an `ArrayBuffer`**. Public user-library reader is explicitly unsupported | Do not become Zotero.org. Build a thin public list + reader. Keep the API key off the page |
| **on-prem-zotero-webui** | Closest product: official Zotero stays SoT; WebDAV zips stay on-prem; FastAPI proxy extracts first PDF and streams it; uploads gated off | Vendoring `web-library` via git subtree. PoC (v0.1.14). Auth is optional Basic and easy to leave off. Streaming has **no Range**. AGPL because of the UI | Separate metadata host from PDF host. Never write back to WebDAV. Do not ship the official UI just to get “Open PDF” |
| **zotero/dataserver + stream-server + translation-server** | Official versioned REST model, file upload handshake (`md5`/`If-Match`), library version headers | Self-hosting the whole stack. PHP dataserver has no root README. Domain/protocol get hardcoded. Default `admin`/`admin` in every packaging repo | wePaper should be a **read replica**, not a Zotero server |
| **zotero/reader + zotero/pdf.js** | Proof that a professional paper reader is a forked PDF.js + custom chrome, not a raw `<iframe src="file.pdf">` | Shipping Zotero’s annotator. AGPL, annotation CRUD, EPUB/HTML, dual-pane. Requires the full attachment blob | For wePaper, use upstream `pdfjs-dist` + a thin chrome. Do not take the annotation engine |
| **Zotero Web API / Local API / pyzotero / zotero-api-client** | Incremental sync (`since=`, `Last-Modified-Version`, `format=versions`). File download is `/file`, not `/file/view`. Clients must **not** invent versioning | Pointing the public browser at `api.zotero.org` or S3. Local API versions are **unrelated** to Web API versions in Zotero 10+ | Sync daemon talks to Zotero. Public site talks only to wePaper |
| **ZotPrime / zotero-lxc / zotero-selfhost** | Single reverse-proxy entry (lxc). Attachment proxy as a first-class service. Patch official clients instead of rebuilding | Running MySQL + MinIO + ES + Redis + PHP + patched `omni.ja`. Default passwords. Notes broken in one fork. Client must be patched | Self-hosting Zotero is a multi-year ops project. wePaper should not try |
| **WebDAV file layout (official + on-prem)** | Personal-library file sync without Zotero Storage. Zip+`.prop` per attachment key | Groups cannot use WebDAV. Proxy that extracts into the WebDAV tree can confuse the next desktop sync | Treat WebDAV as a read-only input. Cache extracted PDFs **outside** the sync folder if possible |
| **paperless-ngx** | Consume folder + Celery queue; originals vs archive; checksums; `Content-Disposition` RFC 5987; `pdfjs-dist` viewer components (`PDFViewer` / `PDFFindController`); health; dirty-form tracking | OCR, correspondents, nested tags, Angular+Django+Redis+Postgres. README: never run on an untrusted host. Auth is assumed | Borrow the **pipeline**, not the product. Metadata in DB, bytes on disk, viewer talks to your origin |
| **Papermerge** | Auth lives **upstream** of the API. PDFs offloaded to S3/CDN so the app stays on JSON. Workers for slow jobs | Scanned-archive DMS, page surgery, GoBD. Core is seeking maintainers. Ember/legacy JS split | Do not serve multi-megabyte PDFs from the same process that serves the list API |
| **Karakeep (Hoarder)** | Card density, lists, Meilisearch, SSO, Docker three-container split, demo is read-only | Next.js + tRPC + Puppeteer + AI tagging. AGPL. Bookmark product, not papers | Public demo = read-only. Search is a later luxury |
| **linkding** | Minimal Django app, readable list typography, tags, guest/share, SSO via proxy, Docker | Bookmarks, not PDFs. Still account-centric | Default UI for wePaper should look more like this list than like a social feed |
| **Kintara** | Closest **product shape**: watch folder → index → grid → reader. **HTTP Range** called out. Health checks DB. SQLite not on NFS. One origin for API+files | GitHub OAuth required. Optional AI. One library root. No pinch-zoom. Not Zotero | Range requests + local SQLite + folder watch is the boring architecture that works |
| **ZotLit** | Read-only SQLite access via WAL snapshot (`cp -c` reflink / copy, fingerprint before/after). Never writes Zotero | Desktop Obsidian plugin. Breaks on installer/Zotero updates. Not a public website | If wePaper ever reads `zotero.sqlite`, snapshot it. Prefer the Web API instead |
| **Better BibTeX** | Stable citekeys, auto-export on change, pull-export HTTP | Zotero plugin, not a site. Zotero 8 native keys changed the model | Use Zotero item `key` (8 chars) as the public ID. Citekeys are optional slugs |
| **Polar Bookshelf** | Annotations never mutate the original file. JSON schema. PDF.js canvas + text layer | Project pivoted to cloud and effectively died. Electron, Anki, PHZ | Local-first then a forced cloud migration destroys trust. Keep files on disk you control |
| **JabRef** | Desktop BibTeX manager; remote operation for the connector | No production web library. Chrome extension is dead (MV3) | A bibliography tool without a web PDF path is the wrong shape |
| **arXiv Vanity** | HTML typography for papers; Engrafo as a separate converter | LaTeX→HTML, not a personal library. Needs Docker + scrape | Do not convert PDFs to HTML for v1. Serve the PDF |
| **Papers with Code–style cards** | Title / authors / year / venue / one action | Discovery + social + code links. Cards waste vertical space for a personal library | Use a **dense row**, not a PwC card grid |
| **Hugo PaperMod** | Clean typography if wePaper ever needs a static about page | **Name collision.** It is a blog theme, not a paper library | Ignore for the product |
| **Atticus** | — | Author book formatter (print/ebook), not a research library | Ignore |
| **Dokiel** | Structured scholarly publishing (Scenari) | Authoring suite, not a Zotero reader | Ignore |

---

## Deep dives

### 1. Official Zotero Web Library

**Repo:** https://github.com/zotero/web-library  
**Live:** https://www.zotero.org/mylibrary  
**License:** AGPL-3.0  
**Stack (from `package.json` v1.8.1):** React 19, Redux Toolkit, `zotero-api-client` 0.51.0, `react-window` + infinite loader, Rollup, Playwright.

The README states the facts that matter: it is a SPA that talks to the Zotero API over **CORS**, and private libraries need `userId` + `apiKey` from https://www.zotero.org/settings/security#applications. The default `src/html/index.html` config shows a **public group** (`g729`, “All Things Zotero”) with `includeMyLibrary: true` and **no apiKey** — that is the official “read-only public library” mode.

Source tree:

```
src/html/          index.html, embedded.html  (DOM config nodes)
src/js/actions/    API + attachment + reader actions
src/js/component/  item-list, item-details, reader.jsx, …
src/js/reducers/
src/js/routes.js   canonical URL grammar
modules/           git submodules: reader, pdf-worker, note-editor
```

`routes.js` encodes a real product URL, not a hash router:

`/{user|groups}/{id}/collections/{key}/items/{item}/attachment/{id}/reader/{pageNumber|annotationID}/…`

That is the URL shape wePaper should copy: **stable item key in the path, reader as a view, optional page fragment**.

#### How the official reader loads a PDF

`src/js/component/reader.jsx` is the implementation, not a blog summary.

1. Confirm the item is an `attachment` with a supported `contentType` **and** an `enclosure` link. Public user libraries do not get `enclosure`; the code redirects to item-details and comments why (lines 506–512 in the file read on 2026-09-06).
2. `tryGetAttachmentURL` fetches a temporary file URL.
3. The binary is loaded with `const data = await (await fetch(url)).arrayBuffer()`.
4. The whole buffer is cloned into a PDF worker to import existing PDF annotations.
5. The Zotero reader is then created inside an iframe (`pdfReaderURL` from config).

This is a **full-file download into JS memory**. It is the opposite of PDF.js range requests. It exists because Zotero’s reader also imports/exports annotations and can compute xdelta diffs (`diff.worker.js`) for partial re-upload. wePaper does not need any of that.

Downloads that should be “Save as…” fail when the file is on `files.zotero.net`: the HTML `download` attribute is same-origin only. Issue [#591](https://github.com/zotero/web-library/issues/591) documents this. The team’s workaround is fetch → blob → `file-saver`. Issue [#589](https://github.com/zotero/web-library/issues/589) is still open: download from inside the reader.

Forum thread [zotero api item/file CORS](https://forums.zotero.org/discussion/128360/zotero-api-item-file-cors-error) (2025-12-02): `/items/{key}/file` **302s to S3** (`zoterofilestorage.s3.us-east-1.amazonaws.com`) which does **not** send `Access-Control-Allow-Origin`. Dan Stillman, on a related “file not found” thread ([#114153](https://forums.zotero.org/discussion/114153/file-not-found-when-downloading-file-through-the-api)): *“you can't redirect an external user to an API URL in a private library… You can download a file to your servers (using `/file` rather than `/file/view`) and serve the file yourself, but we don't support public file sharing.”*

That sentence is the wePaper file architecture.

**Pain that shows up in issues/forums**

- Work laptops intercept `api.zotero.org` CORS preflights → grey logo screen ([forum 127447](https://forums.zotero.org/discussion/127447/web-library-not-working)).
- Reader download chrome is unfinished (#589).
- Snapshots/PDFs lack `Content-Disposition: attachment` (#591).

**Verdict:** study the list density and URL grammar. Do not embed or subtree this app. Putting an API key in `zotero-web-library-config` (as on-prem does) is fine for a locked NAS and unacceptable for a public site.

---

### 2. On-prem Zotero WebUI (closest cousin)

**Repo:** https://github.com/joonsoome/on-prem-zotero-webui  
**Forum announcement:** https://forums.zotero.org/discussion/128303/on-prem-zotero-webui-self-hosted-pdf-viewer-for-zotero-webdav-libraries  
**License:** AGPLv3 (because it vendors web-library)  
**Status:** README says PoC / v0.1.14, “not production-ready.”

Architecture from `docs/development-overview.md` and `app/main.py`:

```
Zotero Desktop  --metadata-->  zotero.org
      | WebDAV attachments as <KEY>.zip + <KEY>.prop
      v
NAS / WebDAV root
      |  read-only
      v
FastAPI /pdf/{key}  -->  unzip first PDF into <KEY>/  -->  StreamingResponse
      ^
Self-hosted web-library overlay  ("Open PDF" -> PDF_PROXY_BASE_URL)
```

What the proxy actually does (source, not the sample snippet in the docs):

- Rejects keys that are not `[A-Za-z0-9]+`.
- Optional HTTP Basic via `PDF_PROXY_BASIC_AUTH_*` (`secrets.compare_digest`).
- Cache hit: first `*.pdf` in `/data/zotero/{key}/`.
- Cache miss: open `{key}.zip`, pick the first PDF member (sorted), write it, stream 64 KiB chunks.
- `Content-Type: application/pdf`. **No `Accept-Ranges`, no `Content-Length`, no `ETag`, no `Content-Disposition`.**

**Conflict:** the README roadmap still says “optional pdf.js viewer” and “no authentication yet.” `main.py` already has Basic auth, and the vendored web-library already embeds Zotero’s reader. The docs are behind the code. Treat the **code** as truth.

**Conflict:** `docs/development-overview.md` shows a planned tree `app/web-library-upstream/` + `web-library-overlay/`. The live tree is `app/main.py` plus Dockerfiles and a `WEB_LIBRARY_UPSTREAM_COMMIT` pin. Overlay docs exist (`docs/web-library-overlay.md`); the subtree may not be in the shallow listing depending on clone depth.

Deployment is the mature part: GHCR images, Portainer recipes, `ZOTERO_ROOT_HOST_PATH`, `WEB_LIBRARY_ALLOW_UPLOADS=false`, `PDF_PROXY_BASE_URL` must be a **browser-reachable** host (not `localhost` when you open the UI via a NAS IP).

Issue [#2](https://github.com/joonsoome/on-prem-zotero-webui/issues/2) is the predictable failure: `/health` on 8280 works, 8281 “refused,” but `curl` of 8281 returns HTML with **`apiKey` in the page**. The user’s browser and the container network disagree; the API key is already leaked to anyone who can hit the port.

**Verdict:** copy the *split* (Zotero remains SoT; wePaper owns a PDF cache). Do not copy the UI, the AGPL subtree, or “API key in HTML.” Extracted PDFs should live in wePaper’s cache directory, not as siblings of the WebDAV zips — on-prem writes `7A7BDC9P/` next to `7A7BDC9P.zip`. That is convenient and slightly dangerous if Zotero ever walks the directory.

---

### 3. Official Zotero related projects

#### Dataserver

https://github.com/zotero/dataserver — PHP/Hack, `controllers/`, `model/`, `htdocs/`, CloudFormation. **No README.** ilyasoloma’s self-host README is the honest description: actively maintained, lots of legacy, MySQL + memcached + S3/WebDAV + (in self-host packs) localstack/MinIO. This is Zotero.org’s brain. wePaper should call `https://api.zotero.org`, not reimplement it.

#### Stream server

https://github.com/zotero/stream-server — WebSocket push for library versions. Official clients and web-library use it for near-live updates. wePaper’s daemon can poll `since=` every N minutes instead. Stream is an optimization, not a requirement for a personal public library.

#### Translation server

https://github.com/zotero/translation-server — Node, Docker `zotero/translation-server:1969`, `/web` `/search` `/export` `/import`. This is how connectors turn a URL into Zotero JSON. wePaper does not ingest from the web; skip it.

#### Reader

https://github.com/zotero/reader — “PDF/EPUB/HTML reader and annotator.” Builds `dev` / `web` / `zotero` via a **PDF.js submodule** (`pdfjs/build` copies `pdf.mjs`, worker, cmaps, wasm, `viewer.html`). React 18 UI on top. Issue [zotero/zotero#2183](https://github.com/zotero/zotero/issues/2183) is the long-running “rebase our pdf.js fork” pain: annotation overlay timing, cropped pages, iframe resize rerenders. That pain is why wePaper should stay on **upstream** `pdfjs-dist`.

#### File API (official)

https://www.zotero.org/support/dev/web_api/v3/file_upload

- Create attachment item first (`md5`/`mtime` null).
- `POST /items/{key}/file` with `If-None-Match: *` or `If-Match: <md5>` → either `{exists:1}` or S3 `prefix`+file+`suffix`.
- Download existing: `GET /users/{id}/items/{key}/file`. Compare `ETag` to item `md5`.
- WebDAV personal libraries: `md5`/`mtime` may be edited directly; Zotero Storage must not.
- Groups **cannot** use WebDAV ([sync doc](https://www.zotero.org/support/sync)).

#### Sync model (official)

https://www.zotero.org/support/dev/web_api/v3/syncing

Store per library: version integer. Store per object: version + `synced` flag. Pull with `?since={n}&format=versions`, then fetch changed keys. Conditional GET: `If-Modified-Since-Version` → 304. Writes need `If-Unmodified-Since-Version` or JSON `version` → 412 on conflict.

**wePaper is read-only toward Zotero.** The daemon should:

1. Remember `last_library_version`.
2. `GET /users/{id}/collections/{key}/items?since={v}&includeTrashed=1`.
3. Upsert local rows; download `/file` for new/changed attachments (md5 mismatch).
4. Persist the new `Last-Modified-Version`.
5. Be restart-safe: if download fails, keep the old PDF and retry that key.

Do **not** mix this with the Local API. https://www.zotero.org/support/dev/web_api/v3/local_api : in Zotero 10+, local versions are per-instance and “have no relation to Web API versions.” pyzotero’s `local=True` is for a desktop plugin, not a public server.

#### Sync tools

| Tool | Role |
| --- | --- |
| [zotero-api-client](https://github.com/tnajdek/zotero-api-client) | Official web-library dependency. Chainable, **no version management, no cache**. You pass version headers yourself — correct for a daemon |
| [pyzotero](https://github.com/urschrei/pyzotero) | Python equivalent. `Zotero(id, type, key)`. Also `local=True`. Good if the daemon is Python |
| Better BibTeX pull-export | HTTP export of `.bib` from a running desktop. Fragile for a server |
| ZotLit sqlite snapshot | Read `zotero.sqlite` + WAL without locking. Desktop-only, high break risk |

**Recommendation:** Web API v3 + one API key with **read-only** library access, stored only on the server.

---

### 4. Full self-hosted Zotero platforms

These exist because institutions want Zotero without zotero.org. They are the **anti-pattern** for wePaper.

**ZotPrime** (https://github.com/uniuuu/zotprime, also FiligranHQ / SamuelHassine forks): docker-compose of dataserver + MinIO + phpMyAdmin + stream. Default **admin/admin**, **zotero/zoterodocker**. Client must be **rebuilt** with `HOST_DS` / `HOST_ST`. README clone URL even disagrees with itself (`zotero-prime` vs `zotprime`).

**zotero-lxc** (https://github.com/fauky/zotero-lxc): one Ubuntu LXC, Apache single vhost for `/`, `/api/`, `/fs/`, `/ws/`, `/minio/`. Domain and HTTP vs HTTPS are **hard-coded into Zotero sources at install time**. Desktop clients are patched with generated `patch_zotero_desktop.sh` / `.ps1` (backup `omni.ja`). Translation-server is installed but dormant because they do not rebuild the connector.

**zotero-selfhost** (https://github.com/ilyasoloma/zotero-selfhost): same family. Author states documentation of the official architecture is insufficient. Notes are **broken** (TODO: “client will be rickrolled”). Web library file access is “a crutch”; real files go through the desktop client. Elasticsearch needs `vm.max_map_count=262144`. Default admin/admin again.

**Lesson:** every serious self-host write-up ends at “patch the official client’s `config.js`.” wePaper must not require a patched Zotero. Users keep vanilla desktop + official sync (or official + WebDAV). wePaper only **reads**.

---

### 5. Paperless-ngx (borrow architecture, do not clone)

**Repo:** https://github.com/paperless-ngx/paperless-ngx  
**Docs:** https://docs.paperless-ngx.com/  
**Stack:** Django + DRF + Celery + Redis + Postgres/SQLite + Angular SPA + Tantivy + OCRmyPDF.

README warning, quoted because it is the security model:

> Paperless-ngx should never be run on an untrusted host because information is stored in clear text without encryption.

That is the opposite of wePaper’s “public HTTPS.” Paperless assumes a trusted LAN and logged-in users.

What to steal:

1. **Consume directory + task queue.** Usage doc: the consumer watches a folder and **does not** consume inline; it notifies Celery. wePaper’s analog is “Zotero poller enqueues item upsert + PDF fetch.”
2. **Originals never overwritten.** Archive PDF/A sits beside the original. wePaper: store the Zotero bytes as-is; do not OCR, do not rewrite.
3. **Checksums.** Document model stores SHA-256 for original and archive (DeepWiki / models; confirmed by architecture write-ups pointing at `src/documents/models.py`). wePaper: persist Zotero `md5` and refuse to replace a good file with a shorter download.
4. **File headers.** `serve_file` in `src/documents/views.py` (snapshot read 2026-09-06) sets  
   `Content-Disposition: {inline|attachment}; filename="ascii"; filename*=utf-8''{quoted}`  
   ([RFC 5987](https://datatracker.ietf.org/doc/html/rfc5987#section-4.2)). Firefox needs the ASCII fallback; Chromium chokes on commas in `filename`.
5. **Viewer.** `PngxPdfViewerComponent` imports `pdfjs-dist/legacy/build/pdf.mjs` plus `pdf_viewer.mjs` (`PDFViewer`, `PDFSinglePageViewer`, `PDFFindController`, `PDFLinkService`, `EventBus`). Worker from same-origin `assets/js/pdf.worker.min.mjs`. `getDocument({ url, withCredentials: true })`. ResizeObserver for scale. Issue [#13404](https://github.com/paperless-ngx/paperless-ngx/issues/13404) is a two-way `[(page)]` binding loop — a warning against over-binding viewer state to the framework.

**Conflict on how files are streamed:** the `views.py` blob fetched on 2026-09-06 still returns `HttpResponse(file_handle, content_type=…)`. PR [#12638](https://github.com/paperless-ngx/paperless-ngx/pull/12638) (merged 2026-04, commit `a2dbe17`) switches document serving to `FileResponse`. Both are Django in-process streaming. **Neither implements HTTP Range.** Production Paperless installs put nginx in front; nginx is what actually byte-serves. Django ticket #22479 is still the historical “we will not add Range to FileResponse; use a web server.”

**Verdict:** consume/queue/checksum/disposition/pdfjs-dist components. Not the DMS domain model, not Angular, not “must log in to see a PDF.”

---

### 6. Papermerge

**Repo:** https://github.com/papermerge/papermerge-core  
**Architecture:** https://docs.papermerge.io/3.5/developer-manual/architecture/

Deliberately non-monolithic: REST API has **no UI and no authentication**. Identity is `Remote-User` or a JWT minted by a **separate** auth-server. Workers (path template, S3, OCR) talk Redis, not HTTP.

The S3 section is the PDF lesson: serving a 2–3 MB PDF from the app pod occupies the worker for seconds; 1000 users makes the JSON API stall. Demo uses S3 + CloudFront. App stays stateless.

README (2026): open-source core is **seeking maintainers**; author moved to Papermerge Cloud.

**Verdict:** auth at the reverse proxy; PDFs from object storage or nginx, not from the API process. Do not adopt the DMS.

---

### 7. Self-hosted libraries with a real reader

#### Kintara

https://github.com/pinkpixel-dev/kintara

This is the cleanest “folder of PDFs → website” product in the set.

- One Rust/Axum process hosts API + built React PWA.
- Watches `/library`; SQLite + thumbnails in `/data` (**must be local disk; README: SQLite corrupts on SMB/NFS**).
- “Streams PDFs with HTTP Range support, so large files do not need one full download.”
- Reverse proxy **must forward `Range`**.
- Health: `/api/health` runs a DB query and returns indexed count.
- Auth: GitHub OAuth; first user is owner; later users invited. Private by default.
- Known limits: no pinch-zoom, one root, no OPDS.

wePaper should copy Range + health + “SQLite on local disk” and ignore OAuth-for-readers. Public read means the PDF URL is either world-readable or gated by a capability token, not by GitHub.

#### Karakeep (formerly Hoarder)

https://github.com/karakeep-app/karakeep — Next.js, Drizzle, NextAuth, tRPC, Puppeteer, Meilisearch. AGPL. Bookmark-everything + optional LLM tags. Demo https://try.karakeep.app is **read-only**. Three containers (web, chrome, meilisearch). Too much machinery for a paper list. Steal: read-only public demo, list/card density, SSO *for the owner*.

#### linkding

https://github.com/sissbruecker/linkding — Django, Docker, tags, Netscape import, PWA, OIDC or auth-proxy. The screenshot language is “clean UI optimized for readability.” That is the list wePaper wants: title as the row, metadata in muted secondary text, no hero images. No PDF viewer.

---

### 8. Zotero-adjacent tools (concepts only)

#### ZotLit

https://github.com/aidenlx/zotlit (also listed as PKM-er/obsidian-zotlit)

v2 README: literature notes, citations, annotation sidebar. Companion plugin for live push **on localhost only**. Database access is **read-only**. `read-source.ts` comments (commit `dc98c6f5`): Zotero holds `zotero.sqlite` in WAL with exclusive lock; ZotLit clones DB+WAL into a temp dir, fingerprints before and after, retries if Zotero wrote mid-copy, opens the clone `mode=ro`. macOS uses `cp -c` reflinks.

**Conflict:** the older plugin-store README and the v2 README disagree on install path and breaking changes. v2 says notes/templates do not carry over. For wePaper this only matters as a warning: sqlite readers rot on Zotero upgrades. Prefer the Web API.

#### Better BibTeX

https://github.com/retorquere/zotero-better-bibtex  
https://retorque.re/zotero-better-bibtex/

Citekey formulas, auto-export, pull-export webserver. **Zotero 8** added a native citation-key field; BBT 8 migrated pinned keys and dropped Zotero 7. Integrations that read BBT’s private DB must now read Zotero’s.

wePaper public IDs should be the **Zotero item key** (`[A-Za-z0-9]{8}`), which web-library already uses in routes. Optional BBT citekey as a vanity slug, never as the only key.

#### Polar Bookshelf

Original: Electron + PDF.js, annotations as JSON, originals untouched, `~/.polar`. History (https://productimpossible.com/articles/polar-bookshelf-history/): local-first 2018, then Polar 2.0 **cloud-only Firebase**, no stay-local path. The product is gone. The durable lesson is social, not technical: do not bait-and-switch storage. wePaper files stay on the operator’s disk.

#### JabRef

Desktop Java BibTeX manager. Browser extension (https://github.com/JabRef/JabRef-Browser-Extension) is **removed from Chrome** (Manifest V3, issue #616 / jabref#13186). There is no JabRef web library to copy. “Remote operation” is a localhost socket, same class as Zotero’s connector — useless for a public site.

---

### 9. Named projects that are not paper libraries

| Name in the brief | What it actually is |
| --- | --- |
| **PaperMod** | [adityatelange/hugo-PaperMod](https://github.com/adityatelange/hugo-PaperMod) — Hugo blog theme. Typography only. |
| **Atticus** | Commercial book formatter (print/ebook). Not a research PDF library. |
| **Dokiel** | Scenari-based scholarly *authoring*. Publishing, not reading a Zotero collection. |
| **arXiv Vanity** | Django + Engrafo Docker. Renders arXiv TeX as HTML. Complementary reading mode, not a personal library. Repo: https://github.com/arxiv-vanity/arxiv-vanity |
| **Papers with Code cards** | Discovery UI: abstract, code, metrics. Wrong information density for “my 400 PDFs.” |

---

## What a professional wePaper should look like

### List density

Zotero desktop and web-library use a **dense table**: title, creators, date, plus a thin icon for “has PDF.” linkding uses the same idea for bookmarks. Paperless’s list is denser than a card grid and still supports bulk actions wePaper does not need.

Do **not** use Papers-with-Code cards (cover + abstract + badges). A personal library of hundreds of papers becomes unscanable. One row per paper:

- Title (primary, wrapping once).
- Creators · year · publication (secondary, single line, ellipsis).
- Tags as 1–3 small chips, not a rainbow.
- A PDF glyph if the file is present; a muted “metadata only” if sync has no file yet.

Virtualize the list (`react-window` is what web-library uses; a server-rendered page with ordinary pagination is simpler and good enough under ~2k items).

### Typography

linkding and Paperless succeed because they look like **reading software**, not a dashboard. Use a real text font for titles (the site’s UI font is fine; do not use a display / AI-startup sans). Keep measure ~60–80 characters on the list. In the reader, the PDF is the typography — do not put a fat marketing header above it.

arXiv Vanity’s HTML papers are beautiful and out of scope. If a paper has no PDF, show metadata + DOI/URL, not a fake reader.

### Viewer chrome

Professional chrome, from PDF.js viewer + Paperless + Zotero reader, minus annotations:

- Page number / page count.
- Zoom (page-width default, like Paperless `PdfZoomScale.PageWidth`).
- Find (`PDFFindController`).
- Download (same-origin `Content-Disposition: attachment` so it actually downloads — web-library #591).
- Open in new tab / previous-next paper in the collection.
- Optional outline if PDF.js exposes one.

No highlighter toolbar. No comment sidebar. No “chat with PDF.” Zotero already has a reader for that. wePaper is the **public reading copy**.

Do not load the PDF as an `ArrayBuffer` the way `reader.jsx` does. Pass a **same-origin URL** into `getDocument({ url })` so PDF.js can Range-request. That is how Paperless and Kintara do it; it is how Firefox’s built-in viewer works.

### Sync observability

Paperless shows consume/task state. Kintara’s health returns indexed count. Zotero desktop shows a sync error icon. wePaper needs a **private** status page (or `/health` plus an authenticated `/admin/sync`):

| Field | Why |
| --- | --- |
| Last successful library version | Official sync cursor |
| Last attempt time / duration | Stuck detector |
| Items in collection vs items stored | Drift |
| PDFs present / missing / md5 mismatch | File sync, not just metadata |
| Last error (HTTP status, item key) | Restart-safe retry |
| Sync in progress lock | One daemon, no overlapping runs |

Public visitors should see none of this except maybe “Updated 2 hours ago” in the footer.

### Identity

| Surface | Policy |
| --- | --- |
| `GET /` list, `GET /p/{key}`, `GET /pdf/{key}` | Public. No cookies required |
| Sync daemon, rebuild, delete, webhook | Localhost or shared-secret header. Never in JS |
| Zotero API key | Server env only. Read permission only |

Papermerge’s “API trusts `Remote-User`” is the right *shape* if a reverse proxy already authenticates the operator. It is the wrong shape for the public PDF URL.

on-prem’s Basic auth on `/pdf/{key}` is correct for a family NAS and wrong for a public library. If a PDF must stay off the open web, do not put it in wePaper.

Kintara/Karakeep/Paperless all default to **login to read**. wePaper is the other product: **login to write**. That is closer to a public Zotero group library, except the files are served from our origin so the reader works (official public user libraries omit `enclosure`).

### PDF serving

Serious products converge on the same HTTP:

| Header | Value | Who does this |
| --- | --- | --- |
| `Content-Type` | `application/pdf` | everyone |
| `Content-Disposition` | `inline; filename="…"; filename*=utf-8''…` for the viewer; `attachment` for download | Paperless `serve_file`; missing on Zotero Storage (issue #591) |
| `Accept-Ranges` | `bytes` | Kintara; nginx; S3. **Not** on-prem FastAPI stream; **not** Django `HttpResponse` |
| `Content-Length` | exact size | required for PDF.js Range ([discussion 18524](https://github.com/mozilla/pdf.js/discussions/18524)) |
| `Content-Encoding` | `identity` or absent | gzip breaks Range; PDF.js checks this |
| `ETag` / `Cache-Control` | `ETag` = md5 or sha256; `Cache-Control: public, max-age=86400, immutable` if key includes hash | Zotero file `ETag` is md5; wePaper can put md5 in the URL |
| `206 Partial Content` | on `Range: bytes=` | PDF.js first request + 64 KiB chunks (`rangeChunkSize` default 65536). File must be larger than `2 * rangeChunkSize` or Range is skipped |

Implementation options, in order of boredom:

1. **nginx `alias` / `try_files`** on a directory of `{zoteroKey}.pdf` with `add_header Accept-Ranges bytes`. Best.
2. **S3/MinIO + CloudFront** (Papermerge). Good if already on object storage.
3. **Application `sendfile` / `FileResponse` + a Range implementation.** Only if there is no nginx. on-prem’s chunk iterator is not enough.

Never proxy the public reader through `api.zotero.org/…/file` (S3 CORS). The daemon downloads once; wePaper serves forever.

---

## Recommendations

### PDF viewer library

**Use `pdfjs-dist` (Mozilla) + the official viewer components (`pdf_viewer.mjs`), not `react-pdf`, not a raw generic `viewer.html`, not `zotero/reader`.**

| Option | Use in wePaper? | Why |
| --- | --- | --- |
| **`pdfjs-dist` + `PDFViewer` / `EventBus` / `PDFFindController`** | **Yes** | This is what Paperless ships. Same display layer Firefox uses. `getDocument({ url })` enables Range. Worker + cmaps + wasm + icc must be same-origin (Paperless copies them to `assets/`) |
| Mozilla generic `web/viewer.html` | Only as a starting skin | [Getting Started](https://mozilla.github.io/pdf.js/getting_started/) and the [Setup wiki](https://github.com/mozilla/pdf.js/wiki/Setup-pdf.js-in-a-website) ask you to **re-skin**, not iframe the unmodified viewer |
| **react-pdf** (`wojtekmaj`) | No for v1 | Thin `Document`/`Page` wrapper. You rebuild find/zoom/outline. Worker must be set in the **same module** (README warning). Next.js SSR pitfalls. Page-at-a-time API fights continuous scroll |
| Vanilla `getDocument` + canvas only | Too low | You will reimplement text layer and find badly |
| **zotero/reader** | No | AGPL annotator, full-file buffer, EPUB/HTML, custom pdf.js fork. Issue #2183 is the maintenance cost |

Pin `pdfjs-dist` to a released version. Serve `pdf.worker.min.mjs` from the same origin. Do not use a CDN worker (version skew). Pass the PDF **URL**, not a fetched `ArrayBuffer`, unless you have a reason (wePaper does not).

### Frontend stack

**Keep it simple. No strong reason for Next.js, Angular, or a Redux clone of web-library.**

| Stack | Verdict |
| --- | --- |
| **Small server (Go, Python, or Node) + server-rendered list + a few pages of vanilla/Vite JS for the reader** | Best default. Matches linkding’s “minimal and fast.” List is HTML. Reader is one SPA-ish page |
| Vite + React, no Redux | Acceptable if the implementer is faster in React. Do not pull `react-window` until the list is slow |
| Next.js (Karakeep) | Unnecessary SSR/auth surface for a public static-ish library |
| Angular (Paperless) | Fine for them; a new project should not start there |
| Fork web-library | AGPL, API-key-in-page, full editor. Hard no |

The daemon can be the same language as the server. pyzotero is the most documented Zotero client if the server is Python; `zotero-api-client` if Node. Persist `library_version`, item JSON (or a normalized subset), attachment md5, and local path.

### How to serve PDFs (normative for wePaper)

1. Daemon: `GET https://api.zotero.org/users/{id}/items/{key}/file` with the API key. Follow redirects server-side. Verify `ETag`/`md5`. Write `data/pdf/{key}.pdf`.
2. Public: `GET /pdf/{key}` or `/pdf/{key}-{md5}.pdf`.
3. Headers: `Content-Type: application/pdf`, `Content-Disposition: inline; filename="…"; filename*=utf-8''…`, `Accept-Ranges: bytes`, `Content-Length`, `ETag`, `Cache-Control: public, max-age=604800`.
4. Download button: same path with `?dl=1` → `Content-Disposition: attachment`.
5. Reader: `getDocument({ url: '/pdf/{key}', disableRange: false, disableStream: false })`.
6. Put nginx (or Caddy `file_server`) in front if the app language does not do Range correctly. Forward `Range`.
7. Do not gzip PDFs.

---

## Conflicts log

| Topic | Source A | Source B | Resolution |
| --- | --- | --- | --- |
| on-prem auth | README: “no auth yet” | `main.py`: optional Basic | Code wins |
| on-prem pdf.js | README roadmap: “optional pdf.js” | Vendored web-library already has Zotero reader | They already have a reader; the roadmap is stale |
| Paperless file body | `views.py` snapshot: `HttpResponse` | PR #12638: `FileResponse` | Newer code uses FileResponse; **still no Range** |
| PDF.js `disableAutoFetch` | Old issue #10278: set both `disableAutoFetch` and `disableStream` | Nutrient write-up: `disableAutoFetch` only works with streaming on | For wePaper leave both **false** and fix the **server** headers |
| Local vs Web versions | Older Local API returned sync versions | Zotero 10+ local versions are unrelated | Daemon uses **Web API only** |
| BBT citekeys | Years of `extra` field keys | Zotero 8 native field; BBT migrated | Do not depend on BBT storage |
| ZotPrime clone URL | README says `SamuelHassine/zotero-prime` in one block | Repo is `uniuuu/zotprime` / forks | Packaging is fragmented; do not depend on one compose file |
| Polar | 2018 README: local-first Apache-2 | 2.0: cloud Firebase, project dead | Do not treat Polar as a living product |
| PaperMod | Brief listed it with paper UIs | It is a Hugo theme | Name collision only |
| Public Zotero files | Web library can show public groups | Reader needs `enclosure`; public user libraries omit it; S3 has no CORS | wePaper must host files |

---

## Bottom line for architecture (not an implementation)

wePaper should look like **linkding’s list + Paperless’s pdfjs-dist viewer + Kintara’s Range-served files + Zotero Web API incremental sync**, with **Papermerge’s rule** that the API process is not the PDF CDN.

It should not look like web-library, ZotPrime, Paperless-the-DMS, Karakeep, or a Papers-with-Code clone.

The official sentence to design around remains Stillman’s: download `/file` to **your** servers and serve the file yourself. Zotero does not offer public file sharing.

---

## Source index

- https://github.com/zotero/web-library
- https://github.com/zotero/web-library/blob/master/src/js/component/reader.jsx
- https://github.com/zotero/web-library/issues/591
- https://github.com/zotero/web-library/issues/589
- https://github.com/joonsoome/on-prem-zotero-webui
- https://github.com/joonsoome/on-prem-zotero-webui/blob/main/app/main.py
- https://github.com/joonsoome/on-prem-zotero-webui/blob/main/docs/development-overview.md
- https://forums.zotero.org/discussion/128303/on-prem-zotero-webui-self-hosted-pdf-viewer-for-zotero-webdav-libraries
- https://github.com/zotero/dataserver
- https://github.com/zotero/reader
- https://github.com/zotero/translation-server
- https://www.zotero.org/support/dev/web_api/v3/basics
- https://www.zotero.org/support/dev/web_api/v3/syncing
- https://www.zotero.org/support/dev/web_api/v3/file_upload
- https://www.zotero.org/support/dev/web_api/v3/local_api
- https://www.zotero.org/support/sync
- https://forums.zotero.org/discussion/114153/file-not-found-when-downloading-file-through-the-api
- https://forums.zotero.org/discussion/128360/zotero-api-item-file-cors-error
- https://github.com/tnajdek/zotero-api-client
- https://github.com/urschrei/pyzotero
- https://github.com/fauky/zotero-lxc
- https://github.com/uniuuu/zotprime
- https://github.com/ilyasoloma/zotero-selfhost
- https://github.com/paperless-ngx/paperless-ngx
- https://docs.paperless-ngx.com/usage/
- https://github.com/paperless-ngx/paperless-ngx/blob/main/src/documents/views.py
- https://github.com/paperless-ngx/paperless-ngx/pull/12638
- https://github.com/papermerge/papermerge-core
- https://docs.papermerge.io/3.5/developer-manual/architecture/
- https://github.com/karakeep-app/karakeep
- https://github.com/sissbruecker/linkding
- https://github.com/pinkpixel-dev/kintara
- https://github.com/aidenlx/zotlit
- https://github.com/retorquere/zotero-better-bibtex
- https://github.com/mozilla/pdf.js
- https://mozilla.github.io/pdf.js/getting_started/
- https://github.com/mozilla/pdf.js/wiki/Setup-pdf.js-in-a-website
- https://github.com/mozilla/pdf.js/discussions/18524
- https://github.com/mozilla/pdf.js/issues/10278
- https://github.com/wojtekmaj/react-pdf
- https://github.com/arxiv-vanity/arxiv-vanity
- https://productimpossible.com/articles/polar-bookshelf-history/
