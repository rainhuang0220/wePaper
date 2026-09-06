# wePaper V1.1 — Visual Critic (pass 2)

**Job:** attack the current public UI. No praise. No new product features.

**References (attack surface):**

1. **Zotero Web Library** — 13px system-sans, fixed **61px** two-line rows, hairline inset after the 28px icon column, second line `#888`, selected row `#4072e5` / white. Full-width items pane. Not a magazine column.
2. **Mozilla PDF.js viewer** — one **32px** toolbar (`#f9f9fa`, bottom border `#b8b8b8`), 16px icons at ~70% opacity, **page control in the center**, gray **`#d4d4d7` viewport with real side gutters**, white pages. Chrome is system UI, never a display serif.
3. **Miniflux editorial** — human list rhythm, no cards, no webfont pairing, **no monospaced chrome**. Titles and meta share one sans family. A list, not a blog.

`docs/ui-benchmark.md` PRIMARY_VISUAL_REFERENCES steal-this list is the implementation contract this build missed: full-width shell, 61px rows, inset 38px hairlines, 13–14px semibold **sans** titles, rectangular search, toolbar `left / center / right`.

**Method.** Five PNGs on disk, all `3328×2082`. Desktop files are a 1440 CSS viewport at 2× (`2880×1800`) with extra canvas pad. Mobile files are a **390 CSS layout occupying the left ~780 physical pixels** of the same 1440 canvas — measurements below use CSS pixels inside that content box, not the empty right pad (capture artifact, not a live 390 bug).

| File | What it actually shows |
|------|------------------------|
| `docs/screenshots/v11-library-desktop-1440.png` | Centered 1040 column, 200px white gutters, 9 rows |
| `docs/screenshots/v11-reader-desktop-1440.png` | 32px bar + fit-width page 1, ~24px gray slivers |
| `docs/screenshots/v11-reader-desktop-page3.png` | Same chrome, page 3, same slivers |
| `docs/screenshots/v11-library-mobile-390.png` | Stacked header + 4-line rows, 366px column |
| `docs/screenshots/v11-reader-mobile-390.png` | Truncated title, crowded tools, fit-width page |

Source of record: `web/src/styles.css`, `web/src/pages/LibraryPage.tsx`, `web/src/pages/PaperPage.tsx`, `web/src/PdfReader.tsx`, `web/index.html`.

---

### [HIGH] Centered 1040px magazine column

**Evidence.** `v11-library-desktop-1440.png`: ink lives in a box starting at physical x=400 (200 CSS from the left). Column width measures **1038 CSS** against a 1440 frame — **200px white gutter on each side**. The right gutter is empty paper, not a pane.

```40:44:web/src/styles.css
.lib {
  width: min(1040px, calc(100% - 48px));
  margin: 0 auto;
  padding: 16px 0 64px;
}
```

**Why it looks AI.** This is the default Claude/v0 “nice writing app”: a cream-less Medium column. Zotero’s items list is a full-bleed pane. Miniflux is a feed in an app chrome, not a 1040px essay. The steal-this line is explicit: *no centered 980px editorial column*. 200px of unused white on both sides is a landing page that ran out of hero.

**Fix.** `.lib { width: auto; max-width: none; margin: 0; padding: 0 16px 24px; }`. Make `.lib-bar` full-bleed with `background: #f9f9fa` and a 1px bottom `#b8b8b8`. Rows span the window. Do not invent a collections feature to fill the sides — just stop centering.

---

### [HIGH] Source Serif 4 titles — the Claude literature skin

**Evidence.** `v11-library-desktop-1440.png` / `v11-library-mobile-390.png`: every title is a heavy optical-size serif (Georgia/Palatino cousin) on a system-sans page. `v11-reader-desktop-1440.png` and `v11-reader-desktop-page3.png`: the same serif is the **toolbar title**, 13px/600, sitting next to sans “Library” and sans “Open PDF”.

```11:14:web/index.html
    <link
      href="https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,500;8..60,600&display=swap"
      rel="stylesheet"
    />
```

```116:127:web/src/styles.css
.row h2 {
  margin: 0;
  font-family: var(--serif);
  font-size: 16px;
  font-weight: 600;
  line-height: 1.3;
  ...
}
```

