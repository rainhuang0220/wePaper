# PDF Reader Architecture Audit (wePaper V1 → V1.1)

**Date:** 2026-09-07 (V1 audit). V1.1 shipped the same transport with a continuous reader and canonical `/paper/{id}/pdf`.

**Scope:** V1 reader (`web/src/PdfReader.tsx`), PDF delivery (`src/wepaper/server.py`), live endpoints.  
**Constraint for V1.1:** Keep the **real PDF** as source of truth; default to **continuous vertical scroll**; **lazy page render**; **do not rasterize the document body to PNG**.

### V1.1 live transport (2026-09-07)

| Item | Value |
|------|--------|
| Canonical PDF | `https://wepaper.plainlist.space/paper/{itemKey}/pdf` |
| API alias | `/api/v1/papers/{itemKey}/pdf` |
| Content-Type | `application/pdf` |
| Magic | `%PDF-1.7` |
| Range | `206` + `accept-ranges: bytes` |

---

## Executive summary

| # | Question | Answer |
|---|----------|--------|
| 1 | Raw PDF bytes or server-rendered images? | **Raw PDF bytes** — no server-side rasterization |
| 2 | Current PDF URL(s)? | `{BASE_URL}api/v1/papers/{itemKey}/pdf` |
| 3 | Blobs real `.pdf` on disk? | **Yes** — content-addressed `{sha256}.pdf` under `blobs/` |
| 4 | `Content-Type: application/pdf`? | **Yes** (live + code) |
| 5 | HTTP Range support? | **Yes** — loopback and public (206 Partial Content) |
| 6 | PDF.js page-by-page to canvas? | **Yes** — one canvas, re-rendered on page change |
| 7 | Text layer? | **Yes** — hand-built transparent spans (not PDF.js `TextLayer` class) |
| 8 | Why single-page only? | **UI/state limit** — not a backend or PDF.js limitation |
| 9 | Reuse original PDF bytes for continuous scroll? | **Yes** — same URL + `PDFDocumentProxy`; add multi-page DOM |
| 10 | Recommended V1.1 approach | **Evolve in-house `pdfjs-dist` reader** (or adopt `@anaralabs/lector` as accelerator) |

**V1.1 recommendation:** Extend the existing `pdfjs-dist` + React pattern into a **vertically stacked, IntersectionObserver-lazy multi-page viewer**, keeping the current `/api/v1/papers/{itemKey}/pdf` endpoint unchanged. Do **not** iframe Mozilla's generic viewer or a native `<object>`/`<iframe>` PDF (blocked by CSP and `X-Frame-Options`). Consider `@anaralabs/lector` if we want virtualization/scroll perf without reimplementing it.

---

## 1. Does the browser get raw PDF bytes or server-rendered images?

**Answer: Raw PDF bytes.**

### Backend

`get_pdf` returns a Starlette `FileResponse` of the on-disk blob with `media_type="application/pdf"`. There is no image pipeline, PNG endpoint, or page-rendering service anywhere in the Python codebase.

```165:193:src/wepaper/server.py
    @app.get("/api/v1/papers/{item_key}/pdf")
    def get_pdf(item_key: str) -> FileResponse:
        ...
        path = _blob_path(settings, att["storage_key"])
        ...
        return FileResponse(
            path,
            media_type="application/pdf",
            filename=sanitize_filename(att["filename"]),
            content_disposition_type="inline",
            headers={
                "Cache-Control": "private, no-store",
                "X-Content-Type-Options": "nosniff",
                "ETag": f'"{att["checksum"]}"',
            },
        )
```

Upload path validates `%PDF` magic before persisting (`server.py:276–277`).

### Frontend

`PdfReader` loads the URL via `pdfjs.getDocument({ url })` — PDF.js parses the PDF in a worker and renders vector content to `<canvas>` client-side.

```35:35:web/src/PdfReader.tsx
    const task = pdfjs.getDocument({ url, withCredentials: false });
```

```89:89:web/src/PdfReader.tsx
        await pdfPage.render({ canvasContext: context, viewport, canvas }).promise;
```

### Live verification

```bash
curl -s "https://plainlist.space/wepaper/api/v1/papers/PSELS7ZT/pdf" \
  -H "Range: bytes=0-7" | xxd
# 00000000: 2550 4446 2d31 2e37                      %PDF-1.7
```

