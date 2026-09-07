# Android reader failure (v1.5.0)

Investigation date: 2026-09-07.  
Broken release: **v1.5.0** / `4bdc8b47c3f37c4028388323211f1eb9afdbe414`.  
Public origin probed: `https://wepaper.plainlist.space` (`--resolve wepaper.plainlist.space:443:175.24.134.228`).  
Real Android runtime: **not available** (`adb` not on PATH; no Android SDK emulator).  
This file records evidence only. Claims are tagged with a source or `NOT VERIFIED`.

## SYMPTOM

Real Android showed a dead reader whose text matches wePaper’s inline-viewer failure state, not a PDF.js l10n string.

- User report: `The PDF can not be opened`.
- Exact string in wePaper (v1.5.0 and current `MobilePaperViewer.tsx`): **`The PDF could not be opened.`**
  - Source: `web/src/MobilePaperViewer.tsx` (v1.5.0 `4bdc8b4`), in the `loadPdf(url).then(...).catch(...)` handler:
    - `.then`: `pdfViewer.setDocument(doc)` + `linkService.setDocument` + `findController.setDocument`
    - `.catch`: `setStatus("The PDF could not be opened.")` — **the `Error` is discarded**.
- Grep of the repo and of `pdfjs-dist@5.7.284` l10n fallback in `pdf_viewer.mjs` (`genericl10n_GenericL10n.#createBundleFallback`):
  - wePaper: only `could not` (not `can not`).
  - PDF.js official strings: `An error occurred while loading the PDF.` / `Invalid or corrupted PDF file.` / `Missing PDF file.` — **not** the user-facing sentence.
- Therefore the on-screen copy is **wePaper’s catch-all**, or a near-paraphrase of it. It is **not** a PDF.js `UnexpectedResponseException` / `InvalidPDFException` message bubbling to the UI.
- That status node is `.reader-status` and is only rendered while `status` is non-empty (`MobilePaperViewer.tsx`). The happy path clears it on `pagerendered` for page 1.

What Android actually executed on v1.5.0 (both paths land on the same component):

1. **Full document load** of `/paper/:id`  
   Server (`4bdc8b4` `src/wepaper/server.py` `public_paper`): `wants_mobile_viewer(headers)` → `spa_html()` (HTML + lazy `PaperPage`). Else 302 `/paper/:id/pdf`.
2. **Client-side catalog tap**  
   `web/src/device.ts` `prefersMobileViewer()` is true when UA matches `/Mobile|iPhone|iPod|iPad|Windows Phone|Android|Tablet|Silk/i` (or `navigator.userAgentData.mobile`).  
   `LibraryPage` `PaperTitle` then uses `<Link to={/paper/:id}>` (React Router). **No server 302.** `PaperPage` always mounts `MobilePaperViewer` with `url = pdfUrl(id)` → `/paper/:id/pdf`.

`/paper/:id/pdf` is always raw `application/pdf` (v1.5.0 policy, still true).  
`/paper/:id/viewer` always serves the SPA viewer (v1.5.0 and now).

Wording gap: report says **can not**; code says **could not**. Closest match is still the wePaper catch-all. An Android system / Downloads-app string was **not** found as an exact match. `NOT VERIFIED` that a native `/pdf` open produced a different OS dialog.

## ROOT_CAUSE

**Proven product cause:** v1.5.0 made Mozilla’s official `pdfjs-dist@5.7.284` `PDFViewer` the default Android reading surface. Any rejection from `loadPdf` or a synchronous throw from `setDocument` is shown as `The PDF could not be opened.` The real PDF.js / DOM exception was never logged. The PDF bytes themselves are not the failure.

**Proven: the inner exception is unknown.**  
`MobilePaperViewer` `.catch(() => { ... })` swallows `reason`. No production telemetry. No real-Android console / stack was captured in this session.

**Proven: Android was sent to that viewer on purpose (v1.5.0).**

