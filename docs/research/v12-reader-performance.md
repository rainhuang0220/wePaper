# V1.2 Reader Performance Investigation

**Date:** 2026-09-07  
**Production:** `https://wepaper.plainlist.space`  
**Example paper:** `/paper/PSELS7ZT` · PDF `/paper/PSELS7ZT/pdf`  
**Method:** `curl --resolve wepaper.plainlist.space:443:175.24.134.228` (Clash fake-ip bypass) + Node `pdfjs-dist@5.7.284` chain replay matching `PaperPage.tsx` / `PdfReader.tsx`.

---

## Executive summary

The **"Opening"** label is shown in **two sequential gates**:

1. **`PaperPage`** — renders toolbar "Opening" while `hasPdf === null`, waiting on `GET /api/v1/papers/{id}` before mounting `PdfReader`.
2. **`PdfReader`** — renders `<p class="reader-status">Opening</p>` until `pdfjs.getDocument().promise` resolves **and** `doc.getPage(1)` completes, then `setStatus("")`.

**"Opening" does not wait for** pages 2…N dimensions, canvas paint, or the full-document text index. Those run after status clears (dimensions loop immediately after; text index in a parallel `useEffect`).

The **~10 s** symptom aligns with **cold full-PDF transfer time** on the largest public blob (`3FYGRVK7`, 5.5 MB → **11,616 ms** mean full GET) combined with **`Cache-Control: private, no-store`** (no browser reuse) and **default PDF.js auto-fetch** pulling far more than the first page needs. On degraded runs, **`getDocument` alone reached 6,235 ms** for the 227 KB example paper before `getPage(1)`.

---

## Public papers — PDF `Content-Length`

All 9 public papers have PDFs. Headers on every `HEAD /paper/{key}/pdf`: `accept-ranges: bytes`, `cache-control: private, no-store`.

| Key | Content-Length | Linearized | Pages | Title (truncated) |
|-----|---------------:|------------|------:|-------------------|
| `3FYGRVK7` | 5,568,857 | no | 37 | STALE: can LLM agents know when their memories… |
| `PAS2TSBP` | 2,705,358 | no | 10 | Mandol: an agglomerative agent memory system… |
| `MUZIM3FK` | 1,895,106 | **yes** | 33 | Evaluating memory in LLM agents via incremental… |
| `WHHTS5AT` | 1,651,172 | no | — | From recall to forgetting… |
| `LP4WBCGF` | 1,099,677 | no | — | Beyond dialogue time… |
| `C8TQ6QR5` | 938,990 | no | — | A-mem: agentic memory for LLM agents |
| `7DPYRDQS` | 922,404 | no | — | Chain-of-memory… |
| `GC4SIRTQ` | 749,169 | no | — | LongMemEval… |
| `PSELS7ZT` | 227,651 | no | 5 | Remember, verify, or ask?… |

---

## Timing table (production, 2026-09-07)

Times in **milliseconds**. Curl: 5 samples mean. Node chain: `fetchPaper` → `getDocument` → `getPage(1)` (Opening-clear point).

### Network (curl → `175.24.134.228`)

| Step | PSELS7ZT (227 KB) | 3FYGRVK7 (5.5 MB) | PAS2TSBP (2.7 MB) |
|------|------------------:|------------------:|------------------:|
| `GET /api/v1/papers/{id}` TTFB | 230 | 242 | 254 |
| `GET /paper/{id}/pdf` full body total | 583 | **11,616** | 5,506 |
| `GET` Range `bytes=0-65535` total | 1,026 | 1,400 | 1,187 |
| `GET` Range `bytes=0-1023` TTFB | 261 | 249 | 244 |

### PDF response headers (PSELS7ZT)

| Header | Value |
|--------|-------|
| `content-type` | `application/pdf` |
| `content-length` | `227651` |
| `cache-control` | `private, no-store` |
| `accept-ranges` | `bytes` |
| `etag` | `"1d9e9ee3019784bc9aa843a7849071595ec57d74ef0f8a3e0f61d973bafce35d"` |

Range probe: `Range: bytes=0-1023` → **HTTP 206**, body starts `%PDF-1.7`.

### Application chain (Node replay of frontend logic)

| Step | PSELS7ZT | 3FYGRVK7 | Notes |
|------|----------|----------|-------|
| Metadata `fetchPaper` | 88–639 | 77–149 | Blocks `PdfReader` mount |
| `getDocument` resolved | 360–6,235 | 382–2,113 | Bytes at resolve often 64–524 KB, not full file |
| **`getPage(1)` → Opening clears** | **447–6,236** | **382–2,113** | Same tick as `setStatus("")` in code |
| Pages 2…N `getPage` (sizes loop) | 0–1,691 | 1–3 | **After** Opening clears |
| Full-document `getTextContent` index | 1,679–2,598 | 9,290–28,399 | Background `useEffect`; does **not** hold Opening |

