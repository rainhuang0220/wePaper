# wePaper V1.6 — Mobile product / UI review

**Role:** mobile product / UI review only.  
**Date:** 2026-09-07.  
**Style:** the current grayscale, system-sans look is acceptable. This note does not propose a visual redesign.

**Source of record:** the five PNGs below. Measurements are CSS pixels inside the capture (`1170×2532` = 390×844 @3×; `2880×1800` = 1440×900 @2×). Fixture titles are short, so long-title wrap is inferred, not shown.

| File | What it shows |
|------|----------------|
| `docs/screenshots/v16-library-mobile.png` | Library, iPhone-class width, two rows, empty status |
| `docs/screenshots/v16-status-mobile.png` | Same, status menu open on row 1 |
| `docs/screenshots/v16-discussion-mobile.png` | Discussion for “Fixture memory paper”, empty thread |
| `docs/screenshots/v16-library-desktop.png` | Library, 1440-wide, two rows, empty status |
| `docs/screenshots/v16-status-desktop.png` | Same, status menu open |

**Verdict (initial):** HIGH and MEDIUM defects are present. They are adaptation, hierarchy, and affordance failures — not a request for a new look.

**Addressed before ship:** HIGH 1 (icon + meta on one catalog row), HIGH 2 (empty status is a chip), MEDIUM 3–6 (comment underline, larger controls, status scrim, 16px composer / no resize grip). Re-captured in `docs/screenshots/v16-*-mobile.png`.

---

## HIGH

### 1. Catalog row is distorted on mobile

**Evidence.** Desktop (`v16-library-desktop.png`) is a 64px two-line catalog row: document icon in the left gutter beside the title; second line is one muted scan (`状态` · authors · year · `评论 · N`); added date sits on the right. Mobile (`v16-library-mobile.png`) turns the same item into a **~127px four-line stack**:

1. Title only (gutter empty)
2. `状态` alone
3. Document icon + authors · year
4. `评论 · N`

The icon is vertically centered on the author line (~160–174 CSS from the top of the first row), not on the title. `状态` sits in the text column, indented past the icon. Added date is gone. The second fixture row repeats the same warp.

**Why it is a defect.** The product is a catalog. Mobile does not keep the catalog grammar; it shears the row so the gutter icon, status, authors, and comments no longer share one item. Scanning two papers already feels like stacked cards with a floating file mark.

### 2. Empty reading-status has no label shape, and mobile isolates it

**Evidence.** In every screenshot the closed control is the word `状态` in `#888`, same size and weight as authors and `评论 · N`. No fill, no border, no chip. Desktop keeps that ghost word **inline** on the meta line (`v16-library-desktop.png`). Mobile promotes it to its **own line** between title and authors (`v16-library-mobile.png`). Opening the menu (`v16-status-mobile.png`, `v16-status-desktop.png`) is the first time status looks like a control: a real list, `无状态` highlighted. The seven values in the menu have no color or shape either.

**Why it is a defect.** Reading status is a first-class catalog action. Closed, it is indistinguishable from metadata. On mobile the stranded `状态` reads as a heading or leftover copy, not a picker, and it does not match the desktop inline placement. These captures never show an assigned status, so filled-chip behavior is not reviewed here.

---

## MEDIUM

### 3. Comments look like more metadata, not an entry to discussion

**Evidence.** `评论 · 0` / `评论 · 2` use the same 12px muted type as authors and `状态`. Desktop trails them on the meta line. Mobile gives them a fourth full-width line with no underline, icon, or button chrome (`v16-library-mobile.png`). On the discussion page the same string sits in the header as a non-control count (`v16-discussion-mobile.png`).

**Why it is a defect.** Discussion is a separate route. On a phone the only visible path is a line of gray type that does not look tappable. Hierarchy collapse: title is the only ink that reads as an action.

### 4. Filter / sort / search targets are too short and too close

**Evidence.** Mobile chrome is three wrapped rows (~96 CSS vs desktop’s 32px bar). Search is full-width but ~22–24 CSS tall. `全部` is a native select ~73×24 CSS. `Added` / `Year` / `Title` are 24px text buttons; glyph widths are ~53 / 23 / 16 CSS, with about 14 CSS between the Year and Title hit boxes. The paper count `2` visible on desktop is hidden.

**Why it is a defect.** These are the only catalog controls. 24px height and tight sort spacing invite mis-taps. The wrap is a fair mobile move; the control size is not.

### 5. Status popover erases the row it belongs to

**Evidence.** `v16-status-mobile.png`: menu is ~221×356 CSS (seven rows at ~51 CSS — the rows themselves are fine). It opens under `状态` and covers that paper’s icon, authors, comments, and the next title. No scrim. Desktop (`v16-status-desktop.png`) also overlaps the following row, but the title and right-hand date stay in view.

**Why it is a defect.** After tap, the phone keeps the title and a menu. It is easy to lose which paper is being labeled, and there is no dimmed backdrop to dismiss against.

### 6. Discussion page is a desktop composer on a phone

**Evidence.** `v16-discussion-mobile.png`:

- Textarea shows a **desktop resize grip** (two diagonal marks in the bottom-right corner).
- `发布` is a 52×32 CSS outline button, left-aligned, same 1px `#b8b8b8` chrome as the fields.
- Signature field is ~37 CSS tall; header is ~36 CSS (`← Library` / `评论 · 0`).
- Empty-state sentence is the same muted note type as the library colophon.

**Why it is a defect.** The page is usable but not adapted: a grip that does nothing useful on touch, a primary action that is smaller and quieter than the text box above it, and a header count that looks like the catalog’s comment link but is not one.

---

## LOW

- **Title wrapping** is not exercised. Both fixtures stay on one line. Mobile already spends three extra lines under the title; a wrapping title will make the catalog distortion worse. Desktop ellipsizes.
- **Paper count** (`2`) is omitted on mobile. Fine if the filter row needs the space; it is still a small information loss vs desktop.
- **Discussion header `评论 · 0`** repeats the catalog string in a slot that is not a link. Confusing if you just tapped `评论 · 0` to get here.

---

## Out of scope

- New palette, type, or marketing chrome.
- EN/ZH mix in chrome (`Search` / `Added` vs `全部` / `状态` / `评论`). Visible, but not an adaptation defect.
- Assigned-status colors (not in these screenshots).
- Reader / PDF chrome (not in these screenshots).
