# v1.4.0 release provenance

**Commit:** `63cd9775932ca8021d27a4610825299e537f78ad` (native PDF default; follow-up commits may record benches only)  
**Production origin:** https://wepaper.plainlist.space (`175.24.134.228`)  
**Bundle:** `/assets/index-BAGeQMXW.js`  
**SHA-256:** `2bcd17c7f833ae60cd4133842c903e9fdff848229dbfa82142e7e45254523896`

Local `web/dist/assets/index-BAGeQMXW.js` matches production byte-for-byte.

## Product

- Catalog title `href` is `/paper/{id}/pdf` (full document navigation).
- `GET/HEAD /paper/{id}` → **302** `Location: /paper/{id}/pdf`.
- Default reader is the browser-native PDF viewer.
- In-app PDF.js viewer **removed**.

## Production benches (click title → PDF `application/pdf` response)

| Surface | P50 | P95 |
| --- | --- | --- |
| Desktop | 113 ms | 132 ms |
| Mobile viewport | 123 ms | 130 ms |

Gate: P50 ≤ 2.0 s, P95 ≤ 3.0 s. Pass.