| Layer | Rule | Evidence |
| --- | --- | --- |
| Server `reading_surface` | `Sec-CH-UA-Mobile: ?1` → `mobile_viewer`; else UA `Mobile` / `Android` / tablet tokens → `mobile_viewer` | `src/wepaper/device.py`; `tests/test_device.py` (`ANDROID_CHROME`, `ANDROID_TABLET`) |
| Server `/paper/:id` | `wants_mobile_viewer` → `spa_html()` | `4bdc8b4` `server.py` `public_paper` |
| Client catalog | Android UA → `<Link>` client navigation to `/paper/:id` | `4bdc8b4` `web/src/device.ts`, `LibraryPage.tsx` `PaperTitle` |
| Client `/paper/:id` | Always `MobilePaperViewer` | `4bdc8b4` `PaperPage.tsx` |
| PDF.js | `getDocument` + official `PDFViewer` | `web/src/pdfLoader.ts`, `web/src/MobilePaperViewer.tsx` |

Client `prefersMobileViewer()` does **not** read `Sec-CH-UA-Mobile`. A catalog tap on Android therefore uses the inline viewer even if a later full navigation would 302.

**Proven: `/pdf` transport is a valid ranged PDF (not HTML, not empty).**  
`GET https://wepaper.plainlist.space/paper/PSELS7ZT/pdf` with Android UA + `Range: bytes=0-7` (this session):

- `206`
- `content-type: application/pdf`
- `content-range: bytes 0-7/230775`
- `accept-ranges` implied by 206 + `Content-Range`
- body magic: `%PDF-1.7` (`xxd`)
- `cache-control: private, max-age=3600` (not `no-store`)
- `content-disposition: inline; filename="Li ? - 2026 - …pdf"` (literal `?` in the filename as served)

Same pattern on `PAS2TSBP` (`206`, `bytes 0-7/2706503`, `application/pdf`).  
`pdfLoader.openPdf` first requests `bytes=0-(MAX_RANGE_BYTES-1)` (`MAX_RANGE_BYTES = 262144`). For `PSELS7ZT` (230 775 bytes) that first span is the whole file → `getDocument({ data })`, no `FetchRangeTransport`. A failure on this paper is therefore **not** “Range transport assembled the wrong length.”

**Proven: worker URL and MIME are valid on production HTTPS.**  
Viewer HTML (`GET /paper/PSELS7ZT/viewer`, this session) injects:

```html
<link rel="preload" href="/assets/pdf.worker.min-iDqQPrd3.mjs" as="script" crossorigin />
```

`GET` that worker: `200`, `content-type: application/javascript`, `content-length: 1232303`, `cache-control: public, max-age=31536000, immutable`, `x-content-type-options: nosniff`.  
Built `PaperPage` sets `GlobalWorkerOptions.workerSrc` to `new URL("/assets/pdf.worker.min-iDqQPrd3.mjs", …)` (hashed asset, not `./pdf.worker.mjs`).  
`GET /paper/pdf.worker.mjs` → `404 {"detail":"not found"}` — only matters if `workerSrc` were empty (PDF.js default `./pdf.worker.mjs`). It is not.

PDF.js 5.7.284 constructs `new Worker(workerSrc, { type: "module" })` (`web/node_modules/pdfjs-dist/build/pdf.mjs` `#initialize`). CSP on HTML and on the worker: `worker-src 'self' blob:; script-src 'self'` (no `'wasm-unsafe-eval'`). Middleware: `src/wepaper/server.py` `security_headers`.

**Proven: missing wasm/cmaps is not enough to explain page-1 failure on desktop Blink.**  
`pdfLoader.getDocument` does not pass `wasmUrl` / `cMapUrl` / `standardFontDataUrl`. PDF.js then sets `useWorkerFetch` false (`pdf.mjs` `getDocument`).  
`GET /wasm/qcms_bg.wasm` → `200 content-type: text/html` (SPA `index.html`, 495 bytes) — a trap if anything fetched that URL expecting wasm.  
This session’s Chromium probe still painted page 1 of `PSELS7ZT` without a wasm 200 of `application/wasm`.

**Proven: Android User-Agent + `Sec-CH-UA-Mobile: ?1` is not sufficient to reproduce the symptom in desktop Chromium.**  
New Playwright `chromium.launch` (this session, not the v1.5.0 bench), `https://wepaper.plainlist.space/paper/PSELS7ZT/viewer`, viewport 390×844, DSF 3, `isMobile`/`hasTouch`, `--host-resolver-rules=MAP wepaper.plainlist.space 175.24.134.228`:

| Context | `.reader-status` | `[data-first-ready=true]` | page-1 `canvas` |
| --- | --- | --- | --- |
| Android 14 Pixel 8 UA + `Sec-CH-UA-Mobile: ?1` | `null` (no error) | 1 | 1 |
| iPhone UA + `Sec-CH-UA-Mobile: ?1` | `null` | 1 | 1 |