```188:197:web/src/styles.css
.read-id h1 {
  margin: 0;
  font-family: var(--serif);
  font-size: 13px;
  font-weight: 600;
  ...
}
```

**Why it looks AI.** Zotero titles are 13–14px **system sans**, semibold, one line, ellipsis. Miniflux titles are the same sans as the chrome. PDF.js chrome is Firefox UI, never a display face. Pairing Google “Source Serif 4” (opsz 8..60, only weights 500/600) with `-apple-system` is the 2024–2026 generated-blog tell: *the content is scholarly, so the UI must wear a book*. It reads as a Substack of papers, not a library. The PDF *page* already has a real Times/Computer Modern face; the chrome copying that face is costume.

**Fix.** Delete the Google Fonts `<link>`s from `web/index.html`. `--serif` unused. `.row h2` and `.read-id h1` → `font-family: var(--sans); font-size: 13px; font-weight: 600; line-height: 1.35; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;` and drop `-webkit-line-clamp: 2`.

---

### [HIGH] Rows are 86px three-line cards, not 61px two-line items

**Evidence.** `v11-library-desktop-1440.png`: nine hairlines at physical y = 274, 446, 619, 791, 964, 1137, 1309, 1482, 1654. Gaps **172–173px = 86 CSS**. Zotero is 61. Each row is:

1. 16px serif title (often wrapping)
2. 13px authors (`#6e6e73`)
3. 12px venue · year · tags + 11px mono date on the far right

```93:98:web/src/styles.css
.row {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr);
  column-gap: 10px;
  min-height: 61px;
  padding: 11px 8px 10px 0;
```

`min-height: 61px` is a lie. Padding 11+10 plus three text lines plus a 16px/1.3 title **cannot** land on 61. The screenshot is an airy bibliography, not an item list.

**Why it looks AI.** Generated UIs invent hierarchy by stacking more lines and a prettier title face. Human library UIs collapse to **title + one muted line**. Zotero: title, then `Creator (Year)`. Miniflux: title, then a short meta whisper. A third line of `Computer Science - Computation and Language` is arXiv taxonomy dumped as prose. The date hanging 600+ CSS pixels to the right of that string is a fake table column inside a card-shaped block.

**Fix.** One row, two lines, height **61px**, padding **8px 8px 8px 0**. Title 13px sans, one line, ellipsis. Second line: `authors · year` at 12px `#888`. Drop the third `.meta` line from the row (put venue in `title` attribute if you must keep the string). Date: either drop it from the row or pin it as a **60px right column** on the same second line, still 12px sans, not a new row.

---

### [HIGH] Mobile library is a stacked essay, 123–179px per item

**Evidence.** `v11-library-mobile-390.png` (left 390 CSS): hairline gaps **246 / 282 / 357 physical = 123 / 141 / 179 CSS**. Header is three bands: wordmark, floating placeholder, then an `#ececee` “Added” chip + “Year” + “Title” + “9”. Each item is PDF + wrapped serif title + authors + venue + date **on its own line**.

```364:366:web/src/styles.css
  .row { grid-template-columns: 22px minmax(0, 1fr); min-height: 56px; }
  .row h2 { font-size: 15px; }
  .meta { flex-direction: column; gap: 2px; }
```

**Why it looks AI / ugly.** Zotero mobile is still a dense drill-down list. Miniflux on a phone is still one title + one meta line. `flex-direction: column` on `.meta` turns the date into a fourth text line and explodes the row. 15px serif titles wrapping two–three times is a reading-list blog, not a library. Nine papers already feel like a long scroll of cards that forgot their borders.

**Fix.** Same 61px / two-line row as desktop. Do not stack `.meta`. Truncate the second line. Keep title at 13px, one line. The 390 screenshot should show ~10–12 item starts, not three fat entries.

---

### [HIGH] Desktop reader eats the `#d4d4d7` canvas (fit-width branded as 100%)

**Evidence.** `v11-reader-desktop-1440.png` and `v11-reader-desktop-page3.png`: at mid-page, gray is only **x=0–24 CSS and x=1416–1440**. Page white is **1392 CSS** wide. Toolbar label is **100%**.

