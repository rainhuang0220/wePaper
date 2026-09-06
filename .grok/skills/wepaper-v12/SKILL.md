---
name: wepaper-v12
description: Long-horizon V1.2 execution for wePaper first-page latency, high-DPI PDF fidelity, and public GitHub release provenance. Use whenever working on wePaper reader performance, blurry PDF rendering, zoom, or v1.2.0 publication.
---

# wePaper V1.2 Long-Horizon Loop

Completion is `SHIPPED` or `HARD_BLOCKED` only. Do not pause for profiling review, local-only fixes, or pre-push confirmation.

## Preserve

Do not redesign the working Zotero Local API → agent → FastAPI → blob pipeline unless profiling proves a backend defect.

## Mandatory subagents

Spawn before locking the performance or rendering fix:

1. Reader performance investigator → `docs/research/v12-reader-performance.md`
2. PDF fidelity investigator → `docs/research/v12-pdf-fidelity.md`
3. Git / release provenance auditor
4. After production deploy: adversarial reviewer

Main agent measures, implements, deploys, publishes, and verifies.

## Measure before optimization

No render or cache change without a number. Cold first-page time is the gate, not route change or skeleton.

## First page first

Do not hold page 1 hostage to remaining pages, full-file download, or full-text index. Keep continuous vertical scroll.

## PDF fidelity

Real `application/pdf` is necessary but not sufficient. Backing canvas must match CSS size × DPR. Zoom must re-render. 200–300% must be sharper, not stretched pixels.

## Git provenance

A local hash is not a release. Publish `rainhuang0220/wePaper` (or equivalent) with history, secret scan, `v1.2.0` tag, and GitHub Release. Production commit must equal release commit.

## Secret scan

Never push `.env`, tokens, PDFs, blobs, Zotero DB, or private logs. Scan history before first push.

## No premature completion

Localhost green, one sharp PDF, or a created empty repo is not done. Production benchmark + public commit/tag/release URLs are required.

## Definition of Done

Cold click → readable first page P50 ≤ 2.0s / P95 ≤ 3.0s for ordinary PDFs under ~15 MB. High-DPI + zoom re-render. Continuous scroll. Zotero and security regressions pass. `PRODUCTION_MATCHES_RELEASE = YES`.
