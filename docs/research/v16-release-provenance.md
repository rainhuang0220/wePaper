# v1.6.0 release provenance

**Recovery commit (already on production before this release):** `9bc593d368ff39ff8ebfe7c51e36b988c39dc74f`  
**This release commit:** fill after tag  
**Production origin:** https://wepaper.plainlist.space (`175.24.134.228`)

`dist/` is gitignored; this file is the provenance record.

| Asset | SHA-256 |
| --- | --- |
| `/assets/index-DgM47mMh.js` | `77f5ecd4149858840894b8357dde344878fca78e48803b16ae2a94dbdf10d493` |
| `/assets/index-CAokWa4p.css` | `6d28a849944373178882f90e9e4d7e6a7621734eb34023e94bf549cc1bc8d12d` |
| `/assets/PaperPage-Cewb9faB.js` | `175c4ab9850aece0b88e2f3687cd402fa8f8cccc068bd152aac7ac57fdbd3196` |

## Product

- `/paper/:id` 302 → `/paper/:id/pdf` on every device. Desktop native PDF unchanged.
- Mobile default is raw PDF fallback. Inline PDF.js is **not** enabled (no real Android runtime).
- `/paper/:id/viewer` remains a diagnostic-only HTML viewer.
- Reading status is openly editable from the catalog. Owner login is retired.
- Paper discussions at `/paper/:id/discussion`. Catalog shows `评论 · N`. Mobile long-press title opens discussion.
- Production papers are never used as E2E write fixtures.

## Tests

- `uv run pytest` — 83 passed
- `cd web && npx playwright test` — 18 passed, 12 skipped (opt-in benches)

## ANDROID_INLINE

NOT ENABLED — RAW PDF FALLBACK