```258:260:web/src/PdfReader.tsx
              const fit = Math.max(0.2, (widths - 48) / size.width);
              const scale = fit * zoom;
```

```262:263:web/src/styles.css
.zoom-label {
  ...
}
```

`zoom === 1` means *fit width minus 48px*, not PDF user-space 100%. A US-letter page at real 100% is ~816 CSS and would sit in a **gray field**. Here the benchmark color is a 24px sliver. Page 3 looks like a white sheet taped under a bar, not a page in a viewer.

**Why it looks AI / wrong.** PDF.js’s whole identity is *gray room, white paper*. You copied the hex and then zoomed it out of existence. “100%” on a fit-width scale is a fake control — the same tell as a generated dashboard that draws a zoom widget and wires it to `scale=1`.

**Fix.** Default `zoom` so that `scale === 1` in PDF space (page-actual), or label the button **Fit** and keep a real **100%** that is `device` 96dpi of the PDF. Keep at least **48–72px** gray on each side at 1440 (`widths - 144` or cap page CSS width at `min(fit, 1)`). `.pdf-page { margin: 16px auto; }` not `10px`. The page-3 screenshot must show a visible `#d4d4d7` band, not a hairline.

---

### [HIGH] Reader toolbar is a title bar with widgets stuffed on the right

**Evidence.** `v11-reader-desktop-1440.png` toolbar crop: left = “Library” + full serif title; then **~505 CSS of empty `#f9f9fa`**; right = `[1] / 5 | − 100% + | 🔍 Open PDF`. `v11-reader-desktop-page3.png` identical hole. `v11-reader-mobile-390.png`: title crushed to `Remember...` (`max-width: 42vw`) while the same widgets fight for the rest of 390.

```210:226:web/src/styles.css
.reader-tools {
  display: flex;
  align-items: center;
  gap: 2px;
  min-height: 32px;
  padding: 0 8px;
  ...
}
```

```221:226:web/src/styles.css
.reader-tools .back { margin-right: 8px; }
.reader-tools .read-id {
  flex: 1;
  min-width: 0;
  margin-right: 8px;
}
```

**Why it looks AI.** PDF.js is **left group / center page field / right zoom**. The page number is the product. Here the page field is a default `<input>` kicked to the far right so a serif headline can play “article chrome.” The empty middle is dead. On 390 the title is the first word of the paper plus an ellipsis — ornament that stole space from the only controls that matter.

**Fix.** CSS grid on `.reader-tools`: `grid-template-columns: minmax(0,1fr) auto minmax(0,1fr); height: 32px`. Left: `Library` only (drop the in-bar title, or ellipsis it *after* the center group has its width). Center: page input + `/ N`. Right: −  zoom  +  find. `PaperPage` `Chrome` should not inject an `<h1>` into the tool row. `document.title` already carries the paper name.

---

### [HIGH] Search is a ghost — the bar looks unfinished

**Evidence.** `v11-library-desktop-1440.png`: “Search titles, authors, venues” is `#6e6e73` floating in the header with **no box, no icon, no bottom rule** until focus. `v11-library-mobile-390.png`: the same placeholder sits on its own row under the wordmark, still unboxed.

```63:73:web/src/styles.css
.lib-search {
  width: 100%;
  max-width: 28rem;
  border: 0;
  border-bottom: 1px solid transparent;
  background: transparent;
  padding: 3px 0;
  border-radius: 0;
}
.lib-search:focus { border-bottom-color: var(--ink); }
```

**Why it looks AI / ugly.** Invisible-until-focus fields are a generated-minimalism tic. Zotero and linkding draw a **rectangular control** of toolbar height. Miniflux draws a real input. A transparent field with a long marketing placeholder (`titles, authors, venues`) looks like lorem for a search that was never styled. On mobile it is a whole wasted row of gray words.

**Fix.** `.lib-search { height: 24px; border: 1px solid var(--line-strong); background: #fff; padding: 0 8px; max-width: 20rem; }`. Placeholder: `Search`. Same height as the sort controls. Do not pill it.

---

### [HIGH] Monospaced “9” and monospaced dates — developer chrome on a reading list

