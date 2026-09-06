---
name: wepaper-v11-longrun
description: Long-horizon V1.1 execution for wePaper UX reconstruction, continuous PDF reader, and wepaper.plainlist.space origin isolation. Use whenever working on wePaper library UI, PDF reader, visual research, subdomain migration, or V1.1 shipping.
---

# wePaper V1.1 Long-Horizon Loop

Completion is `SHIPPED` or `HARD_BLOCKED` only. Do not pause for design approval, viewer preview, or pre-deploy confirmation.

## Preserve

Do not redesign the working Zotero Local API → agent → FastAPI → SQLite → blob pipeline unless a concrete regression appears. Public read / private write stays.

## Mandatory subagents

Spawn before locking visual or reader architecture:

1. Frontend design benchmark scout → `docs/ui-benchmark.md`
2. PDF reader architecture investigator → `docs/pdf-reader-audit.md`
3. Deployment / origin isolation (DNS, TLS, redirect, agent URL)
4. After first UI+reader implementation: visual critic → `docs/ui-critic-v2.md`

Main agent implements, deploys, and verifies. Subagents research and attack.

## Frontend prior-art

Read real products (repos, CSS, demos, screenshots). Pick 2–3 primary visual references. Forbidden as primary: SaaS landings, AI dashboards, shadcn admin kits.

## Visual benchmark before coding

Do not restyle from memory. Write the benchmark table, then implement from the chosen references.

## Reader architecture audit

Prove the transport is a real `application/pdf` with Range. Default UX is continuous vertical scroll with lazy page render. Do not rasterize the body to images.

## Browser screenshot review

Desktop 1440×900 and mobile 390×844. Library + reader. After critic HIGH/MEDIUM, screenshot again.

## Long-horizon watchdog

Read `TASK_LEDGER.md` before any session-end thought. Unchecked items + no hard block ⇒ continue.

## No intermediate approval

Ordinary stack, font, viewer-library, and nginx choices are agent decisions recorded in docs.

## Regression preservation

Keep the 43 existing tests green. Re-verify OpenAPI 404, unauth sync 401, blob key rules, size caps, 0700 storage, CSP, no public checksums.

## Production deployment

Canonical origin is `https://wepaper.plainlist.space`. One data instance. Redirect the old `/wepaper` path. Update the Mac agent URL without putting the token in the plist.

## Second-pass critique

Visual critic after first public build. Fix HIGH/MEDIUM. Second screenshot pass vs primary references.

## Definition of Done

`https://wepaper.plainlist.space` HTTPS, redesigned library, continuous real-PDF reader, Zotero regression, desktop+mobile E2E, security regression, docs, clean git.
