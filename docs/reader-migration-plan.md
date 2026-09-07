# wePaper Reader Migration Plan

> **Historical (v1.3.0).** Superseded in v1.4.0: the default reading experience is browser-native `/paper/:id/pdf`. The in-app PDF.js viewer was removed. Do not re-implement this plan.

**Goal:** Replace wePaper’s custom PDF.js Display-API renderer with Mozilla’s official viewer layer, inside the existing `/paper/:id` shell, without regressing V1.2 first-page latency or security.

**Architecture:** wePaper owns library, identity, routing, security, and the PDF byte endpoint. Mozilla `PDFViewer` owns page layout, high-DPI rendering (including `enableDetailCanvas`), continuous scroll, text layer, find, and print. wePaper’s existing `PDFDataRangeTransport` (256 KiB) stays as the fetch adapter.

**Tech stack:** React 19 + Vite 7 + `pdfjs-dist@5.7.284` (`pdfjs-dist/web/pdf_viewer.mjs` + `pdf_viewer.css`). Server FastAPI + nginx unchanged except an optional CSP `script-src` addition.

## Global Constraints

- Production origin is `https://wepaper.plainlist.space`. Do not add a second PDF origin or CDN.
- Canonical in-app route stays `/paper/:id`. Do not 302 that route to the raw PDF.
- Canonical PDF bytes stay at `/paper/:id/pdf` (alias `/api/v1/papers/:id/pdf`).
- Do not rewrite Zotero sync, blob checksums, or linearize sidecars.
- Do not enable PDF JavaScript (`PDFScriptingManager` must not be constructed).
- Do not enable XFA.
- Do not add a long-lived feature flag.
- Clash on the author Mac remaps `wepaper.plainlist.space` to `198.18.x`. All production Playwright must set `WEPAPER_RESOLVE_IP=175.24.134.228` (already in `web/playwright.config.ts`).
- First-page gate is click → readable page 1, P50 ≤ 2.0 s / P95 ≤ 3.0 s, isolated context, cache disabled.
- Fidelity gate: wePaper must not be visibly inferior to Chrome/Safari native at 100/200/300/400% for text and vectors. The 32M canvas-pixel ceiling must not remain an application-owned quality cap.
- Do not ship a second wePaper zoom/find implementation that re-renders canvases itself. Thin EventBus adapters are required; `zoomSteps.ts` / `findHits.ts` / `canvasScale.ts` are not.

---

## 1. Executive Decision

**Recommended architecture (only one):**

```text
wePaper shell (/paper/:id)
  ├── Library link, document.title, paper title, Open original
  └── Official Mozilla PDF.js viewer layer
        PDFViewer + EventBus + PDFLinkService + PDFFindController + PDFHistory
        + existing loadPdf() Range transport
        + pdfjs-dist/web/pdf_viewer.css
```

**Fallback (not a second default):** `<a href="/paper/:id/pdf" target="_blank" rel="noreferrer">` — already shipped as “Open PDF”. Desktop Safari 26.5 and Chrome PDFium open that URL inline. This is an escape hatch, not the reader.

**Rejected as the in-app reader:**

- Browser-native `<iframe>` / `<object>` / `<embed>` of the PDF
- Stock `viewer.html?file=` iframe
- `react-pdf`, `@react-pdf-viewer/core`, Lector, or any other canvas wrapper

**Why this one:** Native embed is blocked today by `X-Frame-Options: DENY` + `frame-ancestors 'none'` (measured). Relaxing those headers still leaves Safari/Chrome embed inconsistent, and iOS Safari embed is NOT TESTED (WebKit documents that iOS `<iframe>`/`<embed>` of PDF often become a download). Firefox’s “native” viewer is already PDF.js. Official `PDFViewer` is the same class Firefox uses, already in `pdfjs-dist@5.7.284`, keeps `/paper/:id`, keeps V1.2 Range transport, and includes `enableDetailCanvas` so a 32M cap is no longer wePaper’s quality ceiling.

---

## 2. Current Implementation Audit

Audited from the tree (not from memory). Custom reader is a **yes**: wePaper calls `getDocument` → `getPage` → `page.render({ canvasContext, viewport, canvas, transform })` → `new pdfjs.TextLayer(...)` in React. It does **not** import `PDFViewer` / `PDFPageView`.

### 2.1 Fetch path (KEEP)

`pdfUrl(itemKey)` → `` `${BASE}paper/${itemKey}/pdf` `` (`web/src/api.ts`).

`PaperPage` mounts `PdfReader url={pdfUrl(id)}` immediately; metadata only sets `document.title` / 404.

`loadPdf(url)` (`web/src/pdfLoader.ts`):

1. Cache API `wepaper-pdf-v12`
2. Else first Range `bytes=0-262143`
3. If that is the whole file → `getDocument({ data })`
4. Else `FetchRangeTransport` + `getDocument({ range, disableAutoFetch: true, disableStream: true, disableRange: false })`

`persistPdf` runs only after first canvas `data-ready` (must stay after first paint).

Library hover calls `warmPdf` — keep.

Server: `get_pdf` and `public_pdf` are the same handler. `Content-Type: application/pdf`, `Accept-Ranges: bytes`, ETag = blob sha256, `If-None-Match` → 304, HEAD 200 + `Content-Length`, `Content-Disposition: inline; filename="..."`. Linearized sidecar via `ensure_linearized`. nginx: `proxy_cache off`, `proxy_buffering off`, Range forwarded, PDF not gzipped.

### 2.2 Display path (DELETE)

| Concern | File | How it works today |
| --- | --- | --- |
| Continuous scroll | `PdfReader.tsx` | One `.reader-scroll`; every page in `sizes.map`; placeholders for off-window pages |
| Lazy render | `pdfWindow.ts` | `pageWindow(current, total, 2)` after first ready, else buffer 0 |
| Zoom | `zoomSteps.ts` | `ZOOM_STEPS = [0.5…4]`; `fitWidth` vs `zoom`; `+`/`-`/`0` |
| Canvas | `PdfPage` in `PdfReader.tsx` | `backingStore(viewport, dpr)` then `page.render` |
| DPR / cap | `canvasScale.ts` | `MAX_DPR = 3`, `MAX_CANVAS_PIXELS = 32_000_000` |
| Text layer | `pdfjs.TextLayer` + `.textLayer` CSS | Official class, custom CSS copied from pdf.js |
| Find | `findHits.ts` | Full-text index only after Find opens; highlight by string includes |
| Ready metric | `data-testid=pdf-page-N` + `data-ready` | Set after `renderTask.promise`, **before** text layer finishes |