No `image/png`, `image/jpeg`, or pre-rendered page URLs appear in repo grep across `*.py`, `*.ts`, `*.tsx`.

---

## 2. Current PDF URL(s)

| Context | URL pattern | Evidence |
|---------|-------------|----------|
| **Production** | `https://plainlist.space/wepaper/api/v1/papers/{itemKey}/pdf` | `docs/deployment.md:5`; live curl above |
| **Dev (Vite proxy)** | `/api/v1/papers/{itemKey}/pdf` → `127.0.0.1:8788` | `web/vite.config.ts:9–14` |
| **Frontend helper** | `` `${import.meta.env.BASE_URL}api/v1/papers/${itemKey}/pdf` `` | `web/src/api.ts:34–36` |
| **Example (live)** | `https://plainlist.space/wepaper/api/v1/papers/PSELS7ZT/pdf` | curl 2026-09-07 |

With `WEPAPER_BASE=/wepaper/` (production build), `BASE_URL` is `/wepaper/` so the browser resolves the same path nginx proxies to uvicorn (`docs/deployment.md:27–33`).

**Single public PDF route.** No separate `/blobs/{sha256}` mount in the shipped app; blobs are accessed only through the paper-scoped, visibility-checked handler.

`PaperPage` wires the reader:

```71:72:web/src/pages/PaperPage.tsx
      {paper.has_pdf ? (
        <PdfReader url={pdfUrl(paper.zotero_item_key)} />
```

---

## 3. Are blobs real `.pdf` files on disk?

**Answer: Yes.**

### Storage layout

- Directory: `{WEPAPER_DATA_DIR}/blobs/` (`settings.py:24–25`)
- Key format: `[0-9a-f]{64}\.pdf` enforced by regex (`server.py:403`)
- Path sharding: `{blob_dir}/{key[0:2]}/{key[2:4]}/{key}` (`server.py:406–410`)
- Name derivation: `safe_storage_name(checksum, filename)` → `{sha256}.pdf` (`sanitize.py:19–23`)

### Write path

Bytes are written atomically via `.partial` then rename (`server.py:287–290`). Ingest rejects non-PDF magic (`server.py:276–277`).

### Tests

```144:146:tests/test_api.py
    first = client.get("/api/v1/papers/C8TQ6QR5/pdf")
    assert first.status_code == 200
    assert first.content.startswith(b"%PDF")
```

```165:166:tests/test_api.py
    blobs = list((tmp_path / "blobs").rglob("*.pdf"))
    assert len(blobs) == 1
```

Permissions: blob dir created `0o700` (`server.py:68`).

---

## 4. Is `Content-Type: application/pdf`?

**Answer: Yes.**

### Code

`FileResponse(..., media_type="application/pdf")` at `server.py:185`.

DB stores `mime = 'application/pdf'` on attachment insert (`server.py:295`).

### Live headers (public)

```
HTTP/2 200
content-type: application/pdf
content-length: 227651
```

(curl `-sI https://plainlist.space/wepaper/api/v1/papers/PSELS7ZT/pdf`, 2026-09-07)

### Live headers (loopback)

```
HTTP/1.1 200 OK
content-type: application/pdf
accept-ranges: bytes
content-length: 227651
```

(curl `-sI http://127.0.0.1:8788/api/v1/papers/PSELS7ZT/pdf`, 2026-09-07)

Also: `x-content-type-options: nosniff` on both paths.

---

## 5. HTTP Range support (loopback and public)

**Answer: Yes on GET; HEAD Range returns 405 on uvicorn (Starlette limitation), but PDF.js uses GET Range.**

### Loopback (`127.0.0.1:8788`)

Full GET advertises ranges:

```
accept-ranges: bytes
```

Range GET:

```bash
curl -s -D - "http://127.0.0.1:8788/api/v1/papers/PSELS7ZT/pdf" \
  -H "Range: bytes=0-1023" -o /dev/null
```

```
HTTP/1.1 206 Partial Content
content-type: application/pdf
content-range: bytes 0-1023/227651
content-length: 1024
```

### Public (`plainlist.space`)

```
accept-ranges: bytes
```

Range request:

```
HTTP/2 206
content-type: application/pdf
content-range: bytes 0-1023/227651
content-length: 1024
```