Network on both: `GET /paper/PSELS7ZT/pdf` → `206 application/pdf`; worker `200 application/javascript` **twice** (preload + Worker).  
Console (both):  
`The resource https://wepaper.plainlist.space/assets/pdf.worker.min-iDqQPrd3.mjs was preloaded using link preload but not used within a few seconds from the window's load event.`  
That is Chromium saying `as="script"` preload **did not feed** `new Worker(..., { type: "module" })`. Desktop Blink then fetched the worker again and succeeded. Whether real Android Chrome treats the unused preload as fatal is **NOT VERIFIED**.

PDF.js Android-only compat (`pdf_viewer.mjs`): `/Android/.test(userAgent)` → `useSystemFonts: false` and `maxCanvasPixels: 5242880`. The Android-UA probe above **did** take that branch and still painted. So UA-triggered compat params alone do not reject `loadPdf` on desktop Blink.

**Ruled out as the sole cause (evidence above):** corrupt/non-PDF bytes; server sending HTML at `/pdf`; missing `Accept-Ranges`; worker served as `text/html`; `workerSrc` pointing at `/paper/pdf.worker.mjs`; Android UA string alone; `Sec-CH-UA-Mobile` alone; zero-size 390×844 container; `Promise.withResolvers` missing in current Chromium; wasm 404 for this first page on desktop Blink.

**NOT VERIFIED (would need a real Android Chrome / WebView + uncaught `reason`):**

- Module worker failure on a specific Android Chrome / WebView build (fake-worker `import(workerSrc)` then also fails).
- Preload `as="script" crossorigin` poisoning the worker cache only on Android (desktop only warns).
- `script-src 'self'` blocking `WebAssembly.instantiate` on a PDF that needs JPX/JBIG2/QCMS (`wasm-unsafe-eval` absent). `PSELS7ZT` page 1 did not need it in Blink.
- `caches` (`wepaper-pdf-v12`) returning a bad body on a later visit (`openPdf` prefers cache over Range). First visit misses cache.
- `fetchSpan` ignoring `response.ok` / status (`web/src/pdfLoader.ts`) if a real-device fetch returned a non-PDF body without `Content-Range` (`parseTotalLength` then treats the body length as the whole PDF).
- `PDFViewer` constructor / `setDocument` throw (`container` not `position:absolute` when `offsetParent` is set). CSS `.reader-scroll` is `position: absolute; inset: 0`. Did not throw in the Blink probe.
- Older Android Chrome without APIs used by the **modern** (non-`legacy/`) `pdfjs-dist` build.
- Native Android PDF UI after a later `/pdf` navigation (`object-src 'none'` is on the PDF response; desktop PDFium still opens `/pdf`. Android built-in viewer vs CSP is **NOT VERIFIED**).

**Runtime honesty:** no ADB device, no emulator. The inner Android exception is **NOT VERIFIED**. A reliable official-PDF.js patch cannot be proven from this evidence.

## WHY_DESKTOP_MOBILE_EMULATION_MISSED_IT

v1.5.0 `web/playwright.config.ts` project `mobile` is **not Android Chrome**:

```ts
...devices["Desktop Chrome"],
browserName: "chromium",
viewport: { width: 390, height: 844 },
deviceScaleFactor: 3,
isMobile: true,
hasTouch: true,
userAgent: IPHONE_UA,  // iPhone Safari UA, not Android
extraHTTPHeaders: { "Sec-CH-UA-Mobile": "?1" },
```

That stack:

1. Uses **desktop Blink / PDFium / module-worker** implementation, not Android Chrome or Android WebView.
2. Sends an **iPhone** UA, so PDF.js `isAndroid` is false (`/Android/.test(userAgent)`). iOS compat (`maxCanvasPixels`) applies; **`useSystemFonts: false` does not.**
3. Still sets `Sec-CH-UA-Mobile: ?1` and `isMobile: true`, so **server and client both choose `mobile_viewer`** and the test exercises the official `PDFViewer` — then **passes** (`4bdc8b4` `web/e2e/library-reader.spec.ts`: URL stays `/paper/:id`, `.reader-scroll[data-first-ready=true]`, page-1 canvas, find, zoom).
4. `v15-bench-click-mobile.json` (P50 1363 ms / P95 2377 ms) is the same Playwright project, not a phone.
5. Client-nav vs full load were both tested **in that desktop Chromium**. Both can pass while a real Android engine fails.
6. The catch-all UI string never appears if `getDocument` resolves — a PASS does not record the exception a phone would have thrown.
7. This session’s **new** Android-UA Playwright probe also **passed**. UA spoofing cannot substitute for Android Chrome.

