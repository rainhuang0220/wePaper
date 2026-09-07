# TASK_LEDGER

MISSION: mobile inline PDF adaptation + reading status

- [x] Load execution Skills
- [x] Restore canonical title links to /paper/:id
- [x] Implement robust mobile detection
- [x] Add caching/Vary correctness
- [x] Preserve desktop redirect to /pdf
- [x] Add mobile viewer route/surface
- [x] Reintroduce official PDF.js viewer dependency only as needed
- [x] Lazy-load mobile viewer
- [x] Keep old custom reader deleted
- [x] Preserve raw /pdf endpoint
- [x] Mobile fit-width UX
- [x] Mobile continuous scroll
- [x] Mobile search
- [x] Mobile text selection
- [x] Mobile zoom
- [x] Orientation resize
- [x] Desktop Chrome regression
- [x] Desktop Safari regression (NOT TESTED — no Safari/WebKit automation)
- [x] Mobile Chromium E2E
- [x] iOS Safari test if actually available (NOT TESTED — no real iOS device)
- [x] Raw PDF direct-link regression
- [x] Browser Back desktop
- [x] Browser Back mobile
- [x] Performance benchmark
- [x] Security regression
- [x] Zotero regression
- [x] Mobile UX reviewer
- [x] Production reviewer
- [x] Fix HIGH/MEDIUM findings
- [x] Add reading_status schema/model
- [x] Add DB migration
- [x] Preserve status across Zotero reconciliation
- [x] Add secure owner-write API
- [x] Reject public status writes
- [x] Display reading status in catalog
- [x] Implement GitHub-like compact status UI
- [x] Add quick status selector
- [x] Add clear/no-status option
- [x] Add status filtering
- [x] Combine search + status filtering
- [x] Desktop interaction test
- [x] Mobile interaction test
- [x] Prevent click propagation into paper open
- [x] Zotero status-preservation regression
- [x] Product UX review
- [x] Public production verification
- [x] Deploy production
- [x] Public desktop verification
- [x] Public mobile verification
- [x] Push main
- [x] Tag release
- [x] GitHub Release
- [x] Production == release commit
- [x] Final clean git status

## Notes

- Canonical URL: https://wepaper.plainlist.space
- Repo: https://github.com/rainhuang0220/wePaper
- Previous: v1.4.0 / `63cd9775932ca8021d27a4610825299e537f78ad`
- This release: v1.5.0 — DesktopNativePdf + MobilePaperViewer + reading_status
- Policy: only `/paper/:id` is device-aware. `/paper/:id/pdf` is always raw `application/pdf`.
- Reading status is wePaper-owned. Zotero upsert must not overwrite it.
- Hidden papers that later reappear with the same `zotero_item_key` keep their reading status.
- Desktop Safari and iOS Safari: NOT TESTED. Do not invent PASS.

## Seams (TDD)

- `wepaper.device.reading_surface(headers) -> "native_pdf" | "mobile_viewer"`
- `wepaper.reading_status.parse / labels / filter_clause`
- `PATCH /api/v1/papers/:id/status` (owner cookie)
- Public `GET /api/v1/papers` includes `reading_status`
