---
name: wepaper-longrun
description: Long-horizon autonomous execution for shipping wePaper to public production. Use whenever working on wePaper research, architecture, implementation, testing, Zotero sync, deployment, verification, or recovery after interruption. Do not stop at a checkpoint.
---

# wePaper Long-Horizon Autonomous Execution

This skill is the operating loop for shipping wePaper. Completion is `SHIPPED` or `HARD_BLOCKED` only.

## Legal end states

- **SHIPPED**: every item in `TASK_LEDGER.md` Release checklist is done, public HTTPS works, PDF renders, sync is restart-safe, docs exist.
- **HARD_BLOCKED**: a true external resource only the human can provide (SSH credentials, OAuth, DNS control, missing secret, human identity check, irreversible danger). Ordinary bugs are not a block.

## Mandatory loop

1. Read `TASK_LEDGER.md`.
2. Pick the first unchecked shippable item.
3. Delegate deep research, prior-art, adversarial review, and targeted debugging to subagents. Keep decisions, integration, implementation, and verification on the main agent.
4. Implement, test, fix, and verify that item.
5. Check the item off in the ledger.
6. Immediately start the next unchecked item.
7. Before any session-end thought, re-read the ledger. If work remains and there is no hard block, continue.

## Mandatory subagent delegation

Before locking architecture, spawn at least:

- Architecture / Zotero prior-art research
- Open-source / product benchmark (`REFERENCE_RESEARCH.md`)
- After a draft architecture exists: independent critic (`ARCHITECTURE_REVIEW.md`)

Later, spawn targeted agents for security review, UI polish, deployment debugging, and final verification. Do not keep all deep reading in the main context.

## Research before architecture lock-in

Do not default to watching a Zotero folder. Compare Local API, Web API, sqlite (read-only), WebDAV, plugin, daemon, and hybrids. Prefer the most stable, boring, idempotent design that cannot corrupt Zotero. Write the decision into `docs/architecture.md`.

## No premature checkpoint

Do not pause for user review after research, architecture, MVP, local run, happy-path tests, or pre-deploy. Ordinary stack choices are made by the agent and recorded in docs.

## Iterative testing

Tests are the body of the work, not a tail. Cover unit seams (normalize, checksum, dedupe, sync state, sanitization, API validation) and integration scenarios (empty, add, update, replace, remove, delete, duplicate, interrupt, retry, restart, unicode, long title). Then real Zotero read-only smoke and browser PDF smoke.

## Deployment verification

Localhost is not done. Verify HTTPS, homepage, list, detail, PDF render, health, persistence after restart, and authenticated write APIs. Prefer existing infrastructure.

## Restart / recovery

If the session is interrupted: read this skill, read `TASK_LEDGER.md`, inspect git status and running processes, resume the first unchecked item. Do not restart research from zero unless findings are missing.

## Progress ledger

`TASK_LEDGER.md` is the source of truth. Updating the ledger is never a stopping action.

## Definition of Done

Only report to the human when the ledger Release section is complete or a true hard block exists. Final report uses the STATUS / PUBLIC_URL / ARCHITECTURE template from the mission brief.
