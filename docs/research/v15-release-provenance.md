# v1.5.0 release provenance

**Commit:** `4bdc8b47c3f37c4028388323211f1eb9afdbe414`  
**Production origin:** https://wepaper.plainlist.space (`175.24.134.228`)  
**Catalog bundle:** `/assets/index-CYw1oMTK.js`  
**SHA-256:** `ba340f4dc64c6d13c5dca3a969051bd978b0c7bf6780f8f88ed00448e6d2aeda`  
**Viewer chunk:** `/assets/PaperPage-CTMtl3US.js`  
**SHA-256:** `f0c4e4ee9575f32560f0b0ac62961c1bfc2911875e2c78e649a03d7cedad478b`

Local `web/dist` hashes match production byte-for-byte. `dist/` is gitignored; this file is the provenance record.

## Product

- Catalog title `href` is `/paper/{id}` (not `/pdf`).
- Desktop `GET/HEAD /paper/{id}` → **302** `Location: /paper/{id}/pdf` with `Cache-Control: private, no-store` and `Vary: Sec-CH-UA-Mobile, User-Agent`.
- Mobile `/paper/{id}` → HTML + lazy official PDF.js `PDFViewer`.
- `/paper/{id}/pdf` is always raw `application/pdf` on every device.
- Reading status is server-persisted; owner cookie writes; public read-only.

## Production benches (click title → first readable page)

| Surface | P50 | P95 |
| --- | --- | --- |
| Desktop native PDF | 195 ms | 225 ms |
| Mobile viewer | 1363 ms | 2377 ms |

Gate: P50 ≤ 2.0 s, P95 ≤ 3.0 s. Pass.

Desktop Safari / iOS Safari: **NOT TESTED**.
