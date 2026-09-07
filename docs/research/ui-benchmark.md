# wePaper V1.1 — UI Design Benchmark

**Mission:** Replace the current “AI editorial” look (cream hero, Fraunces wordmark, pill search, card rows, oxblood accent) with patterns from **real human-designed open-source** academic/library/reader products.

**Scope:** Layout, spacing, typography, list density, reader chrome, interaction — not feature parity.

**Anti-patterns (do not borrow):** SaaS landing pages, AI dashboards, shadcn admin shells, analytics UIs, purple gradients, card grids as the default library view, decorative hero mastheads.

**Current wePaper baseline (to retire):** `web/src/styles.css` uses `--paper`/`--oxblood`, Fraunces display at 42px, pill `border-radius: 999px` search, `.entry` rows with 18px vertical padding and display-serif titles — reads as generated editorial, not a working library.

---

## Method

Each project was inspected via GitHub source (SCSS/CSS/components), not title-skimming. Values below cite **file paths in upstream repos** as of research date (Sep 2026).

---

## Project deep dives

### 1. [zotero/web-library](https://github.com/zotero/web-library)

| Field | Detail |
|-------|--------|
| **License** | AGPL-3.0 (`package.json`) |
| **Library layout** | Three-zone desktop: `.collection-tree` sidebar + `.items` (virtualized list **or** sortable table) + item detail/reader. `.library { display: flex; min-height: 0 }` (`src/scss/components/_library.scss`). Mobile: drill-down panels with `translate3d` transitions. |
| **Typography** | System sans stack; `$font-size-base: 13px`, `$line-height-base: 1.539` (`src/scss/abstracts/_variables.scss`). Headings 20/16/14px. Monospace: `menlo, consolas, monospace`. |
| **Reader** | Embedded via iframe in `.reader-wrapper`; popup toolbars reuse `.toolbar` pattern (`src/scss/components/_reader.scss`). |
| **Interaction** | Fixed **61px** list rows (`src/scss/components/item/_list.scss` comment). Active row: `background-color: var(--accent-blue); color: var(--primary-on-accent)`. Hairline dividers inset after 28px icon column. Table view with resizable columns (`item/_table.scss`). Keyboard outline on `.keyboard` class. |
| **Borrow** | Pane divider `#dadada`, toolbar `#f9f9f9`, accent `#4072e5`, 61px two-line rows (title + muted creator/year `#888`), collection tree at 26px line-height, toolbar `left/center/right` groups. |
| **Avoid** | Copying Zotero icons, tag color system, or AGPL SCSS verbatim; don’t replicate full table mode until needed. |

**Key CSS tokens** (`src/scss/themes/_light.scss`):

```scss
accent-blue: #4072e5;
color-toolbar: #f9f9f9;
color-sidepane: #f2f2f2;
color-shade-6: #737373;  // secondary text
color-item-list-second-row: #888;
```

**List row structure** (`item/_list.scss`): icon 28px + `.title` + `.creator-year` flex row with `.year` in parentheses; attachment/note icons right-aligned.

---

### 2. [mozilla/pdf.js](https://github.com/mozilla/pdf.js) — `web/viewer.css`

| Field | Detail |
|-------|--------|
| **License** | Apache-2.0 |
| **Library layout** | N/A (viewer only) |
| **Typography** | Inherits Firefox system UI; numeric page field uses tabular alignment in toolbar. |
| **Reader** | `#mainContainer` column flex; `#viewerContainer { inset: var(--toolbar-height) 0 0 }` — canvas fills remaining viewport. Sidebar 200px optional. |
| **Interaction** | Compact toolbar density modes: default **32px**, compact 30px, touch 44px (`html[data-toolbar-density]`). Icons 16px at `--toolbar-icon-opacity: 0.7`. Find bar slides under toolbar. Presentation mode hides chrome. |
| **Borrow** | 32px toolbar, `#f9f9fa` bar on light, 1px bottom border, icon+separator groups, page number input field pattern, gray `#d4d4d7` canvas surround. |
| **Avoid** | Importing entire `viewer.css` (Firefox-specific tokens); Nova/MOZCENTRAL blocks; over-featured secondary toolbar for V1.1. |

**Key CSS variables** (`web/viewer.css`):

```css
:root {
  --sidebar-width: 200px;
  --toolbar-height: 32px;
  --icon-size: 16px;
  --toolbar-icon-opacity: 0.7;
  --main-color: light-dark(rgb(12 12 13), rgb(249 249 250));
  --body-bg-color: light-dark(rgb(212 212 215), rgb(42 42 46));
  --toolbar-bg-color: light-dark(rgb(249 249 250), rgb(56 56 61));
  --toolbar-border-color: light-dark(rgb(184 184 184), rgb(12 12 13));
}
```