Prefetch / cache: v1.5.0 library calls `prefetchPdfRuntime()` on mobile (`<link rel="preload" as="script" crossorigin>`). Full `/paper/:id` HTML injects the same preload (`spa_html`). Chromium logs that this preload is **unused** by the Worker. Emulation treats that as a warning. Real Android: **NOT VERIFIED**.

## FIX_OPTIONS

1. **Raw `/pdf` fallback (server + catalog).**  
   `GET/HEAD /paper/:id` → **302** `Location: /paper/:id/pdf` for every client, including Android. Catalog titles are real `<a href="/paper/:id">` (full document navigation), not React Router into `MobilePaperViewer`. Keep `/paper/:id/viewer` for investigation only.  
   Evidence this is already how desktop v1.5.0 worked, and how production responded at 13:58Z this session (Android / iPhone / desktop all 302). Homepage `last-modified: 2026-09-07 13:57:28 GMT`, catalog `/assets/index-ThOueBBN.js` (not v1.5.0 `/assets/index-CYw1oMTK.js`).

2. **Official-PDF.js mobile-only hardening (unproven).**  
   Candidates, each requiring a **real Android** red/green loop before shipping:
   - Stop swallowing errors; surface `String(err)` (or `err.message`) so the next phone report is actionable.
   - Create the worker with `GlobalWorkerOptions.workerPort = new Worker(url, { type: "module" })` (as `pdfjs-dist/webpack.mjs` does); drop `as="script"` preload; use `rel="modulepreload"` or `as="worker"` if the browser supports it.
   - Import `pdfjs-dist/legacy/build/pdf.mjs` + legacy worker if the failing devices are old WebViews.
   - Set `wasmUrl` / `cMapUrl` / `standardFontDataUrl` to real hashed assets; do not let `/wasm/*.wasm` fall through to `index.html`.
   - Add `'wasm-unsafe-eval'` only if a captured stack shows wasm compile blocked.
   - Check `response.ok` and `Content-Range` in `fetchSpan`; do not call `getDocument({ data })` on a truncated body.
   None of these is proven to be the Android exception.

3. **Do not treat “fix PDF.js until Playwright mobile passes” as a fix.**  
   That loop already passed on v1.5.0 and still passes with an Android UA on desktop Chromium.

## CHOSEN_FIX

**Use raw `/pdf` fallback.** Do not ship another official-PDF.js mobile-default until a real Android Chrome/WebView run captures the swallowed `loadPdf` rejection and a patch turns that same run green.

Reason: this investigation **cannot prove a reliable inline fix**. The only proven facts are (1) v1.5.0 Android hits `MobilePaperViewer` + a silent `catch`, (2) `/paper/:id/pdf` is a real ranged PDF, (3) desktop Chromium — including Android UA — opens the official viewer, (4) no Android device/emulator was here.

`/paper/:id/viewer` may remain as an explicit escape hatch for desktop debugging. It must not be the catalog default.

## FALLBACK

**Mobile `/paper/:id` → 302 `/paper/:id/pdf` is acceptable.**

- Same bytes Android would have fetched via `loadPdf` (`pdfUrl` → `/paper/:id/pdf`).
- Same contract as desktop v1.4/v1.5 (`Cache-Control: private, no-store` + `Vary: Sec-CH-UA-Mobile, User-Agent` on the 302; PDF itself stays `application/pdf` + Range).
- Avoids official `PDFViewer` initialization, module workers, wasm, and the swallowed catch.
- Catalog must not client-navigate into `PaperPage`/`MobilePaperViewer` on Android, or the 302 is bypassed (that was the v1.5.0 `Link` path).

Residual risk, **NOT VERIFIED** on a phone: Android Chrome’s native PDF viewer vs `Content-Security-Policy` `object-src 'none'` on the PDF response, and vs `Content-Disposition` filenames containing `?`. Desktop Chrome PDFium opens these URLs. If a phone still fails after the 302, capture **that** UI/console — it is a different bug than `MobilePaperViewer`’s catch-all.
