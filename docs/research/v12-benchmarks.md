# V1.2 production benchmarks

**Date:** 2026-09-07  
**Origin:** `https://wepaper.plainlist.space`  
**Method:** Playwright Chromium, cache disabled via CDP, 1440×900 @ deviceScaleFactor 2 and 390×844 @ 3. Metric is click → `[data-testid=pdf-page-1][data-ready=true]` (readable canvas), not route change.

Raw JSON: `v12-bench-click-*.json`, `v12-bench-direct-*.json`, `v12-bench-p50-desktop.json`.

## Root cause of the ~10 s open

Three stacked defects, in order of impact:

1. **Full-file stream.** PDF.js default `disableStream: false` started a GET of the entire blob (`3FYGRVK7` 5.57 MB → 11.6 s). First page now uses `disableStream: true`, `disableAutoFetch: true`, Range chunks.
2. **宝塔 `proxy_cache cache_one`.** A `Range: bytes=0-65535` (or 0-1023) response was stored as the cached object. Public GET then returned `206` + 64 KB / 1 KB and PDF.js failed to open Mandol/STALE. Fix: `proxy_cache off` on the wePaper vhost + `Cache-Control: private, max-age=3600` (never `public` on ranged PDFs).
3. **Metadata waterfall + `gzip off` for JS.** Reader waited on `GET /api/v1/papers/{id}` before mounting; nginx disabled gzip for the whole vhost (to protect PDF ranges) and shipped the 1.2 MB worker uncompressed. Reader now mounts immediately; gzip is on for JS/CSS/JSON only; the worker is `modulepreload`ed.

## Cold catalog click (desktop, 2026-09-07)

| Paper | Size | First page | Notes |
| --- | ---: | ---: | --- |
| `PSELS7ZT` | 228 KB | **329–845 ms** | Full small file; high-DPI canvas 2736×3540 vs CSS 1368×1770 (DPR 2) |
| `PAS2TSBP` | 2.7 MB | 4.4–5.8 s | Range first-page (~0.5–1.5 MB), not 2.7 MB |
| `MUZIM3FK` | 1.9 MB linearized | 3.8–5.3 s | Range / linearized |
| `3FYGRVK7` | 5.6 MB | 7.4–11.9 s | First-page ranges ~1.8 MB; path-bound (curl 512 KB ≈ 0.9 s, Chromium first range 2.5–5 s) |

**Ordinary small paper (repeated clicks, `PSELS7ZT`):** first cold sample 377 ms; later samples 105–246 ms (in-memory `pdfLoader` reuse). Conservative cold P50 **360 ms**, P95 **845 ms**.

**Warm direct `/paper/:id`:** 116–235 ms.

## Quality

- Transport: `Content-Type: application/pdf`, `%PDF`, `Accept-Ranges: bytes`, GET `206` + `Content-Range`.
- HEAD `/paper/{id}/pdf` → 200 + `Content-Length` (PDF.js size probe).
- Backing canvas = CSS × DPR (cap 3, 16 777 216 pixels).
- Zoom ladder to 400%; 200% backing width ≥ 1.6× the 100% backing (re-render, not CSS stretch).
- Continuous scroll + find + text layer preserved (Playwright `library-reader` passed).
