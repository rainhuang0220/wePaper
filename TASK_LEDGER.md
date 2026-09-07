# TASK_LEDGER

MISSION: wePaper approved reader migration

- [x] Load execution Skills
- [x] Read approved reader migration plan
- [x] Implement PaperViewer / mature viewer
- [x] Wire /paper/:id to new reader
- [x] Preserve /paper/:id/pdf
- [x] Integrate Range loader
- [x] Preserve first-page-first behavior
- [x] Preserve persist-after-paint
- [x] Remove old PdfReader
- [x] Remove obsolete canvasScale
- [x] Remove obsolete zoomSteps
- [x] Remove obsolete pdfWindow/find helpers where plan specifies
- [x] Remove obsolete tests/mirrors
- [x] Update reader tests
- [x] Desktop E2E
- [x] Mobile E2E
- [x] 100% fidelity check
- [x] 200% fidelity check
- [x] 300% fidelity check
- [x] 400% fidelity check
- [x] Text selection check
- [x] Search check
- [x] Continuous scroll check
- [x] Cold-open performance benchmark
- [x] Security regression
- [x] Zotero regression
- [x] Migration reviewer
- [x] Browser/fidelity reviewer
- [x] Fix HIGH/MEDIUM findings
- [x] Deploy production
- [x] Public E2E
- [x] Push GitHub main
- [x] Create release tag
- [x] Create GitHub Release
- [x] Verify production == release commit
- [x] Final clean git state

## Notes

- Canonical URL: https://wepaper.plainlist.space
- Repo: https://github.com/rainhuang0220/wePaper
- Spec: docs/reader-migration-plan.md
- Version: v1.3.0
- Release / production reader commit: d1a563edfc3d87eea670a4de947d0612465f0230
- Production JS: `/assets/index-Bu5KI4pS.js`
- Production JS sha256: `6e966ea60288122193c93ef15f95faf9ef92c656d4b3443bafb1cefb77558f09`
- Public Playwright: 16/16 passed against 175.24.134.228
- Desktop cold P50 1410 ms / P95 2365 ms
- Mobile cold P50 1350 ms / P95 2334 ms
- Warm PAS2TSBP 242 ms
- Zotero sync --once: 9 discovered, 1 updated, 8 unchanged, exit 0