### Automated test

```150:152:tests/test_api.py
    ranged = client.get("/api/v1/papers/C8TQ6QR5/pdf", headers={"Range": "bytes=0-3"})
    assert ranged.status_code == 206
    assert ranged.content == b"%PDF"
```

Starlette `FileResponse` implements Range; nginx forwards it unchanged. PDF.js range streaming is **already viable** without backend changes.

**Note:** `curl -sI ... -H "Range: ..."` against loopback returns `405 Method Not Allowed` because HEAD does not implement Range. This does not affect PDF.js, which issues GET with `Range`.

---

## 6. Does PDF.js render page-by-page to canvas?

**Answer: Yes — currently one `<canvas>`, one page at a time.**

Flow in `PdfReader.tsx`:

1. `pdf.getPage(safePage)` — fetches one page object (`72–73`)
2. `pdfPage.getViewport({ scale: fitted })` — computes dimensions (`76–79`)
3. Resize canvas to viewport (`83–86`)
4. `pdfPage.render({ canvasContext, viewport, canvas })` — draws to 2D canvas (`89`)

Re-runs when `page`, `zoom`, or `query` changes (`useEffect` deps at line 115). Only **one** canvas ref exists (`canvasRef`); previous page pixels are overwritten, not kept in DOM.

Worker configured at `PdfReader.tsx:4–7`; dependency `pdfjs-dist@5.7.284` (`web/package.json:12`).

---

## 7. Is there a text layer?

**Answer: Yes — custom hand-built layer, not PDF.js's built-in `TextLayer` renderer.**

After canvas render:

```91:107:web/src/PdfReader.tsx
        const text = await pdfPage.getTextContent();
        layer.innerHTML = "";
        ...
        for (const item of text.items) {
          ...
          span.textContent = item.str;
          span.style.left = `${tx[4]}px`;
          span.style.top = `${tx[5] - item.height * fitted}px`;
          span.style.fontSize = `${item.height * fitted}px`;
```

DOM: `<div class="textLayer">` overlaid on canvas (`PdfReader.tsx:176`).

CSS: absolute positioning, `color: transparent` for selection/highlight (`web/src/styles.css:245–252`).

Search highlights matching spans with background color (`PdfReader.tsx:103–105`) — **in-page find only**, not cross-document search.

**Gaps vs production PDF viewers:** no proper text selection UX (transparent spans, no `user-select` tuning), no annotation layer, no link handling.

---

## 8. Why is it single-page only — UI limit or architecture?

**Answer: UI / React state limit, not backend or PDF.js architecture.**

Evidence:

- `page` state + Prev/Next toolbar (`PdfReader.tsx:22, 139–156`)
- Render effect keyed on single `page` (`PdfReader.tsx:68–115`)
- Single `.page-wrap` container with one canvas (`PdfReader.tsx:174–177`)
- Keyboard nav increments `page` only (`PdfReader.tsx:120–125`)

PDF.js already exposes `doc.numPages` and `getPage(n)` for any *n*; the backend serves the **full multi-page file** in one response/stream. Nothing prevents mounting N page slots in a scroll container.

The `.viewer` container already has `overflow: auto` (`styles.css:238`) — layout is scroll-ready; content is just one page tall.

---

## 9. Can we reuse the original PDF bytes for continuous scroll?

**Answer: Yes — no new asset type or API required.**

| Requirement | Status |
|-------------|--------|
| Same PDF URL | Already `{BASE_URL}api/v1/papers/{key}/pdf` |
| Range-friendly streaming | Confirmed §5 |
| Client parser | `pdfjs.getDocument({ url })` already loads full doc proxy |
| Multi-page render | Add loop / virtual list calling `getPage(i)` per visible slot |
| Source of truth | Disk blob unchanged |

Implementation sketch for V1.1:

1. Keep one `PDFDocumentProxy` from existing `getDocument` effect.
2. Render a vertical list of page shells (height from `getViewport` at fit scale).
3. **Lazy render:** `IntersectionObserver` (or `@anaralabs/lector` virtualizer) calls `render()` only for near-viewport pages; cancel/destroy off-screen render tasks.
4. Per page: canvas + text layer (reuse current span-building logic or migrate to PDF.js `TextLayer`).
5. Optional: enable PDF.js `disableAutoFetch` / `disableStream` tuning once multi-page memory profile is measured — Range support is already there.

