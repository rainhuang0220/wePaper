# TASK_LEDGER

MISSION: native PDF default route

- [x] Load execution Skills
- [x] Audit every paper-opening link
- [x] Change title links to /paper/:id/pdf
- [x] Redirect /paper/:id to /paper/:id/pdf
- [x] Decide fate of optional PDF.js viewer
- [x] Remove or demote viewer architecture
- [x] Preserve raw PDF transport
- [x] Test browser Back
- [x] Desktop behavior
- [x] Mobile behavior
- [x] Direct old URL behavior
- [x] Update Playwright routing tests
- [x] Performance regression
- [x] Security regression
- [x] Zotero regression
- [x] Routing/UX reviewer
- [x] Fix HIGH/MEDIUM findings
- [x] Deploy production
- [x] Public title-click verification
- [x] Public direct-/paper/:id verification
- [x] Push main
- [x] Create new semantic version tag
- [x] Create GitHub Release
- [x] Verify production == release commit
- [x] Update docs
- [x] Final clean git status

## Notes

- Canonical URL: https://wepaper.plainlist.space
- Repo: https://github.com/rainhuang0220/wePaper
- Version: v1.4.0
- Release commit: `63cd9775932ca8021d27a4610825299e537f78ad`
- Tag: https://github.com/rainhuang0220/wePaper/releases/tag/v1.4.0
- Decision: PDF.js in-app viewer REMOVED. Default is browser-native `/paper/:id/pdf`.
- Production JS: `index-BAGeQMXW.js` SHA-256 `2bcd17c7f833ae60cd4133842c903e9fdff848229dbfa82142e7e45254523896`