### Default vs `disableAutoFetch: true` (Opening-clear, 3 runs)

| Paper | Default `getDocument` params | `disableAutoFetch: true` |
|-------|------------------------------|---------------------------|
| PSELS7ZT | 898 / 1,104 / 1,088 ms | 447 / 360 / 1,129 ms |
| 3FYGRVK7 | 507 / 382 / 2,113 ms | 1,375 / 506 / 1,298 ms |

Default auto-fetch often pulls **131–524 KB** before `getDocument` resolves even when Opening clears earlier on fast runs.

---

## Instrumented chain (code ↔ measurement)

```
Library click (Link, no debounce)
  └─ react-router navigate → PaperPage mount                    ~0 ms
       └─ hasPdf=null → UI "Opening" (PaperPage toolbar)       [GATE 1]
            └─ GET /api/v1/papers/{id}                          230 ms TTFB (curl)
                 └─ setHasPdf(true) → mount <PdfReader>
                      └─ status="Opening"                       [GATE 2]
                           └─ pdfjs.getDocument({ url })         382–6,235 ms (Node)
                                └─ worker: pdf.worker.min.mjs   1,232,303 B bundle, cold load
                                └─ HTTP Range if accept-ranges  yes (206 verified)
                                └─ disableAutoFetch: false      auto-fetches further chunks
                           └─ doc.getPage(1)                     same ms as getDocument (typ.)
                                └─ setStatus("") → hide Opening
                           └─ loop getPage(2..N) for sizes      0–1,691 ms (non-blocking)
                           └─ useEffect: getTextContent 1..N    1.7–28 s (parallel, not Opening)
                                └─ PdfPage canvas+TextLayer     lazy ±2 pages via pageWindow()
```

### Key source locations

| Behavior | File | Lines | Measured impact |
|----------|------|-------|-----------------|
| Metadata gate before reader | `web/src/pages/PaperPage.tsx` | 25–36, 47–64 | **230 ms** TTFB; PdfReader not mounted until done |
| Opening until page 1 parsed | `web/src/PdfReader.tsx` | 46–69 | **382–6,236 ms** to clear status |
| All-page sizes after open | `web/src/PdfReader.tsx` | 72–81 | 0–1,691 ms; does **not** block Opening |
| Full-text index | `web/src/PdfReader.tsx` | 92–108 | 1.7–28 s; parallel, not Opening |
| Worker URL | `web/src/PdfReader.tsx` | 7–10 | `pdf.worker.min.mjs` via `import.meta.url` |
| No range/autoFetch tuning | `web/src/PdfReader.tsx` | 53 | `{ url, withCredentials: false }` only |
| PDF no-store | `src/wepaper/server.py` | 188–189 | Every open cold download |
| Library search debounce | `web/src/pages/LibraryPage.tsx` | 44–55 | **160 ms**; **not** on paper click |

---

## Does PDF.js wait for the full file?

| Condition | Behavior | Evidence |
|-----------|----------|----------|
| `accept-ranges: bytes` present (production) | `NetworkPdfManager` created at **headers ready**; `getDocument` can resolve with **partial** bytes | 3FYGRVK7 resolved at **382–2,113 ms** with **131 KB–720 KB** loaded (Node) |
| Range unavailable / stream fallback | Worker buffers **entire** stream before resolve (`LocalPdfManager`) | `pdf.worker.mjs` ~62588–62592 |
| `disableAutoFetch: false` (default) | After open, fetches **remaining chunks** automatically | PSELS7ZT run 1: progress to **227,651/227,651** before resolve (**648 ms**) |
| Non-linearized PDFs (8/9 papers) | Needs **tail xref** fetch (not full file, but extra round trips) | `pdfinfo`: Optimized **no** except `MUZIM3FK` |

**Conclusion:** PDF.js does **not** strictly require the full file before `getDocument` when Range works, but **default auto-fetch** often downloads the **entire** small PDF and **megabytes** of large PDFs on the critical path or saturating the connection. Worst-case **full GET** for `3FYGRVK7` = **11,616 ms**, matching user **~10 s** reports on large papers / slow links.

---

## Ranked bottlenecks (with numbers)

