# Changelog

Public releases. Dates and behavior are taken from Git tags and GitHub Releases.

## [1.7.0] — 2026-09-08

Automatic near-real-time Zotero synchronization and live catalog refresh.

- Background daemon polls Zotero `Last-Modified-Version`, debounces writes, then reconciles the configured collection. A 5-minute reconcile plus sleep/wake catch-up covers missed events.
- Uncaught server/Zotero errors no longer kill the LaunchAgent (that crash loop is why a new paper could sit in Zotero without appearing on the site).
- `wepaper daemon install|uninstall|status`, `wepaper status`, and `wepaper doctor` show whether automatic sync is alive. Plist has logs and does not embed the sync token.
- Public `GET /api/v1/library/version`. An already-open catalog tab updates in place within a few seconds, keeping search and filters. Visibility/focus runs an immediate check.
- `wepaper sync --once` remains for diagnostics and repair. It is not the normal workflow.

## [1.6.0] — 2026-09-07

Mobile recovery, open reading status, and paper discussions.

- Default reading on every device is Library → `/paper/:id` → 302 → `/paper/:id/pdf`. The broken v1.5 Android inline viewer is no longer the default.
- Mobile may show the PDF in the browser or offer a download. That fallback is intentional.
- Reading status is openly editable from the catalog. The six labels are 待泛读, 待精读, 泛读中, 精读中, 已泛读, 已精读. `/owner` is retired.
- Each paper has a discussion: comments, one-level replies, likes. Desktop and mobile use `评论 · N`. Mobile also long-presses the title.
- Automated status and comment tests use an isolated fixture database, not production papers.
- Zotero metadata and PDF updates keep `reading_status` and comments on the same item key.

## [1.5.0] — 2026-09-07

Mobile-only official PDF.js viewer and owner-gated reading-status labels.

Superseded for mobile reading and status permissions by 1.6.0. The v1.5 Android default path could land on a dead inline viewer (“The PDF could not be opened.”).

## [1.4.0] — 2026-09-07

Browser-native PDF became the default reading path.

- Title click follows `/paper/:id` → 302 → `/paper/:id/pdf`.
- `/paper/:id/pdf` is always `application/pdf` with Range.
- The in-app PDF.js reader was removed from the default path.

## [1.3.0] — 2026-09-06

Replaced the custom canvas reader with Mozilla’s official PDF.js viewer.

## [1.2.2] / [1.2.1] / [1.2.0] — 2026-09-06

First-page PDF performance on the earlier in-app reader: ranged fetches, worker preload, and nginx `proxy_cache` off so a cached `206` cannot replace a PDF with a fragment.

[1.7.0]: https://github.com/rainhuang0220/wePaper/releases/tag/v1.7.0
[1.6.0]: https://github.com/rainhuang0220/wePaper/releases/tag/v1.6.0
[1.5.0]: https://github.com/rainhuang0220/wePaper/releases/tag/v1.5.0
[1.4.0]: https://github.com/rainhuang0220/wePaper/releases/tag/v1.4.0
[1.3.0]: https://github.com/rainhuang0220/wePaper/releases/tag/v1.3.0
[1.2.2]: https://github.com/rainhuang0220/wePaper/releases/tag/v1.2.2
[1.2.1]: https://github.com/rainhuang0220/wePaper/releases/tag/v1.2.1
[1.2.0]: https://github.com/rainhuang0220/wePaper/releases/tag/v1.2.0
