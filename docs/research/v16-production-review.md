# v1.6.0 final production review

**Reviewer.** Subagent D (independent).  
**Origin.** https://wepaper.plainlist.space  
**When.** 2026-09-07 ~14:21–14:27 UTC.  
**Constraint.** No POST/PATCH. No comments, replies, likes, or reading-status writes on production papers.

**Verdict.** No HIGH. No MEDIUM. `HIGH_MEDIUM_COUNT = 0`.

| Gate | Result |
| --- | --- |
| STATUS_UI_REVIEW | PASS |
| COMMENTS_SURFACE | PASS |
| DESKTOP_READING | PASS |
| ANDROID_READING | PASS |
| PRODUCTION_FAKE_STATUSES | PASS |
| PRODUCTION_TEST_COMMENTS | PASS |
| PRODUCTION_MATCHES_RELEASE | PASS |

---

## Evidence

### Catalog JS / release

- Homepage HTML (`GET /`, `content-type: text/html`) references `/assets/index-DgM47mMh.js`.
- SHA-256 of that file: `77f5ecd4149858840894b8357dde344878fca78e48803b16ae2a94dbdf10d493` (matches expected and `docs/research/v16-release-provenance.md`).
- CSS `/assets/index-CAokWa4p.css` SHA-256: `6d28a849944373178882f90e9e4d7e6a7621734eb34023e94bf549cc1bc8d12d`.
- [GitHub release v1.6.0](https://github.com/rainhuang0220/wePaper/releases/tag/v1.6.0) published 2026-09-07T14:19:05Z. Annotated tag `v1.6.0` → commit `c85147139e165e76b67ab865d01dfc1d5b56f665`.
- `v1.5.0` annotated tag still points at `a4ce6edf873156f8e16b5f557d5a462091acc81b` (parent `4bdc8b47…`, tagger 11:36:58Z, release 11:37:09Z). Repo events: one `ReleaseEvent` for v1.5.0, **zero** `DeleteEvent`s. Tag was not moved.

### Nine public papers

`GET /api/v1/papers` → `total: 9`. Every row: `visibility=public`, `reading_status=null`, `comment_count=0`.  
`GET /api/v1/papers/:id/comments` → `{ "comments": [] }` for all nine:

`PSELS7ZT` `MUZIM3FK` `7DPYRDQS` `LP4WBCGF` `3FYGRVK7` `WHHTS5AT` `GC4SIRTQ` `C8TQ6QR5` `PAS2TSBP`.

### Desktop / Android default path

Desktop UA + `Sec-CH-UA-Mobile: ?0`, and Android Chrome UA + `Sec-CH-UA-Mobile: ?1`, for all nine IDs:

- `GET /paper/:id` → **302** `Location: /paper/:id/pdf`  
  `Cache-Control: private, no-store`  
  `Vary: Sec-CH-UA-Mobile, User-Agent`
- Follow → `200 application/pdf`, body starts `%PDF`.
- Direct `GET /paper/:id/pdf` (Range `bytes=0-7`) → `206 application/pdf`, magic `%PDF-1.5` or `%PDF-1.7`.

Catalog title `<a class="row-open">` `href` is `/paper/:id` (not `/pdf`) for all nine. Catalog HTML has no `pdf.js` / `.reader-scroll`. Default `/paper/:id` response body is empty (redirect), not the SPA viewer.

Playwright (Android UA) title click: network `302 /paper/PSELS7ZT/pdf` then `200 application/pdf`. No `.reader-scroll`. No `"The PDF could not be opened."` / `"The PDF can not be opened"`.

### Discussion

All nine `/paper/:id/discussion` → `200 text/html` (not PDF). Rendered `PSELS7ZT` (desktop) and `PAS2TSBP` (mobile): empty name, empty textarea, 发布, copy `还没有评论。写下第一句讨论。`, thread length 0. No POST.

### Catalog UI (live)

Desktop 1440 and Android 390 captures: nine empty `status-chip is-empty` buttons labeled **状态** (`aria-label="设置阅读状态"`, `data-status=""`). Nine **评论 · 0** links to `/paper/:id/discussion`. No assigned row labels `精读中` / `泛读中` / `待精读` / `待泛读` / `已精读` / `已泛读`. Those strings appear only in the status **filter** `<select>`, which is expected.

---

## LOW (not blocking)

1. **Diagnostic viewer leftover.** `/paper/:id/viewer` is still HTML and lazy-loads `PaperPage-Cewb9faB.js` (SHA matches provenance). That chunk still contains `.reader-scroll`, PDF.js, and `"The PDF could not be opened."`. It is **not** the default `/paper/:id` path (302 → raw PDF).
2. **Headless Chrome does not show a native PDF plugin** after title click (page URL can stay `/`). Network + `curl` prove the 302 and `%PDF` bytes. Real desktop Chrome/Android should hand the `Content-Disposition: inline` PDF to the system viewer.
3. **Status remains openly writable** from the catalog (release product). Production rows are currently NULL; this review did not PATCH.

---

## HIGH_MEDIUM_COUNT

**0.** Nothing is HIGH or MEDIUM.