**Evidence.** `v11-library-desktop-1440.png` header far right: a tiny **“9”** in `ui-monospace` 11px. Every row’s `6 Sept 2026` / `2 Sept 2026` is the same face (`font-family: var(--mono)`). Most visible dates are the **same string**, so the right edge is a column of identical code-looking stamps.

```85:90:web/src/styles.css
.count {
  font-family: var(--mono);
  font-size: 11px;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}
```

```141:146:web/src/styles.css
.meta time {
  font-family: var(--mono);
  font-size: 11px;
  ...
}
```

**Why it looks AI.** The user reference is explicit: Miniflux = **no mono chrome**. Tabular Menlo next to Source Serif is the “I am a tasteful engineer” costume. Zotero counts and dates are system sans. A census glyph and a date stamp in SF Mono say *demo dashboard*, not *library*.

**Fix.** `.count` and `.meta time` → `font-family: inherit; font-size: 12px; font-variant-numeric: tabular-nums;` (tabular-nums on system sans is enough). If the date stays, it is a column, not a mono caption.

---

### [MEDIUM] Hairlines run the full column — icon gutter is not a gutter

**Evidence.** `v11-library-desktop-1440.png`: `#e1e1e1` rules from the left edge of the 1040 column to the right. The “PDF” word sits *on* the rule, not in a continuous icon rail. Zotero insets the rule **38px** so the 28px type column reads as one vertical band.

```93:100:web/src/styles.css
.row {
  ...
  border-bottom: 1px solid var(--line);
```

**Why it looks wrong.** Full-bleed rules under fat padding turn each item into a **card outline that forgot the other three sides**. Miniflux separates entries with rhythm, not a spreadsheet. Inset hairlines are what make a Zotero row a row.

**Fix.** `border-bottom: 0;` plus `.row { box-shadow: inset 0 -1px 0 var(--line); padding-left: 0; }` and `.row { padding-left: 0; }` with the rule starting at `background` / `linear-gradient` from **38px**, or `border-bottom` on the text cell only. Keep the 28px first column visually unbroken.

---

### [MEDIUM] “PDF” is a 10px badge, not an icon — and it does not match the reader

**Evidence.** Every library row (`v11-library-desktop-1440.png`, `v11-library-mobile-390.png`): uppercase `PDF` at 10px, `#6e6e73`, `letter-spacing: 0.04em`, parked at the top of the gutter, **not** vertically centered on the 86px (or 61px) row. Reader chrome uses 16×16 **filled SVG** paths (`PdfReader.tsx` `Icon`). Library has zero icons. “Open PDF” on the reader is **text**.

```109:115:web/src/styles.css
.gutter {
  padding-top: 4px;
  font-size: 10px;
  letter-spacing: 0.04em;
  color: var(--muted);
  text-transform: uppercase;
}
```

**Why it looks AI.** Mixed type-as-icon, SVG-as-icon, and label-as-button is the “I generated three components” look. Zotero’s 28px column is a **pictogram**, vertically centered. A tiny `PDF` stamp is a leftover chip from the retired card era.

**Fix.** Replace the word with one 16×16 document-page path (same stroke/fill language as the reader `Icon`), `align-self: center`, color `#888`, no letter-spacing, no uppercase. Hide the cell when `!has_pdf`. Make “Open PDF” the **same icon + text** or icon-only with `aria-label`, not a stray caption.

---

### [MEDIUM] Active sort is a gray chip

**Evidence.** `v11-library-desktop-1440.png` (physical chip at x≈2150, `#ececee`). `v11-library-mobile-390.png` y≈80–100 CSS: “Added” sits in a filled rectangle. CSS `border-radius: 0` (not a pill — the chip is still a stamp).

```76:84:web/src/styles.css
.sorts button {
  border: 0;
  background: none;
  padding: 3px 7px;
  color: var(--muted);
  border-radius: 0;
}
.sorts button.on { color: var(--ink); background: #ececee; }
```

**Why it looks AI.** Segmented-control leftover. Zotero sorts with column headers or plain text. Miniflux uses a control that looks like the rest of the form. A floating gray rectangle around one word, tight 3px padding, next to a mono “9”, is admin-kit residue.