---

### 3. [satyaprakashksingh/shelfly](https://github.com/satyaprakashksingh/shelfly) (Shelfly)

| Field | Detail |
|-------|--------|
| **License** | **No LICENSE file** — treat as reference-only, not reusable code |
| **Library layout** | Abandoned Firebase demo; single `.ui-app-view` centered flex (`src/App.css`) |
| **Typography** | `font-size: 18px; font-style: italic; color: violet` — placeholder only |
| **Reader** | None |
| **Interaction** | None meaningful |
| **Borrow** | **Nothing visual** — included because mission-required; confirms “Shelfly” is not a serious OSS UI reference. |
| **Avoid** | Entire aesthetic; azure/violet full-viewport styling; any assumption Shelfly is maintained. |

**Note:** Other GitHub “Shelfly” repos are inventory apps, not ebook libraries.

---

### 4. [anaralabs/lector](https://github.com/anaralabs/lector)

| Field | Detail |
|-------|--------|
| **License** | MIT (`packages/lector/package.json`) |
| **Library layout** | **Headless** — no library UI; composable PDF primitives only |
| **Typography** | Consumer-defined; docs use Tailwind utility classes |
| **Reader** | `<Root>` + `<Pages>` + `<CanvasLayer>` + `<TextLayer>`; imports `pdfjs-dist/web/pdf_viewer.css` for text layer baseline |
| **Interaction** | `CurrentPage` numeric input with blur-to-jump (`page-number.tsx`); `ZoomIn`/`ZoomOut` step 0.1 (`zoom.tsx`); selection/highlight layers as opt-in components |
| **Borrow** | **Architecture**: headless reader state, compose own 32px chrome; page/zoom input behavior; dark-mode color hooks via `setColorScheme` |
| **Avoid** | Default Tailwind demo styling; treating lector as a visual skin — it ships almost no chrome |

---

### 5. [sissbruecker/linkding](https://github.com/sissbruecker/linkding)

| Field | Detail |
|-------|--------|
| **License** | Open source (no root LICENSE file found; community docs treat as freely self-hostable — verify before code reuse) |
| **Library layout** | CSS grid `.bookmarks-page.grid` with collapsible `section.side-panel` (840px breakpoint hides sidebar → drawer). Main column is **dense list**, not cards by default. |
| **Typography** | `--html-font-size: 20px` but UI `--font-size: 0.7rem` (~14px effective); system sans stack (`bookmarks/styles/theme/variables.css`). Title weight 500 via `--bookmark-title-weight`. |
| **Reader** | Separate `reader-mode.css` for bookmark content reading — minimal chrome |
| **Interaction** | `ul.bookmark-list` flex rows, `line-height: 1.1rem`, `margin-bottom: var(--unit-3)` (0.6rem). Optional 100×60 preview thumbnail. Search box grouped with filter dropdown (shared height `--control-size: 1.6rem`). Custom CSS docs recommend `--font-size: 0.75rem` for extra density. |
| **Borrow** | Unit scale (`--unit-1: 0.2rem` … `--unit-8: 1.6rem`), list row flex+gap, ellipsis title, side panel collapse pattern, search+filter single control group |
| **Avoid** | Card-layout custom CSS gists (community); purple primary `hsl(241, 63%, 59%)` if we want paper/ink neutrals |

**List CSS** (`bookmarks/styles/bookmark-page.css`):

```css
ul.bookmark-list {
  line-height: 1.1rem;
}
ul.bookmark-list > li {
  display: flex;
  gap: var(--unit-2);
  margin-bottom: var(--unit-3);
}
```

---

### 6. [WangQrkkk/PaperQuay](https://github.com/WangQrkkk/PaperQuay)

| Field | Detail |
|-------|--------|
| **License** | AGPL-3.0 |
| **Library layout** | Tauri desktop: category sidebar + `LiteraturePaperList` + paper details pane. Toolbar with search + sort `<select>` + actions (`LiteraturePaperList.tsx`). |
| **Typography** | Tailwind + `--pq-*` tokens; `ui-sans-serif` stack, stone palette (`src/app/index.css`) |
| **Reader** | `ReaderWorkspaceHeader` — collapsible header, stage tabs (Overview/Reading), 36px-ish controls, Lucide icons |
| **Interaction** | Paper rows as **grid tables** with drag handles, double-click to open, keyboard Enter/Space; drop indicators between rows. Uses `pq-card` bordered rows — **more card-like than Zotero**. |
| **Borrow** | Literature-specific column ideas (year, status badges, heatmap column); sort dropdown pattern; pointer drag to categories |
| **Avoid** | Teal accent `#0d9488`, rounded-2xl cards, frosted/blur tokens (`--pq-blur`), shadcn-adjacent pill tabs — too “modern SaaS” for wePaper V1.1 |

