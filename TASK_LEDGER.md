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
- [ ] Push main
- [ ] Create new semantic version tag
- [ ] Create GitHub Release
- [ ] Verify production == release commit
- [x] Update docs
- [ ] Final clean git status

## Notes

- Canonical URL: https://wepaper.plainlist.space
- Repo: https://github.com/rainhuang0220/wePaper
- Version: v1.4.0
- Decision: PDF.js in-app viewer REMOVED. Default is browser-native `/paper/:id/pdf`.
- Routing/UX reviewer (c14546ab): PASS, HIGH/MEDIUM none
- Production reviewer (ab4e0ad8): PASS
- Public title click: `https://wepaper.plainlist.space/paper/PSELS7ZT/pdf` `application/pdf`
- Public `/paper/PSELS7ZT` → 302 → `/paper/PSELS7ZT/pdf`
- Public Back: PDF → library (9 rows)
- Production JS: `index-BAGeQMXW.js` SHA-256 `2bcd17c7f833ae60cd4133842c903e9fdff848229dbfa82142e7e45254523896`
- Public click bench: desktop P50 113 ms / P95 132 ms; mobile P50 123 ms / P95 130 ms