**Fix.** `.sorts button.on { background: none; color: var(--ink); box-shadow: inset 0 -2px 0 var(--ink); }` or a native `<select>`. Match search height (24px). No fill.

---

### [MEDIUM] Two muted lines collapse; `#6e6e73` is used for everything secondary

**Evidence.** `v11-library-desktop-1440.png` row 1: authors `Baichuan Li, Junyi Yao, Zihao Zheng` and meta `2026 · Computer Science - Computation and Language` are the **same ink** (`--muted: #6e6e73`) at 13px then 12px. Second line does not read as *the* second line. Zotero’s second line is one string at `#888`.

```129:140:web/src/styles.css
.authors {
  margin: 3px 0 0;
  color: var(--muted);
  font-size: 13px;
}
.meta {
  margin: 3px 0 0;
  ...
  font-size: 12px;
  color: var(--muted);
}
```

**Why it looks ugly.** Hierarchy by *repeating gray* is what models do when they cannot edit. You cannot scan author vs venue. The long arXiv category string is a third-weight that never arrives.

**Fix.** Delete one of the lines (see HIGH row fix). Survivor: `color: #888; font-size: 12px; line-height: 1.3;`. Stop using `--muted` for wordmark-adjacent chrome that should stay `#222`.

---

### [MEDIUM] Library chrome is not a toolbar

**Evidence.** `v11-library-desktop-1440.png`: header is **white**, not `#f9f9fa`. Only a `#c7c7c7` rule under the row. Height is implicit (`min-height: 32px` + `padding-bottom: 8px`) and the wordmark / ghost search / chips do not share one control height. Benchmark steal-this: toolbar `#f9f9f9` / `#f9f9fa`, 32px, `#b8b8b8` bottom.

```46:54:web/src/styles.css
.lib-bar {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto auto;
  gap: 10px 20px;
  align-items: center;
  min-height: 32px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--line-strong);
}
```

**Why it looks AI.** A white masthead with a tracked wordmark (`letter-spacing: -0.02em`) is a startup header. Zotero’s top is a **tool strip**. You already copied `#f9f9fa` for the reader and then refused it on the library, so the two pages do not belong to one product.

**Fix.** `.lib-bar { height: 32px; padding: 0 12px; background: #f9f9fa; border-bottom: 1px solid #b8b8b8; gap: 8px; }`. `.mark { font-size: 13px; font-weight: 600; letter-spacing: 0; }`. Align search, sorts, count to 24px inside that 32.

---

### [MEDIUM] Wordmark tracking and 64px page footer — landing-page leftovers

**Evidence.** `v11-library-desktop-1440.png` bottom: after the last hairline, a long pause, then `Published from a private Zotero collection. The operator is responsible for what appears here.` at 12px `#6e6e73`, `max-width: 34rem`, `margin-top: 40px`. Body padding-bottom is **64px**.

```58:61:web/src/styles.css
.mark {
  font-size: 14px;
  font-weight: 600;
  letter-spacing: -0.02em;
```

```148:153:web/src/styles.css
.colophon {
  margin-top: 40px;
  font-size: 12px;
  color: var(--muted);
  max-width: 34rem;
}
```

**Why it looks AI.** Tight negative tracking on a camelCase name is generated-brand. The colophon is a terms-of-service haiku — the sentence *The operator is responsible for what appears here* is template legal, not UI. 64+40px of air under nine rows is a homepage that expects a fold. Miniflux does not sign off under the feed. Zotero does not publish a disclaimer as layout.

**Fix.** `letter-spacing: 0` on `.mark`. `.lib { padding-bottom: 16px; }`. `.colophon { margin-top: 16px; max-width: none; font-size: 11px; }`. One line, same sans, no essay measure.

---

### [MEDIUM] Page input is a raw HTML box; zoom is three mismatched glyphs

**Evidence.** `v11-reader-desktop-1440.png` right cluster: white 20px-tall field, 1px `#c7c7c7`, value `1`, then `/ 5`, then a minus **bar**, `100%` as a button, a plus, then a filled magnifier, then **text** “Open PDF”. Vertical rhythm is 32px bar vs 20px input. Separators are 14×1 `#c7c7c7`.