Zoom **does** re-render (new backing store). The defect is not “CSS stretch of one bitmap” on desktop DPR 2. The defect is **application-owned rasterization with a hard pixel budget and no detail canvas**.

### 2.3 Worked pixel-budget example (measured + calculated)

Letter-size page 612×792, `outputScale` as in `canvasScale.ts`.

| Zoom | DPR | CSS | ratio | Backing | Hits 32M? |
| ---: | ---: | --- | ---: | --- | --- |
| 100% | 2 | 612×792 | 2.000 | 1224×1584 | no |
| 400% | 2 | 2448×3168 | 2.000 | 4896×6336 | no (31.0 Mpx) |
| 200% | 3 | 1224×1584 | 3.000 | 3672×4752 | no |
| **300%** | **3** | **1836×2376** | **2.708** | **4972×6435** | **yes** |
| **400%** | **3** | **2448×3168** | **2.031** | **4972×6435** | **yes** |

On a 3× display, **300% and 400% produce the same backing store**. 400% is a CSS stretch of the 300% bitmap. That is the fidelity bug. Official `PDFViewer` defaults `maxCanvasPixels` to `2**25` (33,554,432) and, when restricted, paints a **detail canvas** for the visible viewport (`enableDetailCanvas: true` in `web/node_modules/pdfjs-dist/web/pdf_viewer.mjs`). iOS/Android UA compat in that file lowers `maxCanvasPixels` to 5,242,880 — still with a detail canvas. wePaper has no detail canvas.

Playwright desktop 1440×900 @2 (this research session) confirmed backing 1224 / 2448 / 3672 / 4896 at 100/200/300/400% for `PSELS7ZT`, `3FYGRVK7`, `PAS2TSBP`.

### 2.4 Current chrome

`PdfReader` toolbar: Library, page input, find (replaces page input when open), zoom out / Fit-or-% / zoom in, find toggle, Open PDF. Keyboard: Cmd/Ctrl+F, Esc, +/-, 0, Home/End, j/k, arrows.

### 2.5 Security headers (all responses, including PDFs)

```
X-Frame-Options: DENY
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: blob:; worker-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'
```

`frame-src` is unset (falls back to `default-src 'self'`). `X-Frame-Options: DENY` blocks **same-origin** framing too (MDN). That is why a production `<iframe src="/paper/PSELS7ZT/pdf">` is blank/blocked. `object-src 'none'` on the **HTML** page blocks `<object>`/`<embed>`.

---

## 3. Root Cause of Fidelity Problem

The bytes are real `application/pdf`. Safari at `https://wepaper.plainlist.space/paper/PSELS7ZT/pdf` paints the paper inline with PDFKit. Chrome PDFium does the same at top-level `/pdf` (Playwright: `document.contentType=application/pdf`, Range 206, extension `chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai/`).

The in-app surface is a wePaper-maintained rasterizer:

```text
PDF bytes → pdfjs-dist getDocument → custom PdfPage → canvas + CSS size
```

That surface is weaker than native because:

1. **Hard 32M pixel cap without a detail canvas.** On DPR 3, 400% === 300% bitmap.
2. **`MAX_DPR = 3`** never uses devicePixelRatio > 3.
3. **Single backing store per page.** Official viewer adds a second canvas for the viewport when capped.
4. **wePaper owns zoom, scroll, text layer, find, render queue.** Every fidelity bug is ours.
5. Fit-width default is a non-integer CSS scale (fine) but high manual zoom is where the cap bites.

Do not “fix” this by raising `MAX_CANVAS_PIXELS` again. That is the V1.2 move and it still clamps 300% vs 400% on mobile Retina.

---

## 4. Candidate Architectures

### Option A — Browser-native embed

`iframe` / `object` / `embed` of `/paper/:id/pdf`, or 302 the paper route.

**Tested:** Chromium embed of production PDF is blocked (`frame-ancestors 'none'`). Safari iframe of production PDF is blank. A control PDF on `127.0.0.1` without those headers **does** embed in headed Chromium with full PDFium chrome. Top-level `/pdf` works in Safari 26.5 (inline, not download) and Chrome.

**Not a reader:** wePaper chrome disappears; URL becomes `/pdf`; iOS embed NOT TESTED; Firefox native is PDF.js anyway; unlocking embed requires weakening clickjacking on the PDF URL.

### Option B — Official Mozilla viewer layer (SELECTED)

