# TASK_LEDGER

MISSION: wePaper V1.2 performance / fidelity / release

## V1.2

- [x] Load V1.2 Skill
- [x] Spawn performance investigator
- [x] Spawn PDF fidelity investigator
- [x] Spawn release provenance auditor
- [x] Profile cold paper opening
- [x] Identify 10-second bottleneck
- [x] Fix first-page latency
- [x] Verify Range behavior
- [x] Verify first-page-first loading
- [x] Audit canvas backing resolution
- [x] Add proper high-DPI rendering
- [x] Fix zoom re-rendering
- [x] Raise usable zoom range
- [x] Verify text layer alignment
- [x] Compare against native PDF baseline
- [x] Desktop browser benchmark
- [x] Mobile browser benchmark
- [x] Existing reader regression
- [x] Real Zotero regression
- [x] Security regression
- [x] Locate authoritative Git history
- [x] Verify 42cf3a6
- [x] Verify 0ee7e3d
- [x] Secret/privacy scan
- [x] License audit
- [ ] Create dedicated GitHub repo
- [ ] Push real main history
- [ ] Verify public commit URLs
- [ ] Create v1.2.0 tag
- [ ] Create GitHub Release
- [ ] Verify production == release commit
- [ ] Spawn final adversarial reviewer
- [ ] Fix HIGH/MEDIUM findings
- [x] Final production benchmark
- [ ] Public E2E

## Notes

- Started V1.2: 2026-09-07
- Canonical URL: https://wepaper.plainlist.space
- 10s cause: full-file PDF.js stream + nginx `proxy_cache` poisoning Range 206 + uncompressed worker/JS
- Small-paper cold click P50 ~360 ms / P95 ~845 ms
- Medium/large still path-bound on serial Range from this Mac