**Do not:** pre-render pages to PNG on server or client for the main reading surface (constraint). Canvas rasterization per page for display is standard PDF.js vector→bitmap compositing, not a PNG asset pipeline.

---

## 10. Reader approach comparison

Legend: ✅ good · ⚠️ partial · ❌ poor/blocker · — not applicable

| Criterion | Mozilla generic `web/viewer.html` | PDF.js viewer layer (react-pdf / custom `pdfjs-dist`) | `@anaralabs/lector` | `<iframe>` / `<object>` native viewer |
|-----------|-----------------------------------|------------------------------------------------------|----------------------|----------------------------------------|
| **Continuous scroll** | ✅ built-in vertical scroll mode | ⚠️ must build (stack + lazy render) | ✅ `Pages` + virtualizer | ✅ browser native |
| **Text selection** | ✅ PDF.js text layer | ⚠️ current custom layer is weak; fixable | ✅ `TextLayer` component | ✅ native (browser-dependent) |
| **Search** | ✅ find bar, cross-page | ⚠️ current: in-page highlight only | ✅ hooks for search | ✅ native (browser-dependent) |
| **Zoom** | ✅ full toolbar | ✅ already have keyboard +/- (`PdfReader.tsx:126–127`) | ✅ pan/zoom primitives | ⚠️ browser chrome |
| **Page tracking** | ✅ scroll sync + URL hash | ⚠️ must add scroll spy | ✅ `useVisiblePage` | ⚠️ limited programmatic access |
| **Mobile** | ⚠️ heavy UI, not mobile-first | ⚠️ current toolbar ok; need touch scroll | ✅ responsive docs claim | ⚠️ iOS Safari PDF quirks |
| **Bundle size** | ❌ large (full viewer + l10n + assets) | ✅ already ship `pdfjs-dist` only | ⚠️ +lector on top of pdfjs | ✅ zero JS |
| **Maintainability** | ❌ fork/skin Mozilla UI; upstream drift | ✅ full control, matches existing code | ⚠️ young lib (2025+), active perf work | ✅ none |
| **Styling** | ❌ hard to match wePaper folio aesthetic | ✅ matches `styles.css` design system | ✅ headless / composable | ❌ browser chrome |
| **CSP** | ⚠️ needs worker, inline styles in viewer | ✅ already compliant (`worker-src 'self' blob:`) | ⚠️ imports `pdf_viewer.css`; check inline | ❌ **`object-src 'none'`** blocks `<object>` |
| **Security** | ⚠️ large attack surface; sandbox iframe suggested in review | ✅ same-origin PDF, no eval | ✅ same as pdfjs | ❌ **`X-Frame-Options: DENY`** on API; embedding PDF URL in iframe blocked |

### CSP / security evidence (blocks native embed)

```361:365:src/wepaper/server.py
        response.headers.setdefault(
            "Content-Security-Policy",
            ...
            "connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
        )
```

Live public PDF response also includes `x-frame-options: DENY` and the same CSP.

**Native `<object data=".../pdf">`:** fails CSP `object-src 'none'`.  
**`<iframe src=".../pdf">`:** PDF URL sends `X-Frame-Options: DENY` / `frame-ancestors 'none'`.  
**Mozilla generic viewer in iframe:** would need separate static host + sandbox; still fights styling and duplicates chrome we already built.

### Notes per option

**Mozilla generic viewer** — Full-featured reference implementation. Mozilla docs say to **re-skin**, not drop in (`REFERENCE_RESEARCH.md:457`). Bundle includes l10n, sidebar, print UI. Poor fit for wePaper's minimal folio chrome.

**PDF.js viewer layer (current + extend)** — Already integrated; worker wired; text layer pattern exists. Continuous scroll is ~100–200 LOC of React (page list + IntersectionObserver) or reuse PDF.js `PDFViewer` classes from `pdfjs-dist/web/` (more coupling to Mozilla DOM structure).