```253:261:web/src/styles.css
.page-readout input {
  width: 2.6rem;
  height: 20px;
  text-align: right;
  border: 1px solid var(--line-strong);
  background: #fff;
  padding: 0 4px;
  border-radius: 0;
}
```

**Why it looks AI / ugly.** This is the unstyled-form kit. PDF.js page field is a designed  toolbar widget, icons are one family at 16px / 0.7 opacity. Here: filled custom paths + text percent + caption “Open PDF”. The 100% label is also a **lie** (see HIGH fit-width). On `v11-reader-mobile-390.png` the same box sits in a cramped row and the title is already gone.

**Fix.** Input `height: 22px; border-color: #b8b8b8; background: #fff;`. All tool buttons `width: 28px; height: 24px` with **one** 16px icon set (including a real zoom-in / zoom-out, not `M3 7.5h10v1H3z`). Zoom readout is not a button styled like a link. “Open PDF” becomes the same 16px icon. `opacity: 0.7` default, `1` hover — you are already close (`0.78`).

---

### [MEDIUM] Toolbar border is `#e1e1e1`, not PDF.js `#b8b8b8` — chrome does not read as a bar

**Evidence.** Reader PNGs: the rule under the 32px `#f9f9fa` band samples **(225,225,225)** = `#e1e1e1` (`--line`), then the viewport `#d4d4d7`. The bar almost dissolves into the page on page 1 (white-on-near-white title area).

```170:179:web/src/styles.css
.read-bar {
  ...
  height: 32px;
  ...
  background: var(--bg-bar);
  border-bottom: 1px solid var(--line);
}
```

`.reader-tools` uses the same `--line`.

**Why it looks wrong.** PDF.js uses `--toolbar-border-color: rgb(184 184 184)`. A 1px `#e1e1e1` on `#f9f9fa` is a suggestion, not a toolbar. Combined with the vanished gray canvas, the reader looks like a white page with a faint hat.

**Fix.** `--line-toolbar: #b8b8b8`. Both `.read-bar` and `.reader-tools` and `.findbar` use it. Keep `#e1e1e1` for list rows only.

---

### [MEDIUM] Page shadow is a 4px rumor — or a card, depending on the crop

**Evidence.** Desktop page-corner crop: first white pixel at physical x=48; x−4 is `#ceced1`, x−8 is already `#d4d4d7`. That is `box-shadow: 0 1px 3px rgb(0 0 0 / 0.22)` failing against `#d4d4d7`. Mobile page-gap crop (`v11-reader-mobile-390.png` around the page break) reads as a **soft card shadow** in the gutter between pages (`margin: 10px auto`).

```306:314:web/src/styles.css
.pdf-page {
  ...
  margin: 10px auto;
  background: #fff;
  box-shadow: 0 1px 3px rgb(0 0 0 / 0.22);
}
```

**Why it looks AI.** Either the page is a sticker with no edge, or two floating cards in a gray void. PDF.js pages have a **thin, even, boring** edge. A 22% 3px shadow is the Tailwind `shadow-sm` default. 10px gaps plus shadow = card stack, which this pass was supposed to kill.

**Fix.** `box-shadow: 0 0 0 1px rgb(0 0 0 / 0.18);` (hairline, not blob). `margin: 16px auto`. No extra radius (already 0 — keep it).

---

### [MEDIUM] Loading, empty, and error states are leftover wireframes

**Evidence (code; not in the five happy-path PNGs, still public UI).**

Library skeleton: seven `.row-skel` at 61px with two gray bars (62% / 38%) — the generic “AI list loading” drawing.

```154:160:web/src/styles.css
.row-skel {
  height: 61px;
  border-bottom: 1px solid var(--line);
  background:
    linear-gradient(var(--line) 11px, transparent 11px) 38px 16px / 62% 11px no-repeat,
    linear-gradient(var(--line) 8px, transparent 8px) 38px 34px / 38% 8px no-repeat;
}
```

Empty: `<p class="note">No matching papers.</p>` / `No papers published yet.` — 28px padding, muted, in the magazine column.