`pdfjs-dist/web/pdf_viewer.mjs` components. Primary sources: [mozilla/pdf.js](https://github.com/mozilla/pdf.js) Apache-2.0; [examples/components/simpleviewer.mjs](https://raw.githubusercontent.com/mozilla/pdf.js/v5.7.284/examples/components/simpleviewer.mjs) at tag `v5.7.284` (match the installed npm version); `web/node_modules/pdfjs-dist/web/pdf_viewer.mjs` `defaultOptions.maxCanvasPixels = 2**25`, `enableDetailCanvas = true`.

`pdfjs-dist` does **not** ship `viewer.html`. The generic zip does. Do not copy `viewer.html` unless a later phase needs a throwaway prototype.

### Option C — Third-party wrappers

| Package | Verdict |
| --- | --- |
| `@react-pdf-viewer/core` | REJECT — archived, commercial, pdf.js v2/v3 |
| `react-pdf` (wojtekmaj) | REJECT as viewer — MIT and maintained, but `Page` is `page.render()` (“as images”) |
| Lector (`@anaralabs/lector`) | REJECT as default — `useCanvasLayer` → `pdfPageProxy.render()` |
| `pdfjs-dist/web/pdf_viewer.mjs` | ACCEPT — this is Option B |

---

## 5. Benchmark Results

**Machine:** macOS, 2026-09-07. Production `175.24.134.228` via `--resolve` / Playwright `--host-resolver-rules`. Papers:

| Role | Key | Title |
| --- | --- | --- |
| A text-heavy | `PSELS7ZT` | Remember, verify, or ask? … (5 pp, 228 KB) |
| B dense / small type | `3FYGRVK7` | STALE: can LLM agents know when their memories… (37 pp, 5.6 MB) |
| C figures / layout | `PAS2TSBP` | Mandol: an agglomerative agent memory system… (10 pp, 2.7 MB) |

### 5.1 Current wePaper (Playwright Chromium, 1440×900 @ DPR 2)

| Paper | 100% backing | 200% | 300% | 400% |
| --- | --- | --- | --- | --- |
| All three | 1224×1584 r=2 | 2448×3168 r=2 | 3672×4752 r=2 | 4896×6336 r=2 |

On this desktop viewport the 32M cap is **not** hit at 400%. Body text and title at 100–200% are usable. At 400% the crop is a large serif title; edges are anti-aliased raster, not live vectors. Find/select work on the custom text layer.

### 5.2 Safari 26.5 native (osascript + screenshot)

- `https://wepaper.plainlist.space/paper/PSELS7ZT/pdf` — **inline PDF**, URL stays on `/pdf`, no download. Two-column paper visible. Native Safari PDF chrome is hover-only; not fully exercised (Apple Events JS blocked).
- `https://wepaper.plainlist.space/paper/PSELS7ZT` — custom wePaper shell (Library / 1 of 5 / Fit) + same paper. This is the in-app raster surface.

### 5.3 Chrome native

- Playwright Chromium top-level `/pdf`: PDFium UI present, `application/pdf`, Range 206. Headless Chromium **downloads** the PDF if you `page.goto` the raw URL without treating it as a viewer (do not use that as a fidelity shot).
- Cursor embedded Chrome: native PDF tab showed viewer chrome but an empty page (known limitation of that embed). **Do not trust Cursor-browser screenshots of `/pdf`.**

### 5.4 Official PDF.js generic viewer

- `https://mozilla.github.io/pdf.js/web/viewer.html` loads the generic toolbar (TESTED by investigator).
- `viewer.html?file=` + wePaper PDF **FAILS CORS** (no `Access-Control-Allow-Origin`). Do not add `*`.
- Side-by-side 400% of official `PDFViewer` vs wePaper on these three papers: **NOT TESTED** in this session (no in-repo prototype). Expected: same rasterizer as today at 100–200% DPR 2; **better** at DPR 3 / 300–400% because of `enableDetailCanvas`. Implementing agent must run §15 before deleting `PdfReader.tsx`.

### 5.5 Zotero Reader

`Zotero.app` is installed. Process was **not running**. Local API `127.0.0.1:23119` returned 404. **NOT TESTED.**

### 5.6 Mobile browsers

iPhone Safari, iPad, Android Chrome: **NOT TESTED**. Do not mark PASS. Phase 5 is a hard gate.

---

## 6. Selected Architecture

```text
Use:     Official pdfjs-dist viewer components inside /paper/:id
Reject:  Custom PdfReader/PdfPage canvas stack
Reject:  Native iframe/object as the default reader
Reject:  Third-party React PDF wrappers
Keep:    /paper/:id/pdf + Range transport + Open PDF
```

**Desktop strategy:** Official `PDFViewer` in the wePaper shell. Open PDF → native Chrome/Safari/Firefox viewer in a new tab.

**Mobile strategy:** The same in-app `PDFViewer`. Do not split stacks. Open PDF remains the native escape hatch. If Phase 5 shows iOS in-app is unusable, the fallback is still “Open PDF” (top-level navigation), not a second renderer.

---

## 7. Target Architecture

```text
┌─────────────────────────────────────────────┐
│ Library    title (truncate)     Open PDF    │  wePaper chrome only
├─────────────────────────────────────────────┤
│ page  find  −  100%  +                      │  thin EventBus adapters
├─────────────────────────────────────────────┤
│                                             │
│   div.reader-scroll (overflow: auto)        │
│     div.pdfViewer                           │  Mozilla PDFViewer
│       .page[data-page-number] canvas+text   │
│                                             │
└─────────────────────────────────────────────┘
              │
              ▼
     loadPdf("/paper/:id/pdf")
     Cache API + 256 KiB Range transport
              │
              ▼
     GET/HEAD /paper/:id/pdf  (unchanged)
```

**Seam (codebase-design):** `loadPdf(url): Promise<PDFDocumentProxy>` is the fetch module. `PaperViewer` is the display module. Tests for fetch stay. Tests for canvas math go away.

**wePaper owns:** routing, metadata, branding, CSP, PDF endpoint, hover warm, first-page persist-after-paint.

**Viewer owns:** render, zoom, scroll, selection, find, print (browser print of the viewer), page nav, high-DPI / detail canvas.

**Do not** put zoom/find/page in the top wePaper bar **and** also show Mozilla’s full generic toolbar. One chrome: keep wePaper’s quiet 32 px bar; wire it to `EventBus` / `PDFViewer` methods.

---

## 8. File-by-File Migration

| File | Current role | New role | Action |
| --- | --- | --- | --- |
| `web/src/PdfReader.tsx` | Custom renderer + chrome | — | **DELETE** |
| `web/src/canvasScale.ts` | 32M / MAX_DPR | Viewer `maxCanvasPixels` + detail canvas | **DELETE** |
| `web/src/zoomSteps.ts` | Discrete zoom ladder | `increaseScale` / `decreaseScale` | **DELETE** |
| `web/src/pdfWindow.ts` | Lazy page window | `PDFViewer` rendering queue | **DELETE** |
| `web/src/findHits.ts` | Custom find | `PDFFindController` | **DELETE** |
| `web/src/pdfLoader.ts` | Range + Cache API | Same, called from `PaperViewer` | **KEEP** |
| `web/src/pdfRange.ts` | 256 KiB split | Same | **KEEP** |
| `web/src/pages/PaperPage.tsx` | Mounts `PdfReader` | Mounts `PaperViewer` | **CHANGE** |
| `web/src/pages/LibraryPage.tsx` | `warmPdf` on hover | Unchanged | **KEEP** |
| `web/src/api.ts` | `pdfUrl` | Unchanged | **KEEP** |
| `web/src/PaperViewer.tsx` | — | Official viewer shell | **CREATE** |
| `web/src/styles.css` | `.reader*` + `.textLayer` | Keep library + thin toolbar; drop custom `.textLayer` / `.pdf-page` | **CHANGE** |
| `web/src/main.tsx` | Worker modulepreload | Keep | **KEEP** |
| `web/vite.config.ts` | Worker preload plugin | Keep (worker still ships) | **KEEP** |
| `web/package.json` | `pdfjs-dist@5.7.284` | Same version; import viewer CSS/JS already in the package | **KEEP** |
| `src/wepaper/server.py` | PDF + CSP | Optional `wasm-unsafe-eval` | **CHANGE** only if JPX/wasm required |
| `deploy/nginx-wepaper.plainlist.space.conf` | Range proxy | Unchanged | **KEEP** |
| `tests/test_canvas_scale.py` | Mirror canvas/zoom | — | **DELETE** |
| `tests/test_page_window.py` | Mirror window | — | **DELETE** |
| `tests/test_find_hits.py` | Mirror find | — | **DELETE** |
| `tests/test_pdf_range.py` | Mirror range | Still valid | **KEEP** |
| `web/e2e/library-reader.spec.ts` | Custom selectors | Official page/find selectors | **REWRITE** |
| `web/e2e/first-page-bench.spec.ts` | canvas backing asserts | Readable page 1 + no 32M wePaper cap test | **REWRITE** |
| `web/e2e/screenshots.spec.ts` | Visual shots | New chrome | **CHANGE** |
| `web/scripts/time-getdocument.mjs` | Loader bench | Optional keep | **KEEP** |

### 8.1 CREATE `web/src/PaperViewer.tsx`

**WHY:** This is the only new display module. It must not call `page.render`.

**WHAT:** Mount official `PDFViewer` into a sized container; feed it `loadPdf(url)`; expose wePaper chrome via viewer APIs.

**HOW:** Implement exactly this shape (names are the contract later tasks use):

```tsx
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  EventBus,
  PDFFindController,
  PDFHistory,
  PDFLinkService,
  PDFViewer,
} from "pdfjs-dist/web/pdf_viewer.mjs";
import { AnnotationEditorType, AnnotationMode } from "pdfjs-dist";
import "pdfjs-dist/web/pdf_viewer.css";
import { loadPdf, persistPdf } from "./pdfLoader";

type Props = { url: string; title?: string };

export function PaperViewer({ url, title }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<HTMLDivElement>(null);
  const pdfViewerRef = useRef<PDFViewer | null>(null);
  const eventBusRef = useRef<EventBus | null>(null);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [scaleLabel, setScaleLabel] = useState("Fit");
  const [query, setQuery] = useState("");
  const [findOpen, setFindOpen] = useState(false);
  const [firstReady, setFirstReady] = useState(false);
  const [status, setStatus] = useState("Opening");

  useEffect(() => {
    const container = containerRef.current;
    const viewer = viewerRef.current;
    if (!container || !viewer) return;
    let cancelled = false;
    const eventBus = new EventBus();
    const linkService = new PDFLinkService({ eventBus });
    const findController = new PDFFindController({ eventBus, linkService });
    const history = new PDFHistory({ eventBus, linkService });
    const pdfViewer = new PDFViewer({
      container,
      viewer,
      eventBus,
      linkService,
      findController,
      textLayerMode: 1,
      annotationMode: AnnotationMode.ENABLE,
      annotationEditorMode: AnnotationEditorType.NONE,
      removePageBorders: true,
      enableDetailCanvas: true,
    });
    linkService.setViewer(pdfViewer);
    history.initialize({ fingerprint: url, resetHistory: true });
    pdfViewerRef.current = pdfViewer;
    eventBusRef.current = eventBus;

    const onRendered = (ev: { pageNumber: number }) => {
      if (ev.pageNumber === 1) {
        setFirstReady(true);
        setStatus("");
      }
    };
    const onScale = () => {
      const v = pdfViewer.currentScaleValue;
      setScaleLabel(v === "page-width" ? "Fit" : `${Math.round(pdfViewer.currentScale * 100)}%`);
    };
    const onPage = () => setPage(pdfViewer.currentPageNumber);
    eventBus.on("pagerendered", onRendered);
    eventBus.on("scalechanging", onScale);
    eventBus.on("pagechanging", onPage);

    setFirstReady(false);
    setStatus("Opening");
    void loadPdf(url).then(async (doc) => {
      if (cancelled) return;
      pdfViewer.setDocument(doc);
      linkService.setDocument(doc, null);
      setPages(doc.numPages);
      pdfViewer.currentScaleValue = "page-width";
    }).catch(() => {
      if (!cancelled) setStatus("The PDF could not be opened.");
    });

    return () => {
      cancelled = true;
      eventBus.off("pagerendered", onRendered);
      eventBus.off("scalechanging", onScale);
      eventBus.off("pagechanging", onPage);
      pdfViewer.cleanup();
      pdfViewerRef.current = null;
    };
  }, [url]);

  useEffect(() => {
    if (!firstReady) return;
    void loadPdf(url).then((doc) => persistPdf(url, doc));
  }, [firstReady, url]);

  function find(next: boolean) {
    eventBusRef.current?.dispatch("find", {
      source: window,
      type: next ? "again" : "",
      query,
      highlightAll: true,
      caseSensitive: false,
      entireWord: false,
      findPrevious: false,
    });
  }

  return (
    <div className="reader">
      <div className="reader-tools" role="toolbar" aria-label="PDF">
        <div className="tools-left">
          <Link className="back" to="/">Library</Link>
          {title ? <span className="paper-title">{title}</span> : null}
        </div>
        <div className="tools-center">
          {findOpen ? (
            <input
              className="findbar-input"
              placeholder="Find"
              value={query}
              aria-label="Find in document"
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") find(true);
              }}
            />
          ) : (
            <span className="page-readout">
              <input
                aria-label="Page"
                value={page}
                onChange={(e) => {
                  const n = Number(e.target.value) || 1;
                  if (pdfViewerRef.current) pdfViewerRef.current.currentPageNumber = n;
                }}
              />
              <span>/ {pages}</span>
            </span>
          )}
        </div>
        <div className="tools-right">
          <button type="button" aria-label="Zoom out" onClick={() => pdfViewerRef.current?.decreaseScale({ steps: 1 })}>−</button>
          <button
            type="button"
            className="zoom-label"
            aria-label={scaleLabel === "Fit" ? "Actual size" : "Fit width"}
            onClick={() => {
              const v = pdfViewerRef.current;
              if (!v) return;
              v.currentScaleValue = v.currentScaleValue === "page-width" ? "1" : "page-width";
            }}
          >
            {scaleLabel}
          </button>
          <button type="button" aria-label="Zoom in" onClick={() => pdfViewerRef.current?.increaseScale({ steps: 1 })}>+</button>
          <button type="button" aria-label="Find in document" aria-pressed={findOpen} onClick={() => setFindOpen((v) => !v)}>Find</button>
          <a className="open-pdf" href={url} target="_blank" rel="noreferrer" aria-label="Open PDF">Open PDF</a>
        </div>
      </div>
      {status ? <p className="reader-status">{status}</p> : null}
      <div
        className="reader-scroll"
        ref={containerRef}
        data-first-ready={firstReady ? "true" : "false"}
      >
        <div className="pdfViewer" ref={viewerRef} />
      </div>
    </div>
  );
}
```

Completion criterion for this file: `grep -n "page.render" web/src/PaperViewer.tsx` returns nothing. `grep PDFViewer web/src/PaperViewer.tsx` returns the import.

**CSS contract:** `.reader-scroll` must be the `PDFViewer` `container`: `position: relative; overflow: auto; flex: 1; min-height: 0;` and a definite height (parent `.paper-page` is already `height: 100dvh; display: flex; flex-direction: column`). Inner `.pdfViewer` is Mozilla’s class name — do not rename it.

**Ready metric for tests:** `document.querySelector('.reader-scroll[data-first-ready="true"] .page[data-page-number="1"] canvas')` exists and `canvas.width > 0`. Do **not** treat “Opening” clearing as success.

### 8.2 CHANGE `web/src/pages/PaperPage.tsx`

**WHY:** Route shell stays; only the child viewer changes.

**WHAT:** Replace `PdfReader` with `PaperViewer`. Pass `title`. Keep immediate mount (do not wait for `fetchPaper` before mounting the viewer).

**HOW:**

```tsx
import { PaperViewer } from "../PaperViewer";
// ...
return (
  <div className="paper-page">
    <PaperViewer url={pdfUrl(id)} title={title} />
  </div>
);
```

Remove `import { PdfReader } from "../PdfReader"`.

### 8.3 CHANGE `web/src/styles.css`

**WHY:** Official `pdf_viewer.css` owns `.textLayer` / `.page`. wePaper’s copied `.textLayer` rules (`styles.css` ~293–329) will fight it.

**WHAT:** Delete `.pdf-page`, `.pdf-placeholder`, `.textLayer` wePaper copies. Keep `.reader`, `.reader-tools`, `.reader-scroll`, library styles. Add:

```css
.reader-scroll {
  position: relative;
  overflow: auto;
  flex: 1;
  min-height: 0;
}
.paper-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 36vw;
  font-size: 12px;
}
```

**HOW:** Import of `pdf_viewer.css` is in `PaperViewer.tsx`. After cutover, search `styles.css` for `textLayer` — must be zero wePaper copies.

### 8.4 KEEP `web/src/pdfLoader.ts` / `pdfRange.ts`

**WHY:** These are the V1.2 first-page path. Official `PDFViewer.setDocument(doc)` accepts the same `PDFDocumentProxy`.

**WHAT:** No renderer code. Do not switch to stock `getDocument({ url })` with default `rangeChunkSize` of 64 KiB unless a bench proves it equal. Do not call `persistPdf` from the loader; `PaperViewer` calls it after first page.

**HOW:** No change unless TypeScript complains about `PDFDocumentProxy` identity across imports. If it does, import the type from `pdfjs-dist` only (already the case).

### 8.5 DELETE list (exact)

After `PaperPage` compiles against `PaperViewer` and e2e is rewritten:

```text
web/src/PdfReader.tsx
web/src/canvasScale.ts
web/src/zoomSteps.ts
web/src/pdfWindow.ts
web/src/findHits.ts
tests/test_canvas_scale.py
tests/test_page_window.py
tests/test_find_hits.py
```

`grep -R "PdfReader\|canvasScale\|zoomSteps\|pdfWindow\|findHits\|MAX_CANVAS_PIXELS" web src tests` must be empty.

### 8.6 Server / nginx

**WHY / WHAT / HOW:** PDF endpoint behavior is already correct. **NO CHANGE** to routes, Range, ETag, Disposition, linearize.

CSP: start with **NO CHANGE**. If the official viewer throws on wasm/JPX (`wasm-unsafe-eval` required — mozilla/pdf.js#18457), change **only** `script-src` in `security_headers`:

```
script-src 'self' 'wasm-unsafe-eval'
```

Do **not** change `frame-ancestors`, `X-Frame-Options`, or `object-src`. Those protect clickjacking. Official in-page `PDFViewer` does not need framing.

Tests: existing `tests/test_api.py` CSP assertions must be updated **only** if `wasm-unsafe-eval` is added. If you add it, add a comment in the test: “required for pdf.js wasm JPX, not a relaxation of framing.”

---

## 9. PDF Endpoint / HTTP Behavior

| Item | Current | Action |
| --- | --- | --- |
| Public URL | `/paper/{id}/pdf` | **KEEP** — this is the canonical external URL |
| API alias | `/api/v1/papers/{id}/pdf` | **KEEP** |
| Blob / attachment key in URL | Not present | **NO MIGRATION** |
| `Content-Type` | `application/pdf` | KEEP |
| `Content-Length` / HEAD | Yes | KEEP |
| `Accept-Ranges` / 206 | Yes | KEEP |
| ETag / 304 | sha256 of original blob | KEEP |
| `Content-Disposition` | `inline; filename="..."` | KEEP — required for Safari top-level Open PDF |
| `Cache-Control` | `private, max-age=3600` | KEEP — never `public` (宝塔 `proxy_cache` poisoned 206s) |
| Linearized sidecar | `blobs/linearized/...` | KEEP |

Do not invent `/papers/:id/content`.

---

## 10. Security / CSP

| Header | Current | Required | Why |
| --- | --- | --- | --- |
| `X-Frame-Options` | `DENY` | **NO CHANGE** | In-page viewer; not an iframe of the PDF |
| `frame-ancestors` | `'none'` | **NO CHANGE** | Same |
| `object-src` | `'none'` | **NO CHANGE** | No `<object>`/`<embed>` |
| `frame-src` | unset → `default-src 'self'` | **NO CHANGE** | No viewer iframe |
| `worker-src` | `'self' blob:` | **NO CHANGE** | Already correct for pdf.worker |
| `script-src` | `'self'` | **CHANGE only if wasm JPX fails** → `'self' 'wasm-unsafe-eval'` | Official viewer may compile wasm |
| `connect-src` | `'self'` | **NO CHANGE** | Same-origin PDF |
| CORS `ACAO` | absent | **NO CHANGE** | Do not unlock mozilla.github.io |

`X-Frame-Options: DENY` is about **others framing wePaper**, and it also blocks wePaper framing its own PDF. That is fine because we are not framing the PDF.

Do not construct `PDFScriptingManager`. Do not set `enableXfa: true` on `getDocument`.

Unauth sync 401, `openapi.json` 404, public JSON without `checksum` / `attachment_key` / `storage_key` — **KEEP**. Regression: `tests/test_api.py` + production curl in Phase 8.

---

## 11. Desktop Strategy

One stack: official `PDFViewer` in `/paper/:id`.

Open PDF: new tab to `/paper/:id/pdf` (Safari 26.5 and Chrome PDFium: inline). Firefox will show its built-in PDF.js — acceptable.

Do not put a desktop-only `<iframe>` branch in `PaperPage`.

---

## 12. Mobile Strategy

Same `PaperViewer`. Viewport 390×844 @3 is the fidelity gate that today’s 32M cap fails (300% backing === 400% backing). Official detail canvas is the reason we do not split to “mobile = native only.”

If Phase 5 finds iOS Safari cannot scroll/pinch the in-app viewer, **do not** write a second renderer. Document the failure and make Open PDF more obvious. A last-resort iOS branch of `window.location.assign(pdfUrl)` is allowed only after Phase 5 evidence, and it must still leave `/paper/:id` as the shareable URL (e.g. a button, not a 302 of the route).

---

## 13. Performance Preservation

Current production (real IP, isolated cold catalog click → `data-ready` + text):

| | P50 | P95 |
| --- | ---: | ---: |
| Desktop 1440×900 @2 | 1377 ms | 1861 ms |
| Mobile 390×844 @3 | 1343 ms | 2360 ms |

**How to re-bench (mandatory, same method):**

```bash
cd web
WEPAPER_RESOLVE_IP=175.24.134.228 npx playwright test e2e/first-page-bench.spec.ts --reporter=line --workers=1
```

Rewrite the bench **before** deleting `PdfReader`:

- Success = `.reader-scroll[data-first-ready="true"] .page[data-page-number="1"] canvas` visible **and** `canvas.width > 0`.
- Then assert text: `.page[data-page-number="1"] .textLayer` not empty.
- Keep isolated `browser.newContext()` per paper and `Network.setCacheDisabled`.
- Papers: `PSELS7ZT`, `PAS2TSBP`, `MUZIM3FK`, `3FYGRVK7`.
- Assert every sample ≤ 3000 ms; P50 ≤ 2000; P95 ≤ 3000.
- **Delete** the backingWidth 200% vs 300% wePaper-cap assertion. Replace with: after 300% then 400% zoom via `getByLabel("Zoom in")`, a **viewport screenshot crop of body text at 400% is not identical to the 300% crop upscaled** (or: `canvas` of the detail layer exists / `PDFViewer._pages[0].canvas.width` increases, or `enableDetailCanvas` path — if you cannot observe the detail canvas from the DOM, use a visual crop hash inequality at 300 vs 400 on mobile project).
- Warm test: still wait for `caches.match("/paper/PAS2TSBP/pdf")` then reload; expect < 3000 ms (today 308 ms).

Do not time “Opening” or the route change.

Hover `warmPdf` stays — do not start `getDocument` for all nine papers on catalog mount (saturates the link).

---

## 14. Testing Matrix

| Platform | Browser | Reader | 100% | 200% | 300% | 400% | Search | Select | Continuous | Performance |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| macOS | Playwright Chromium 1440×900 @2 | wePaper custom | PASS (measured backing r=2) | PASS | PASS | PASS raster | PASS (existing e2e) | PASS e2e | PASS e2e | PASS V1.2 |
| macOS | Playwright Chromium | official PDFViewer | **implementer** | **implementer** | **implementer** | **implementer** | **implementer** | **implementer** | **implementer** | **implementer** |
| macOS | Safari 26.5 | native `/pdf` | PASS inline | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | PASS visual | NOT TESTED |
| macOS | Safari 26.5 | wePaper custom `/paper/:id` | PASS visual | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | PASS visual | NOT TESTED |
| macOS | Chrome PDFium | native `/pdf` | PASS (Playwright UI) | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | PASS | NOT TESTED |
| macOS | Firefox | any | **NOT TESTED** (Firefox.app absent, no PW WebKit/Firefox install) | — | — | — | — | — | — | — |
| iOS | Mobile Safari | any | **NOT TESTED** | — | — | — | — | — | — | — |
| Android | Chrome | any | **NOT TESTED** | — | — | — | — | — | — | — |
| macOS | Playwright 390×844 @3 | wePaper custom | calc: r=3 | calc: r=3 | **FAIL fidelity** (r=2.708, same backing as 400%) | **FAIL fidelity** (r=2.031, same 4972×6435) | — | — | — | PASS latency |
| — | Zotero Reader | — | **NOT TESTED** | — | — | — | — | — | — | — |

Implementer fills the “official PDFViewer” row in Phase 4/5. Do not invent PASS.

---

## 15. Fidelity Acceptance Test

Run on **one machine, one display**, three papers (`PSELS7ZT`, `3FYGRVK7`, `PAS2TSBP`), four zooms.

Surfaces to open side by side:

1. wePaper `/paper/:id` after this migration
2. Chrome native ` /paper/:id/pdf`
3. Safari native `/paper/:id/pdf`
4. Zotero if the app is running

Hard fail if any of these is true at 300% or 400% on a DPR≥2 display:

- wePaper body text is visibly softer than native (serif stems, thin rules, figure labels)
- wePaper 400% is the same bitmap as 300% (mobile @3 today)
- Embedding applied an extra CSS `transform: scale` on the canvas without a re-render
- A thumbnail/skeleton is left on screen after `data-first-ready=true`

Pass notes must include: paper key, zoom, browser, and whether the official detail canvas engaged.

Loading skeletons are allowed **only** before first page ready.

---

## 16. Rollback

1. **One commit** is the cutover (`Replace custom PdfReader with official PDFViewer`). Everything before that commit stays deployable.
2. Do **not** keep `PdfReader.tsx` in-tree after that commit. Rollback = `git revert` of the cutover commit (or `git checkout <pre-cutover> -- web/src web/e2e tests`).
3. Redeploy: `./deploy/deploy.sh` from the reverted tree.
4. Confirm production `/` still hashes to that commit’s `web/dist/assets/index-*.js`.
5. No feature flag. Two readers in production is forbidden.

Rollback test: `git revert` locally, `uv run pytest -q`, `cd web && npm run build` succeeds.

---

## 17. Migration Phases

Each phase is one reviewable unit. Checkboxes are for the implementing agent.

### Phase 1 — Prototype route is unnecessary; build `PaperViewer` beside the old reader

Do not add `/preview`. Wire `PaperPage` only after Phase 4 benches pass locally. Until then, keep `PdfReader` imported.

- [ ] **Create `web/src/PaperViewer.tsx`** with the code in §8.1 (scripting manager omitted).
- [ ] **Temporarily** render it from a local-only switch: in `PaperPage.tsx` use `const Viewer = new URLSearchParams(window.location.search).has("v2") ? PaperViewer : PdfReader` **only on localhost**. Do not ship `?v2` to production. Remove the switch in Phase 6.
- [ ] Open `http://127.0.0.1:5178/paper/PSELS7ZT?v2=1` (Vite proxy already maps `/paper` → `:8788`).
- [ ] Completion: page 1 canvas visible, text selectable, Library works, Open PDF works.

**Files:** Create `PaperViewer.tsx`. Modify `PaperPage.tsx` (temporary query switch).  
**Rollback:** delete `PaperViewer.tsx`, revert `PaperPage.tsx`.

### Phase 2 — Canonical PDF endpoint

- [ ] Confirm `curl -sSI --resolve wepaper.plainlist.space:443:175.24.134.228 https://wepaper.plainlist.space/paper/PSELS7ZT/pdf` still has `content-type: application/pdf`, `accept-ranges: bytes`, `etag`, `content-disposition: inline`.
- [ ] **NO CHANGE** to `server.py` routes unless wasm CSP is required later.
- [ ] Completion: `pdfUrl()` still returns `/paper/:id/pdf`.

### Phase 3 — Shell + EventBus chrome

- [ ] Delete wePaper `.textLayer` CSS copies.
- [ ] Import `pdfjs-dist/web/pdf_viewer.css`.
- [ ] Wire zoom/find/page as in §8.1. Do not reintroduce `ZOOM_STEPS`.
- [ ] Completion: Fit width default; `+` increases `currentScale`; Cmd-F focuses find; Enter dispatches `find`.

**Files:** `PaperViewer.tsx`, `styles.css`.

### Phase 4 — Desktop fidelity + performance

- [ ] Rewrite `web/e2e/first-page-bench.spec.ts` per §13.
- [ ] Rewrite `web/e2e/library-reader.spec.ts`:
  - Library search unchanged
  - Reader: `getByRole("link", { name: "Library" })`
  - Page 1: `.page[data-page-number="1"] canvas`
  - Scroll: `locator('.page[data-page-number="3"]').scrollIntoViewIfNeeded()`
  - Find: `getByLabel("Find in document")` then `getByPlaceholder("Find")` fill `the`
  - Reload still shows page 1 canvas
- [ ] Run:

```bash
cd web
WEPAPER_RESOLVE_IP=175.24.134.228 npx playwright test e2e/first-page-bench.spec.ts e2e/library-reader.spec.ts --reporter=line --workers=1
```

- [ ] Completion: both specs green on production (or local with `WEPAPER_E2E_URL` if you must iterate — **final** numbers must be production + resolve IP).
- [ ] Side-by-side §15 on desktop Chrome + Safari native vs new wePaper for `PSELS7ZT` at 100/200/300/400%. Write results into `docs/research/v12-benchmarks.md` (allowed extra file at implementation time).

**Rollback:** keep `PdfReader` as default (`?v2` only).

### Phase 5 — Safari / mobile

- [ ] Desktop Safari: `/paper/:id` new viewer — scroll, pinch if trackpad, find, back to Library, Open PDF.
- [ ] iPhone Safari or Simulator: same. Record PASS or NOT TESTED with blocker.
- [ ] Playwright project `mobile` (already 390×844 @3): first-page gate + 300% vs 400% not the same backing.
- [ ] Completion: written matrix row for Safari desktop. Mobile row either PASS or an Open-PDF-only mitigation **documented in the PR**, not a second renderer.

### Phase 6 — Remove custom canvas stack

- [ ] `PaperPage` imports only `PaperViewer`. Remove `?v2`.
- [ ] Delete files in §8.5.
- [ ] `grep` in §8.5 is empty.
- [ ] `uv run pytest -q` — `test_canvas_scale` / `test_page_window` / `test_find_hits` gone; `test_pdf_range` and `test_api` still pass.

**Files:** deletions + `PaperPage.tsx`.  
**Rollback point:** the commit immediately before this one.

### Phase 7 — Regression

- [ ] `uv run pytest -q` (expect 54 if three python files deleted from 57).
- [ ] `cd web && npx tsc --noEmit && npm run build`
- [ ] Production e2e: library-reader + first-page-bench + screenshots.
- [ ] Security curl: sync 401, openapi 404, public paper JSON keys exclude checksum/attachment_key/storage_key.
- [ ] Zotero: if Local API is up, one sync run must still report UNCHANGED for existing items (linearize sidecar). If Zotero is down, mark NOT TESTED — do not skip the command; record the 404.

### Phase 8 — Production cutover

- [ ] One commit, message: `Replace custom PdfReader with official PDF.js viewer.`
- [ ] `./deploy/deploy.sh`
- [ ] `PRODUCTION_JS_BYTE_MATCH`: sha256 of production `/assets/index-*.js` equals `web/dist/assets/index-*.js`.
- [ ] Repeat Phase 4 benches on production.
- [ ] Tag only if the human asks. This plan does not require a release.

---

## 18. Risk Register

| Risk | Level | Mitigation |
| --- | --- | --- |
| Safari / iOS in-app pinch/scroll poor | **HIGH** | Phase 5 gate; Open PDF already works top-level in desktop Safari; no second renderer |
| Official viewer first-page slower than 1.4 s | **HIGH** | Keep `loadPdf` Range transport + persist-after-paint; do not use stock `viewer.html?file=` |
| `pdf_viewer.css` fights wePaper CSS | **MEDIUM** | Delete wePaper `.textLayer`; keep toolbar CSS isolated |
| wasm JPX needs `'wasm-unsafe-eval'` | **MEDIUM** | Add only after a real console error; current 9 papers are text-heavy |
| Bundle +304K `pdf_viewer.mjs` + 260K CSS | **MEDIUM** | Already ship 1.2 MB worker; gzip JS/CSS (nginx already); do not copy full 6.2 MB generic zip |
| Upstream pdf.js upgrade mismatch worker vs viewer | **MEDIUM** | Pin **one** version: stay on 5.7.284 until a dedicated bump of `pdfjs-dist` |
| History / back button vs `PDFHistory` | **MEDIUM** | Initialize with `resetHistory: true`; Library `Link` is React Router, not `history.back()` |
| Large PDFs (5.6 MB STALE) | **LOW** | Same Range path that already meets P95 |
| Firefox inconsistency | **LOW** | Firefox native is PDF.js; in-app is the same engine |
| Print | **LOW** | `window.print()` after viewer ready, or Open PDF + browser print |
| Embedding native after all | **HIGH if pursued** | Do not weaken `frame-ancestors` for a maybe-iframe |

---

## 19. Deleted Technical Debt

| Debt | Fate |
| --- | --- |
| `MAX_CANVAS_PIXELS = 32_000_000` as a product quality cap | **DELETE** from wePaper. Official `maxCanvasPixels` + `enableDetailCanvas` |
| `MAX_DPR = 3` | **DELETE** |
| Custom zoom ladder | **DELETE** |
| Custom page window | **DELETE** |
| Custom find index | **DELETE** |
| Hand-copied `.textLayer` CSS | **DELETE** |
| E2E that asserts wePaper backing widths | **DELETE** |
| Range transport / Cache API / linearized sidecars | **KEEP** — not display debt |

**LOC (measured):**

| | Lines |
| --- | ---: |
| Custom display TS (`PdfReader` + canvasScale + zoomSteps + pdfWindow + findHits) | 497 |
| Fetch TS (`pdfLoader` + `pdfRange`) kept | 134 |
| Target display TS (`PaperViewer`) | ~220 (estimate; do not pad) |
| Reader CSS to delete (`.pdf-page` / `.textLayer` copies) | ~80 |
| Python mirrors deleted | 106 (`test_canvas_scale` 55 + `test_page_window` 18 + `test_find_hits` 33) |

Expected: display code **drops ~50%**. Total wePaper TS related to PDF **does not grow 2×**. If `PaperViewer.tsx` exceeds 350 lines, it is doing too much — split chrome vs `usePdfViewer` hook, do not re-add a renderer.

---

## 20. Definition of Done (implementation, not this research)

- [ ] `PdfReader.tsx` gone; no `page.render` in `web/src`
- [ ] `/paper/:id` still the shareable reader; `/paper/:id/pdf` still raw PDF
- [ ] Official `PDFViewer` + `enableDetailCanvas`
- [ ] Desktop + mobile Playwright first-page P50 ≤ 2 s / P95 ≤ 3 s on production with resolve IP
- [ ] Fidelity §15 recorded for three papers at 100/200/300/400 vs Safari or Chrome native
- [ ] Security headers: framing still denied; sync 401; openapi 404
- [ ] Zotero checksums unchanged if a sync can be run
- [ ] Production JS sha256 matches the cutover commit
- [ ] No feature flag, no second reader

---

## 21. ADR

```text
DECISION

Use:
  Official Mozilla PDF.js viewer components
  (PDFViewer, EventBus, PDFLinkService, PDFFindController, PDFHistory)
  inside the existing wePaper /paper/:id shell,
  fed by the existing 256 KiB Range loadPdf() adapter.

Reject:
  Current custom canvas reader (PdfReader / PdfPage / canvasScale / zoomSteps).
  Browser-native iframe/object/embed as the default in-app surface.
  react-pdf, @react-pdf-viewer/core, Lector, and stock viewer.html iframe.

Why:
  The defect is the display architecture, not the PDF bytes.
  Native top-level /pdf is already sharp (Safari 26.5 and Chrome PDFium)
  but cannot be the in-app reader: production XFO/CSP block embeds
  (measured), Safari iframe is blank, iOS embed is NOT TESTED, and
  /paper/:id must keep Library + title + share URL.
  Official PDFViewer is the Firefox viewer class, already in
  pdfjs-dist 5.7.284, keeps V1.2 Range performance, and has
  enableDetailCanvas so 300% and 400% on DPR 3 are not the same bitmap.
  Wrappers are either dead or another custom page.render().

Alternatives considered:
  A. Native embed after relaxing frame-ancestors on /pdf only —
     unlocks Chromium embed, not a consistent Safari/iOS product,
     and weakens clickjacking on the PDF URL.
  B. Stock viewer.html iframe — second origin of chrome, loses
     Range transport unless forked, requires framing viewer.html.
  C. Raise MAX_CANVAS_PIXELS again — V1.2 already did 16M→32M;
     DPR 3 @ 400% still clamps to the same store as 300%.

Tradeoffs:
  Still a canvas rasterizer (Mozilla’s, not ours). Native PDFKit/PDFium
  can remain slightly sharper; Open PDF is the escape hatch.
  +304 KB viewer JS. Must re-skin/omit Mozilla generic toolbar.
  wasm CSP may need a narrow script-src addition.

Consequences:
  wePaper stops owning page→canvas, zoom math, text layer, find, and
  the 32M cap. wePaper keeps fetch, security, library, and paper identity.
  Implementation is §17. Rollback is revert one commit + deploy.sh.
```

---

## Appendix A — Import paths (pdfjs-dist 5.7.284)

```ts
import * as pdfjs from "pdfjs-dist"; // already used in pdfLoader
import {
  EventBus,
  PDFFindController,
  PDFHistory,
  PDFLinkService,
  PDFViewer,
} from "pdfjs-dist/web/pdf_viewer.mjs";
import "pdfjs-dist/web/pdf_viewer.css";
```

Files on disk: `web/node_modules/pdfjs-dist/web/pdf_viewer.mjs`, `web/pdf_viewer.css`. Do not download the 6.2 MB generic zip for the default path.

## Appendix B — Skills and research provenance

- writing-plans, research, codebase-design, writing-for-agents, wepaper-longrun, wepaper-v12
- [Current Reader Auditor](2272a17e-b883-4aa3-9f9f-1745e7681863) — full file inventory
- [Mature Viewer Investigator](df05022b-593c-4105-b98d-81ecccdd5f50) — native embed blocked; wrappers rejected
- Main-agent benches: Playwright backing-store table; Safari screenshots of `/pdf` and `/paper/:id`; production header curl

## Appendix C — Commands the implementer will run

```bash
# unit
uv run pytest -q

# types + bundle
cd web && npx tsc --noEmit && npm run build

# production e2e (Clash bypass)
cd web
WEPAPER_RESOLVE_IP=175.24.134.228 npx playwright test \
  e2e/first-page-bench.spec.ts e2e/library-reader.spec.ts --workers=1

# deploy (only after Phase 7)
./deploy/deploy.sh

# prove production == this build
curl -sS --resolve wepaper.plainlist.space:443:175.24.134.228 \
  https://wepaper.plainlist.space/ | tr '"' '\n' | rg 'assets/index-'
shasum -a 256 web/dist/assets/index-*.js
```
