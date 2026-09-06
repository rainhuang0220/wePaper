# V1.2 production benchmarks

**Date:** 2026-09-07  
**Origin:** `https://wepaper.plainlist.space`  
**Method:** Playwright Chromium, **isolated browser context per paper**, CDP `Network.setCacheDisabled`, 1440×900 @ DPR 2 and 390×844 @ DPR 3. Metric is click → `[data-testid=pdf-page-1][data-ready=true]` (readable canvas), then text layer is asserted after the clock stops.

## Isolated cold catalog click (all public PDFs under 15 MB)

| Paper | Size | Desktop | Mobile |
| --- | ---: | ---: | ---: |
| `PSELS7ZT` | 228 KB | 839 ms | 840 ms |
| `PAS2TSBP` | 2.7 MB | 2360 ms | 1849 ms |
| `MUZIM3FK` | 1.9 MB | 1896 ms | 2863 ms |
| `3FYGRVK7` | 5.6 MB | 2355 ms | 2854 ms |

| Viewport | P50 | P95 |
| --- | ---: | ---: |
| Desktop 1440×900 @2 | **1896 ms** | **2360 ms** |
| Mobile 390×844 @3 | **1849 ms** | **2863 ms** |

Warm reload of `PAS2TSBP` after Cache API persist: **314 ms**.

## What changed after the adversarial review

- Serve **linearized copies** (`pikepdf`, sidecar under `blobs/linearized/`). Original blobs and sync checksums are unchanged.
- PDF.js uses **Range only** (`disableStream: true`, 128 KB chunks). Streaming a linearized file still waited on the full 2.7 MB GET (~5.9 s). Range `getDocument` + `getPage(1)` is **1.68 s** for Mandol in Node.
- `If-None-Match` → **304**.
- Cache API persist via `doc.getData()` after first page, so the next hard refresh is a local buffer.
- Canvas pixel cap **32e6** so mobile 300% backing is larger than 200%.

## Transport

`application/pdf`, `%PDF`, `Accept-Ranges: bytes`, Range `206`, linearized hint in the first 800 bytes, HEAD `200` + `Content-Length`.
