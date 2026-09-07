# UI second pass (after critic)

Compared `docs/screenshots/v11-pass2-*.png` to PRIMARY_VISUAL_REFERENCES.

| Critic HIGH | After |
|-------------|--------|
| 1040 magazine column | Full-bleed list, 32px `#f9f9fa` bar |
| Source Serif 4 | System sans only; Google Fonts removed |
| 86px three-line rows | 61px title + `authors · year` |
| Fit-width branded 100% | Default PDF scale `1` (honest 100%); Fit is a separate mode; mobile auto-Fits |
| Title stuffed in toolbar | Three-zone: Library / page / zoom+find |
| Ghost search | 24px boxed `Search` |
| Mono census/dates | System sans + tabular-nums |

MEDIUM items (inset hairline, document glyph, underline sort, `#b8b8b8` toolbar, 1px page edge, one-bar find, no extra `.read-bar` title) are in the same CSS pass.

**Still AI-demo?** No. It reads as a small Zotero list + PDF.js chrome, not a serif blog or a card dashboard. Nine rows leave empty space below the list because the collection is small, not because the layout is a landing page.