Reader load (`PaperPage` `!paper`): a `.read-bar` (not `.reader-tools`) with serif `Opening…`, then a blank `#d4d4d7` slab. `PdfReader` then paints `Opening PDF…` in `.reader-status` at 48px padding.

No-PDF route: `.lib` + note + a **raw `<h2>`**. `.row h2` styles do not apply. Browser default heading on a white column.

Error: `Library — this paper is not available.` as a muted paragraph.

**Why it looks AI.** Skeleton bars at magic percentages are the loading state every generator emits. “Opening…” with an ellipsis in a display serif is a splash, not chrome. Dumping errors into the library template with unstyled `h2` says the happy path was the only designed path.

**Fix.** Skeleton: **one** 13px-high rule per 61px row, full inset width, no dual-bar illustration. Loading reader: reuse `.reader-tools` (same 32px grid as the real bar), sans `Opening`, no second status poem — or a single `.reader-status` in 13px sans, `#3a3a3c`, `padding: 24px`, not 48. No-PDF / 404: same `.lib-bar` + one 13px sans sentence. Never a naked `h2`.

---

### [MEDIUM] Find bar is a second toolbar the screenshots hide

**Evidence.** Opening find (`PdfReader.tsx`) injects `.findbar` at **28px** under the 32px tools — two chrome rows, second input, mono `.find-count` (`N pages`). Not in the five PNGs; one shortcut (`⌘F`) away on the public reader.

```269:277:web/src/styles.css
.findbar {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 10px;
  background: var(--bg-bar);
  border-bottom: 1px solid var(--line);
}
```

**Why it looks wrong.** PDF.js findbar is a designed slide under **one** toolbar language. A 28px cousin with a default `type="search"` and a mono hit census is more developer chrome (see HIGH mono). On 390 it will stack under an already packed 32px row.

**Fix.** Keep one 32px row: when find is on, **replace** the center page group with the find field (PDF.js-style), or overlay the field in the existing bar. `.find-count` inherits sans. Same `#b8b8b8` input as the page field.

---

### [MEDIUM] Mobile reader toolbar is a collision, not a viewer

**Evidence.** `v11-reader-mobile-390.png`: “Library” + `Remember...` (`max-width: 42vw` ≈ 164px) + page box + zoom + find, in 32px. CSS hides `.open-pdf` and `.zoom-label` at `max-width: 720px`, so the 390 bar should already be icon soup plus a truncated serif. The page itself is fit-width with 24px gray — acceptable on 390 — but the chrome is the ugly part.

```367:370:web/src/styles.css
  .read-id h1 { font-size: 12px; }
  .reader-tools .open-pdf { display: none; }
  .zoom-label { display: none; }
  .reader-tools .read-id { max-width: 42vw; }
```

**Why it looks ugly.** PDF.js on a narrow window **keeps the page field** and drops the novel. You kept the novel’s first word and dropped the zoom number. 42vw of dead title is why the tools feel jammed. This is Claude-layout: *always show the article title*.

**Fix.** At `max-width: 720px`, `.read-id { display: none; }`. Left = `Library`. Center = page. Right = − + find. Height stays 32. Do not hide zoom buttons; hide the title.

---

### [MEDIUM] Dead markup and two toolbars in CSS

**Evidence.** `.read-id p { display: none; }` — `PaperPage` still renders authors · year into the DOM. `.read-bar` is a second 32px spec used only on the loading branch; the live reader uses `.reader-tools`. Two sources of chrome = two chances to drift (already true: loading has no page widgets).

```198:200:web/src/styles.css
.read-id p {
  display: none;
}
```

**Why it looks AI.** Hidden subtitle blocks are what you get when a generator designs a two-line header and then a human comments it out in CSS. The loading bar not matching the real bar is the same unfinished-kit smell as the ghost search.

**Fix.** Delete the `<p>` from `Chrome`. Delete `.read-bar` or make loading mount `PdfReader`’s toolbar shell empty. One class, one height, one border token.

---

### [LOW] Hover and selection do not exist in the screenshots because they barely exist in CSS

