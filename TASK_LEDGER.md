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
- [ ] Deploy production
- [ ] Public title-click verification
- [ ] Public direct-/paper/:id verification
- [ ] Push main
- [ ] Create new semantic version tag
- [ ] Create GitHub Release
- [ ] Verify production == release commit
- [ ] Update docs
- [ ] Final clean git status

## Notes

- Canonical URL: https://wepaper.plainlist.space
- Repo: https://github.com/rainhuang0220/wePaper
- Next version: v1.4.0
- Decision: PDF.js in-app viewer REMOVED. Default is browser-native `/paper/:id/pdf`.
- Routing/UX reviewer (c14546ab): PASS, HIGH/MEDIUM none
- Local pytest: 47 passed
- Local Playwright: 8/8 passed
- Local click bench: desktop P50 17 ms / P95 60 ms; mobile P50 17 ms / P95 37 ms (localhost; Playwright treats PDF as download)