---

### 7. [linxiv-dev/linXiv](https://github.com/linxiv-dev/linXiv)

| Field | Detail |
|-------|--------|
| **License** | GPL-3.0 |
| **Library layout** | Tauri: paper list + graph view + PDF management; design tokens in `src/styles/tokens.css` |
| **Typography** | Inter 14px body (self-hosted) — **avoid Inter for wePaper**; `--font-display: ui-serif, Georgia`; `--font-mono: JetBrains Mono` |
| **Reader** | pdf.js with annotation border suppression (`.annotationLayer .linkAnnotation { border: 0 }`) |
| **Interaction** | `[data-density="compact"]` reduces `--row-pad-y: 11px`; dark-first tokens with explicit light mode block |
| **Borrow** | Density attribute pattern; compact row padding; academic dark/light token pairs |
| **Avoid** | Inter; Cupertino gradient themes; card shadows `--shadow-card` stack — reads app-marketing |

---

### 8. [janeczku/calibre-web](https://github.com/janeczku/calibre-web)

| Field | Detail |
|-------|--------|
| **License** | GPL-3.0 |
| **Library layout** | Bootstrap 3: default **cover grid**; optional **text list view without covers** (admin visibility flag, issue #1207). Navigation sidebar + content area. |
| **Typography** | Open Sans Semibold labels in themes; body `#444` on `#f2f2f2` (`cps/static/css/style.css`) |
| **Reader** | In-browser EPUB/PDF reader (separate from library chrome) |
| **Interaction** | List view prioritizes title/author/tags over thumbnails — aligns with wePaper density goals |
| **Borrow** | “List over grid” information hierarchy; metadata label/value uppercase label pattern in community CaliBlur theme |
| **Avoid** | Bootstrap 3 boilerplate; teal `#45b29d` link color; large cover-first grid as default |

---

### 9. [laurent22/joplin](https://github.com/laurent22/joplin)

| Field | Detail |
|-------|--------|
| **License** | Dual MIT (client) / AGPL (server components) — desktop UI patterns OK to study |
| **Library layout** | `.note-list` full-height scroll column, `#F4F5F6` background, 1px divider (`gui/NoteList/style.scss`) |
| **Typography** | `--joplin-font-size` driven; `#32373F` body, `#627184` faded (`packages/lib/themes/light.ts`) |
| **Reader** | Split editor — not PDF-focused |
| **Interaction** | Dense note rows; selection via background `#e5e5e5`, not card elevation; sidebar `#313640` / content `#ffffff` split |
| **Borrow** | Sidebar/content contrast split; faded metadata color `#627184`; focus-visible outline suppressed on list container (active row carries state) |
| **Avoid** | Full note-app IA; dark sidebar blue `#313640` if wePaper stays light-first |

---

### 10. [johnfactotum/foliate](https://github.com/johnfactotum/foliate)

| Field | Detail |
|-------|--------|
| **License** | GPL-3.0 |
| **Library layout** | **No library** — file-viewer mental model; opens files in place |
| **Typography** | Publisher CSS respected; user stylesheet override path documented (`docs/faq.md`) |
| **Reader** | GTK headerbar hides on idle; WebKit paginated/scroll modes; progress slider; sidebar TOC |
| **Interaction** | Reading-first: chrome auto-hides; annotations in plain JSON sidecar files |
| **Borrow** | **Philosophy**: minimize persistent chrome; 32px-equivalent headerbar; reading area maximized |
| **Avoid** | GTK-specific patterns; EPUB pagination CSS — PDF path differs |

---

### 11. [booklore-app/BookLore](https://github.com/booklore-app/BookLore)

| Field | Detail |
|-------|--------|
| **License** | AGPL-3.0 |
| **Library layout** | Angular SPA: shelf grid + table views for ebooks; OPDS-facing |
| **Typography** | Modern web app defaults (inspect live demo for component library) |
| **Reader** | Built-in EPUB/PDF/comics reader in browser |
| **Interaction** | Smart shelves, filter chips — closer to **media library** than citation manager |
| **Borrow** | Shelf→list drill-down IA only at high level |
| **Avoid** | Cover-forward “home” dashboard; marketing hero sections on booklore.org |

---

### 12. [ViuGiaLai/researchmind](https://github.com/ViuGiaLai/researchmind)

| Field | Detail |
|-------|--------|
| **License** | MIT |
| **Library layout** | Tauri + React + **shadcn/ui** + Tailwind — collections, tags, import pipeline UI |
| **Typography** | shadcn defaults (Inter-like system stack) |
| **Reader** | PDF annotations + AI panels |
| **Interaction** | Import status steps (queued→ready); Zotero SQLite sync |
| **Borrow** | Import status row pattern; collection/tag IA sketch |
| **Avoid** | **Entire visual system** — explicitly shadcn admin/dashboard aesthetic the mission rejects |

---

## Comparison table

| Project | Library layout | Typography | Reader | Interaction | 可借鉴 |
|---------|----------------|------------|--------|-------------|--------|
| Zotero web-library | Tree + list/table + detail | 13px system sans, 1.539 lh | iframe PDF/reader module | 61px rows, blue selection, keyboard nav | **Primary library IA + row density** |
| PDF.js viewer | — | System UI | Full-viewport canvas | 32px toolbar, density modes, sidebar toggle | **Primary reader chrome** |
| Shelfly | Placeholder center flex | 18px italic violet | — | — | **Anti-reference only** |
| lector | Headless | Consumer-defined | Composable layers | Page input, zoom steps | **Reader architecture (MIT npm)** |
| linkding | Grid + side panel + list | 0.7rem UI, 500-weight titles | reader-mode.css | 1.1rem lh dense rows, ellipsis | **List density + spacing scale** |
| PaperQuay | Sidebar + grid rows + detail | Sans + stone tokens | Collapsible workspace header | Drag reorder, dbl-click open | Literature columns/status (not visual skin) |
| linXiv | List + graph + PDF mgr | 14px Inter (skip font) | pdf.js embed | `[data-density=compact]` | Density toggle pattern |
| calibre-web | Grid default; text list opt-in | Open Sans / Bootstrap | In-browser reader | Title/author-first list mode | List-over-grid hierarchy |
| Joplin | Sidebar list column | Theme tokens 32373F/627184 | Split editor | Selected row bg, no cards | Metadata fade colors |
| Foliate | File viewer | User CSS | Auto-hide chrome | Keyboard nav, progress slider | Reading-first chrome minimalism |
| BookLore | Shelves + tables | Angular Material-ish | Multi-format reader | Smart shelves | High-level shelf IA only |
| ResearchMind | shadcn collections | Tailwind/shadcn | AI+PDF split | Import pipeline states | **Avoid visually**; MIT import UX ideas only |

---

## PRIMARY_VISUAL_REFERENCES

Pick **three** references and commit — do not blend all twelve.

1. **[zotero/web-library](https://github.com/zotero/web-library)** — canonical **academic library** shell: collection tree, fixed-height item rows, neutral gray toolbar, citation-metadata hierarchy.
2. **[mozilla/pdf.js](https://github.com/mozilla/pdf.js)** — canonical **PDF reader chrome**: 32px toolbar, 16px icons, canvas-first viewport, minimal decoration.
3. **[sissbruecker/linkding](https://github.com/sissbruecker/linkding)** — canonical **dense list** mechanics: tight line-height, unit spacing system, ellipsis rows, side-panel collapse — without linkding’s purple brand.

### Steal-this list (specific)

| Area | Steal from | Concrete spec |
|------|------------|---------------|
| **Layout** | Zotero + linkding | Full-width app shell; left collections (~240–280px); center list flex-grow; no centered 980px “editorial column”. Collapse side panel ≤840px (linkding breakpoint). |
| **Spacing scale** | Zotero + linkding | Base **13px** UI type (Zotero). List row height **61px** (Zotero). Between-row rhythm **0.6rem** (`--unit-3`). Control height **32px** (pdf.js toolbar = list toolbar). |
| **Chrome** | PDF.js | Toolbar `--toolbar-height: 32px`; background `#f9f9fa`; border `#b8b8b8` 1px bottom; icon 16px @ 70% opacity; hover `color-mix(in srgb, currentColor 17%, transparent)`. |
| **List row** | Zotero | Row: 28px type icon + two lines — **line1** title 13–14px semibold truncate; **line2** authors + year in `#888`. Divider hairline inset 38px. Selected: `#4072e5` bg, white text. **No** card shadow, **no** 16px+ row padding. |
| **Toolbar** | Zotero + PDF.js | Three zones `left / center / right`. Left: back + count. Center: page control (`input` 2.6rem + `/` + total). Right: zoom −/+ . Rectangular inputs `border-radius: 3–4px`, not pills. |

---

## wePaper V1.1 design direction

### Font pairing (not Inter, not Fraunces hero, not Space Grotesk)

**Recommended:** **IBM Plex Sans** (UI, 13px) + **IBM Plex Serif** (paper titles in list, optional reader title).

**Alternate:** **Source Sans 3** + **Source Serif 4** (already partially aligned with wePaper `--serif`).

**Mono:** **IBM Plex Mono** for DOI/year/census (keep tabular nums).

### Color — paper / ink academic

Flat neutrals, no cream gradients or noise overlays.

```css
:root {
  --bg: #ffffff;
  --bg-toolbar: #f9f9f9;
  --bg-sidebar: #f2f2f2;
  --ink: #333333;
  --ink-muted: #888888;
  --ink-faint: #737373;
  --line: #dddddd;
  --line-subtle: rgba(0, 0, 0, 0.08);
  --accent: #4072e5;        /* Zotero blue — links, selection */
  --accent-on: #ffffff;
  --canvas-bg: #d4d4d7;     /* PDF surround, pdf.js light */
}
```

### Library — dense rows, not cards

- Replace `.entry` card padding with Zotero-style **61px** rows.
- Optional small PDF thumb (linkding 100×60) **only if** it doesn’t push row height >61px — otherwise icon-only.
- Search: linkding-style **rectangular** grouped control, max-width ~300px, not full-width pill.

### Reader chrome — compact, reading-first

- Match existing wePaper reader direction in `web/src/styles.css`: `.read-bar` / `.reader-tools` **32px** height, 28×24 icon buttons, rectangular page input.
- Consider Foliate-style **auto-hide** toolbar on scroll (phase 2).
- Build on **@anaralabs/lector** (MIT) for canvas/text layers; style chrome ourselves per pdf.js tokens.

### Mobile

- Zotero pattern: list ↔ detail drill-down with horizontal slide; don’t shrink cards into 2-column grid.

---

## License-safe reuse notes

| Source | License | Safe for wePaper |
|--------|---------|------------------|
| **lector** | MIT | ✅ Add npm dependency; compose custom chrome |
| **PDF.js** | Apache-2.0 | ✅ Use `pdfjs-dist`; study `viewer.css` variables; don’t ship full Firefox viewer |
| **linkding** | OSS (verify) | ✅ Reimplement spacing/IA patterns; don’t copy Spectre CSS bundle |
| **Zotero web-library** | AGPL-3.0 | ⚠️ Study only — reimplement patterns in clean CSS/React; no SCSS/icon copy |
| **PaperQuay, BookLore** | AGPL-3.0 | ⚠️ Study interaction ideas; no code paste |
| **calibre-web, Foliate, linXiv** | GPL-3.0 | ⚠️ Visual inspiration only |
| **Joplin** | MIT/AGPL | ✅ Color/IA ideas from MIT desktop client |
| **ResearchMind** | MIT | ✅ Import UX ideas; reject shadcn visual language |
| **Shelfly** | No license | ❌ Do not reuse |

**Principle:** Borrow **measurements, hierarchy, and behavior**. Write fresh CSS in `web/src/styles.css`. Use MIT/Apache libraries for engines (pdf.js, lector), not AGPL UI bundles.

---

## Implementation checklist (V1.1)

- [ ] Remove cream gradient, noise overlay, Fraunces wordmark hero from `LibraryPage`
- [ ] Implement 3-zone layout (collections | list | optional detail)
- [ ] Set `--font-size: 13px` UI base; 61px list rows
- [ ] Rectangular search + sort controls (linkding/Zotero)
- [ ] Reader toolbar: 32px, pdf.js-like colors; wire lector or keep canvas reader
- [ ] Selection color `#4072e5` / white text
- [ ] Document chosen fonts in `web/index.html` (IBM Plex or Source)

---

## References

- Zotero web-library SCSS: https://github.com/zotero/web-library/tree/master/src/scss
- PDF.js viewer CSS: https://github.com/mozilla/pdf.js/blob/master/web/viewer.css
- linkding styles: https://github.com/sissbruecker/linkding/tree/master/bookmarks/styles
- lector: https://github.com/anaralabs/lector
- Shelfly (required mention): https://github.com/satyaprakashksingh/shelfly