| Rank | Bottleneck | ms (measured) | Why it drives "Opening" |
|------|------------|---------------|-------------------------|
| **1** | **Cold PDF byte transfer** (`private, no-store` + auto-fetch / full GET) | **11,616** full GET (`3FYGRVK7`); **583** (`PSELS7ZT`) | No cache; default PDF.js pulls 131 KB–full file before or during open; large files match ~10 s |
| **2** | **`getDocument` + `getPage(1)` on slow/congested network** | **6,235** worst (`PSELS7ZT` Node); **2,113** p95 (`3FYGRVK7`) | Gate 2: status stays "Opening" until both complete |
| **3** | **Metadata waterfall** (`fetchPaper` before `PdfReader`) | **230** curl TTFB; **639** max Node | Adds fixed latency; prevents overlapping PDF fetch with metadata |
| 4 | PDF.js worker cold load | **1,232,303 B** file | First visit only; no preload/prefetch in app |
| 5 | Full-document text index (post-Opening) | **28,399** (`3FYGRVK7`) | Does not show "Opening" but steals worker/CPU after open |
| 6 | Pages 2…N dimension loop (post-Opening) | **1,691** (`MUZIM3FK`, 33 pp) | Does not hold Opening; can delay layout refinement |

**Not a bottleneck for Opening:** Library search debounce (160 ms, search only). Canvas render (runs after status clear). Lazy `pageWindow(±2)` render set.

---

## Recommended fixes (priority order)

### 1. Remove metadata waterfall (est. **−230 ms** immediate)

- Mount `PdfReader` immediately from route param: `pdfUrl(id)` needs no metadata.
- Fetch title/`has_pdf` in parallel for document title and error shell only.
- Optionally embed `has_pdf` + size in library list JSON to skip per-paper metadata on click.

### 2. First-page-first PDF.js config (est. **−400–5,000 ms** on small/medium PDFs)

```ts
pdfjs.getDocument({
  url,
  withCredentials: false,
  disableAutoFetch: true,   // stop downloading whole file after page 1
  disableStream: false,
  rangeChunkSize: 65536,
})
```

- Clear `status` after `getPage(1)` only (already true); **defer** pages 2…N sizes to `requestIdleCallback` or default viewport placeholders.
- Set `standardFontDataUrl` to avoid font warnings / retries on large papers.

### 3. Enable caching (est. **−583–11,616 ms** on repeat opens)

Change `get_pdf` headers in `server.py`:

```python
"Cache-Control": "public, max-age=86400, immutable"  # ETag already set
```

Keep auth-free public papers cacheable at CDN/browser. `no-store` forces full re-download every click.

### 4. Keep Range (already working)

- Production already serves `accept-ranges: bytes` and **206** partial content.
- Ensure nginx/proxy forwards Range; do not set `disableRange: true` in PDF.js.

### 5. Defer full-text search index

- Build `pageTexts` lazily (visible pages first) or on first Cmd+F.
- Removes **9–28 s** worker contention after open on 37-page PDFs.

### 6. Worker warmup (first visit)

- `<link rel="modulepreload">` for `pdf.worker.min.mjs` on library page or after first paint.

---

## Target validation

Per V1.2 skill: cold click → readable first page **P50 ≤ 2.0 s / P95 ≤ 3.0 s** for ordinary PDFs under ~15 MB.

Current measured Opening-clear (metadata + `getPage(1)`):

| Paper | Size | Opening-clear (typical) | Opening-clear (worst Node) | Full GET (curl) |
|-------|------|-------------------------|----------------------------|-----------------|
| PSELS7ZT | 227 KB | ~1,000 ms | 6,874 ms | 583 ms |
| 3FYGRVK7 | 5.5 MB | ~500 ms | 2,190 ms | **11,616 ms** |
| PAS2TSBP | 2.7 MB | ~1,100 ms | 10,346 ms* | 5,506 ms |

\*Worst run included background text indexing in total wall time; Opening cleared at ~1,053 ms.

Fixes **#1–#3** address the gap to the 2 s P50 gate.

---

## Files referenced

| File | Role |
|------|------|
| `web/src/pages/PaperPage.tsx` | Metadata gate + first "Opening" |
| `web/src/PdfReader.tsx` | PDF.js load, second "Opening", sizes/text |
| `web/src/pages/LibraryPage.tsx` | Paper list (160 ms search debounce only) |
| `web/src/api.ts` | `fetchPaper`, `pdfUrl` |
| `src/wepaper/server.py` | `get_pdf`, `Cache-Control: private, no-store` |
| `docs/pdf-reader-audit.md` | V1.1 transport audit (Range, URLs) |