**@anaralabs/lector** — React 19 + `pdfjs-dist` peer; composable `Root` / `Pages` / `Page` / `CanvasLayer` / `TextLayer`. Provides virtualization, scroll-idle text-layer builds, off-DOM canvas blit for perf ([lector#128](https://github.com/anaralabs/lector/issues/128)). Adds dependency and `pdf_viewer.css` import; aligns with constraints (real PDF, lazy render, no PNG pipeline). Good **accelerator** if we do not want to own scroll virtualization yet.

**iframe/object native** — Ruled out for wePaper by security headers and CSP, regardless of browser PDF UX quality.

---

## Recommended approach for V1.1

### Primary recommendation: **Evolve in-house `pdfjs-dist` reader** (extend `PdfReader.tsx`)

**Why:**

1. **Source of truth unchanged** — same `/api/v1/papers/{key}/pdf` blob stream; Range already works.
2. **Constraints satisfied** — vertical scroll + lazy `getPage`/`render` per viewport; vector PDF→canvas, not PNG tiles.
3. **Smallest conceptual jump** — single-page code path (`getPage` → canvas → text spans) becomes N lazy page components; toolbar/page state becomes scroll spy.
4. **CSP-safe** — already running worker + `connect-src 'self'` to same-origin API.
5. **Design control** — folio toolbar, typography, and dark viewer (`styles.css`) stay consistent; Mozilla generic viewer would fight the aesthetic.
6. **Security surface** — no third-party full UI; no iframe bypass of `X-Frame-Options`.

**V1.1 implementation checklist:**

- [ ] Replace single `page` state with scroll container of fixed-height page placeholders.
- [ ] `IntersectionObserver` (root = `.viewer`) to mount/unmount render tasks per page.
- [ ] Extract `PageView` component from current render effect (canvas + text layer).
- [ ] Scroll spy → update toolbar page indicator / URL hash (`#page=3`).
- [ ] Upgrade text layer: adopt PDF.js `TextLayer` or lector-style scroll-idle build for perf on dense pages.
- [ ] Cross-page find: iterate pages or defer to V1.2.
- [ ] Keep keyboard shortcuts; add Home/End for first/last page.

### Alternative (acceptable): **`@anaralabs/lector` as implementation accelerator**

Choose this if scroll virtualization and text-layer perf tuning should not be owned in-house. Same PDF URL, same backend, same CSP posture (verify CSS import). Trade-off: external dependency and less bespoke control over edge-case behavior.

### Explicitly not recommended for V1.1

| Approach | Reason |
|----------|--------|
| Mozilla generic `viewer.html` | Bundle weight, theming cost, feature bloat |
| Native iframe/object PDF | Blocked by `object-src 'none'` and `X-Frame-Options: DENY` |
| Server-side page PNGs | Violates constraint; adds storage/CDN complexity |
| Zotero reader fork | AGPL, annotation engine, full-file buffer anti-pattern (`REFERENCE_RESEARCH.md:58, 109–117`) |

---

## Appendix: live HTTP captures (2026-09-07)

### Public full response headers

```
HTTP/2 200
content-type: application/pdf
content-length: 227651
cache-control: private, no-store
x-content-type-options: nosniff
etag: "1d9e9ee3019784bc9aa843a7849071595ec57d74ef0f8a3e0f61d973bafce35d"
content-disposition: inline; filename*=utf-8''Li%20%3F%20-%202026%20-%20...
accept-ranges: bytes
x-frame-options: DENY
content-security-policy: default-src 'self'; ... object-src 'none'; frame-ancestors 'none'
```

### Public range response

```
HTTP/2 206
content-type: application/pdf
content-range: bytes 0-1023/227651
content-length: 1024
```

### Loopback range response

```
HTTP/1.1 206 Partial Content
content-type: application/pdf
content-range: bytes 0-1023/227651
accept-ranges: bytes
```

---

## Files referenced

| File | Role |
|------|------|
| `web/src/PdfReader.tsx` | Client PDF.js single-page viewer |
| `web/src/api.ts` | `pdfUrl()` constructor |
| `web/src/pages/PaperPage.tsx` | Reader mount point |
| `web/src/styles.css` | Viewer + text layer styles |
| `src/wepaper/server.py` | `get_pdf`, CSP, blob path |
| `src/wepaper/sanitize.py` | `{sha256}.pdf` storage keys |
| `tests/test_api.py` | PDF + Range integration tests |
| `docs/deployment.md` | Public URL / nginx / `WEPAPER_BASE` |