`.row:hover { background: #00000008 }` is a 3% wash. Zotero selected = `#4072e5` / white. `--accent: #4072e5` is declared and then used only on `:focus-visible`. A library you cannot point at is a static export. **Fix:** hover `#f2f2f2`; `:focus-visible` / `[aria-current]` row `#4072e5` and `color: #fff` (muted children inherit). Not a new feature — it is the Zotero row spec you cited and skipped.

---

### [LOW] Default scrollbars, no page-edge rhythm

Neither desktop PNG shows a scrollbar (nine 86px rows + header still fit 900; reader overlay-scrolls on `#d4d4d7`). When rows go to 61px and the list is full-bleed, macOS overlay scroll on white will be fine; on the reader, a light scrollbar against `#d4d4d7` is what PDF.js has. **Fix:** `scrollbar-color: #b8b8b8 #d4d4d7` on `.reader-scroll` only. Do not invent a custom styled thumb.

---

### [LOW] `:focus { outline: none }` then a 2px accent ring

Fine for a11y if `:focus-visible` holds, but the 8% accent wash on the whole row (`color-mix(in srgb, var(--accent) 8%, transparent)`) is the soft-purple-adjacent focus treatment generators love. **Fix:** 2px inset or the Zotero fill, not a tinted card.

---

## Prioritized fix list (HIGH then MEDIUM)

Do these in order. Each item is CSS/component. None of them add product surface.

### HIGH

1. **Kill the 1040 column.** `.lib` full-bleed; `.lib-bar` 32px `#f9f9fa` / `#b8b8b8`.
2. **Kill Source Serif 4.** Remove Google Fonts. Titles and reader `h1` become 13px system sans, one line, ellipsis.
3. **Force 61× two-line rows.** Title + `authors · year` at `#888`. No third meta line. No 16px serif wrap. Desktop **and** mobile.
4. **Page-actual (or honest Fit) + real gray gutters on 1440.** Stop labeling fit-width as `100%`. `#d4d4d7` must be a band, not a sliver. Page margin ≥16px.
5. **PDF.js three-zone toolbar.** Center the page field. Drop the in-bar serif title (keep `document.title`). Mobile: hide `.read-id`, keep page + zoom + find.
6. **Draw the search.** 24px white rectangle, 1px `#b8b8b8`, placeholder `Search`.
7. **No mono chrome.** `.count` and `time` inherit sans. Tabular-nums only.

### MEDIUM

8. **Inset hairlines at 38px.** Icon column reads as one rail.
9. **One icon language.** 16px document glyph in the library gutter; same family for zoom/find/open. Delete the `PDF` word and the naked “Open PDF” caption.
10. **Sort = underline or `<select>`, not `#ececee` fill.**
11. **One secondary line at `#888`.** Stop painting authors and venue the same gray at two sizes.
12. **Library bar = reader bar.** 32px, `#f9f9fa`, `#b8b8b8`, wordmark 13px / `letter-spacing: 0`.
13. **Colophon and 64px bottom pad.** 16px, 11px, one line, no 34rem measure.
14. **Toolbar widgets.** 22px page field, `#b8b8b8`, 0.7 icon opacity, honest zoom label.
15. **Page edge = 1px hairline**, not `0 1px 3px` card shadow.
16. **Loading / empty / no-PDF / 404** use the same 32px bar + 13px sans sentence. Skeleton = one bar per row. No raw `h2`.
17. **Find replaces the center group** (or stays in the 32px bar). No 28px second strip, no mono hit count.
18. **Delete dead `.read-id p` and the extra `.read-bar` path.**

---

## Would a stranger still see an AI demo?

**YES.**

The cream hero and Fraunces masthead are gone. What replaced them is the *other* generated default: a **Google-serif bibliography in a centered white column**, ghost search, gray sort chip, Menlo census, and a legal sentence under the list — with a PDF.js costume (correct `#f9f9fa` / `#d4d4d7` tokens) that immediately cheats by **fit-width-as-100%** so the gray room disappears, then puts a **serif headline in the tool strip** and a stock number input on the right. Zotero is dense and cruel about space. Miniflux is a human list in one sans face. PDF.js is a gray stage with a boring 32px instrument cluster. This build is still a writing-app theme wearing a viewer’s colors. A stranger who had never heard of wePaper would not think “working library.” They would think “LLM output, second pass.”
