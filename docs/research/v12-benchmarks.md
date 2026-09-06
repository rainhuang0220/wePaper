# V1.2 production benchmarks

**Date:** 2026-09-07  
**Origin:** `https://wepaper.plainlist.space` (`175.24.134.228`)  
**Method:** Playwright Chromium with `--host-resolver-rules=MAP wepaper.plainlist.space 175.24.134.228` (Clash fake-IP bypass), **isolated browser context per paper**, CDP `Network.setCacheDisabled`, 1440×900 @ DPR 2 and 390×844 @ DPR 3. Metric is click → `[data-testid=pdf-page-1][data-ready=true]` (readable canvas), then text layer is asserted after the clock stops.

## Isolated cold catalog click (all public PDFs under 15 MB)

| Paper | Size | Desktop | Mobile |
| --- | ---: | ---: | ---: |
| `PSELS7ZT` | 228 KB | 1336 ms | 846 ms |
| `PAS2TSBP` | 2.7 MB | 1377 ms | 2360 ms |
| `MUZIM3FK` | 1.9 MB | 1861 ms | 1343 ms |
| `3FYGRVK7` | 5.6 MB | 1855 ms | 1855 ms |

| Viewport | P50 | P95 |
| --- | ---: | ---: |
| Desktop 1440×900 @2 | **1377 ms** | **1861 ms** |
| Mobile 390×844 @3 | **1343 ms** | **2360 ms** |

Warm reload of `PAS2TSBP` after Cache API persist: **308 ms**.

## What changed after the v1.2.0 adversarial review

- Serve **linearized copies** (`pikepdf`, sidecar under `blobs/linearized/`). Original blobs and sync checksums are unchanged.
- Custom `PDFDataRangeTransport` that never issues a single Range larger than **256 KiB**. A 378–512 KB Range on this path takes ~3.5 s; two parallel 256 KiB Ranges cover the first page in ~0.6 s. Node `getDocument` + `getPage(1)` for Mandol on the real IP is **825 ms**.
- `doc.getData()` / Cache API persist waits until **after** the first canvas is painted, so the remaining file does not contend with page 1.
- `If-None-Match` → **304**.
- Canvas pixel cap **32e6** so mobile 300% backing is larger than 200%.

Earlier “passing” benches that resolved `wepaper.plainlist.space` through Clash (`198.18.x`) are not production numbers.

## Transport

`application/pdf`, `%PDF`, `Accept-Ranges: bytes`, Range `206`, linearized hint in the first 800 bytes, HEAD `200` + `Content-Length`.
