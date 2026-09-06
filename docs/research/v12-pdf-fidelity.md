# V1.2 PDF fidelity investigation

**Date:** 2026-09-07  
**Scope:** `web/src/PdfReader.tsx`, production transport at `https://wepaper.plainlist.space`  
**Sample PDF:** `PSELS7ZT` (US Letter, 612×792 pt at PDF scale 1)

---

## Executive summary

| Question | Answer |
|----------|--------|
| Is transport a real PDF? | **Yes** — `application/pdf`, magic `%PDF-1.7`, HTTP `206` Range |
| Primary blur cause | **Bitmap under-resolution for display size**: `devicePixelRatio` **capped at 2** (1.5× deficit on 3× Retina at fit-width) plus **default 100% = PDF scale 1 (612 CSS px)**, which looks small/soft vs Chrome/Zotero/Preview that default to fit-width at native DPI |
| Does zoom CSS-stretch? | **No** — `scale` is in `useEffect` deps; zoom/fitWidth changes trigger `getViewport` + full re-render |
| 800×1100 → 1400×1900 stretch? | **Observed ratio matches Letter at scale ~1.31 vs ~2.29** (802×1038 → 1401×1814). Not a permanent code path that sets mismatched backing vs CSS, but it **is** what users see when comparing actual-size (~612–802 CSS px) to fit-width (~1296–1401 CSS px) without a sharp re-render at the higher scale |
| Max zoom | **3** (`Math.min(3, …)` in keyboard + button handlers) |

**Concrete blur cause:** canvas backing store is `floor(viewport × min(devicePixelRatio, 2))` while fit-width display needs ~2.1× larger CSS viewport; on 3× displays the cap yields **~1.5× too few physical pixels** for fit-width, and at default 100% the page is rendered at **612 CSS px** instead of the ~1296 px fit-width size native viewers use — so text looks smaller and softer than Chrome/Zotero/Preview.

---

## Production transport verification

Verified with forced DNS (Clash-safe):

```bash
curl -sI --resolve wepaper.plainlist.space:443:175.24.134.228 \
  https://wepaper.plainlist.space/paper/PSELS7ZT/pdf

curl -s --resolve wepaper.plainlist.space:443:175.24.134.228 \
  -H "Range: bytes=0-7" \
  https://wepaper.plainlist.space/paper/PSELS7ZT/pdf | xxd

curl -sI --resolve wepaper.plainlist.space:443:175.24.134.228 \
  -H "Range: bytes=0-1023" \
  https://wepaper.plainlist.space/paper/PSELS7ZT/pdf
```

| Check | Result |
|-------|--------|
| `Content-Type` | `application/pdf` |
| Magic bytes | `%PDF-1.7` |
| Full GET | `200`, `content-length: 227651`, `accept-ranges: bytes` |
| Range GET | `206 Partial Content`, `content-range: bytes 0-1023/227651` |
| ETag | present (checksum-based) |

**Conclusion:** Transport is correct. Blur is entirely client-side rendering math, not a rasterized proxy or wrong MIME type.

---

## Current render pipeline (`PdfReader.tsx`)

### Scale selection

```306:307:web/src/PdfReader.tsx
              const scale = fitWidth ? Math.max(0.2, (widths - 144) / size.width) : zoom;
              const css = { width: size.width * scale, height: size.height * scale };
```

| Mode | `scale` | Label in toolbar |
|------|---------|------------------|
| Default | `zoom` (initial **1**) | `100%` |
| Fit width (toggle or auto) | `(widths - 144) / pageWidth` | `Fit` |
| Auto fit-width trigger | `pageWidth > widths - 48` → `setFitWidth(true)` | — |

- `widths` = scroller `clientWidth` via `ResizeObserver` (initial state **720** before first measure).
- `fitWidth` and `zoom` are **mutually exclusive** in scale math; zoom buttons call `setFitWidth(false)` first.
- Page container: `width: css.width`, `minHeight: css.height`.
- Canvas CSS: `viewport.width/height` from `getViewport({ scale })` — same scale as container for uniform pages.

### Canvas backing store (exact math)

```357:369:web/src/PdfReader.tsx
      const viewport = pdfPage.getViewport({ scale });
      ...
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(viewport.width * ratio);
      canvas.height = Math.floor(viewport.height * ratio);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      const context = canvas.getContext("2d");
      ...
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      renderTask = pdfPage.render({ canvasContext: context, viewport, canvas });
```

**Formulas (US Letter, width \(W_0=612\), height \(H_0=792\)):**

| Symbol | Formula |
|--------|---------|
| PDF scale | `s = fitWidth ? (widths - 144) / W_0 : zoom` |
| CSS size | `W_css = W_0 × s`, `H_css = H_0 × s` |
| DPR cap | `r = min(devicePixelRatio, 2)` |
| Backing store | `W_back = floor(W_css × r)`, `H_back = floor(H_css × r)` |
| Physical pixels needed (true 1:1) | `W_phys = W_css × devicePixelRatio` |
| Sharpness deficit | `W_phys / W_back` (= 1 at DPR≤2; **1.5 at DPR=3** with cap) |

**Does not use:** `pdfjs.OutputScale`, `setLayerDimensions`, or `transform` passed into `render()`.

### Worked examples (Letter, DPR=2)

| Scenario | `s` | CSS (W×H) | Backing @ r=2 | Notes |
|----------|-----|-----------|---------------|-------|
| Desktop 1440, zoom 100%, no fit | 1.00 | 612×792 | 1224×1584 | Sharp at 2×, but **small** in ~1440px scroller |
| Desktop 1440, fit width | 2.12 | 1296×1677 | 2592×3354 | Sharp at DPR≤2 |
| Desktop 1440, fit width, **DPR=3** | 2.12 | 1296×1677 | 2592×3354 | Needs 3888 px width; **33% soft** |
| Mobile 390, auto fit | 0.40 | 246×318 | 492×636 | Sharp but tiny |
| Zoom 200% | 2.00 | 1224×1584 | 2448×3168 | Re-rendered, not stretched |
| Zoom 300% (max) | 3.00 | 1836×2376 | 3672×4752 | Re-rendered |

### Worked examples — the 800×1100 → 1400×1900 pattern

From `PSELS7ZT` page 1 (612×792 pt):

| PDF scale | CSS (W×H) | Backing @ r=2 |
|-----------|-----------|---------------|
| 1.00 | 612×792 | 1224×1584 |
| **1.31** | **802×1038** | **1603×2075** |
| 2.12 (fit @ 1440) | 1297×1679 | 2594×3358 |
| **2.29** | **1401×1814** | **2802×3627** |

The user-reported **~800×1100 backing / ~1400×1900 display** is exactly **Letter at scale ~1.3 rendered vs scale ~2.3 displayed** — the ratio between fit-width on a 1440px scroller (~2.12×) and an intermediate or actual-size render (~1.0–1.3×).

Intermediate scale 1.31 occurs when `widths ≈ 932` (e.g. during ResizeObserver settling: initial `widths=720`, then partial layout). Each `scale` change **should** re-render (it's in effect deps), but the async `getPage` gap leaves the **previous bitmap** visible at the **new container size** until the new render completes.

### Zoom behavior

- Keyboard `+`/`-`/`0`: steps of **0.1**, clamped **[0.4, 3]**.
- Buttons: same via `bumpZoom(±0.1)`.
- **Re-render:** yes — `scale` prop changes → `useEffect([pdf, page, scale, active, query])` cancels prior task and calls `render()` again.
- **Not** implemented: CSS `transform: scale()` on the canvas.

### TextLayer

```377:384:web/src/PdfReader.tsx
      layer.style.width = `${viewport.width}px`;
      layer.style.height = `${viewport.height}px`;
      layer.style.setProperty("--total-scale-factor", String(scale));
      textLayer = new pdfjs.TextLayer({
        textContentSource: pdfPage.streamTextContent(),
        container: layer,
        viewport,
      });
```

- Uses PDF.js 5.x `TextLayer` class (not hand-built spans).
- `--total-scale-factor` set on both `.pdf-page` and text layer; CSS in `styles.css` drives font sizing via `--text-scale-factor`.
- Text layer scale matches canvas viewport scale; blur is on the **canvas bitmap**, not text-layer math.

### CSS (`styles.css`)

```290:291:web/src/styles.css
.pdf-page canvas { display: block; }
```

No `width: 100%`, no `image-rendering`, no CSS zoom on canvas. Explicit inline `style.width/height` from JS should prevent stretch **after first render completes**. First paint after mount (before `useEffect` runs) can briefly show default 300×150 canvas in a wide `.pdf-page` — flash only.

---

## Default 100% on Retina

PDF.js `scale: 1` means **1 PDF user unit = 1 CSS pixel** (72 pt page → ~612×792 CSS px for Letter).

| Viewer | Typical default | Effective scale on 1440px desktop |
|--------|-----------------|----------------------------------|
| **wePaper** | `zoom=1`, `fitWidth=false` (unless page wider than scroller−48) | **1.0×** → 612 px wide |
| **Chrome PDF** | Fit to page width / viewport | ~**2.0–2.3×** |
| **Preview** | Fit to window | ~**2.0×** |
| **Zotero PDF.js** | Fit page width | ~**2.0×** |

At 100% on a 2× Retina Mac:

- wePaper: 612 CSS px, 1224 backing px → **1:1 for DPR 2, but physically ~4.25″ wide** on screen.
- Native viewers at fit-width: ~1300 CSS px, ~2600–3900 backing px → **same physical width, 2× more pixels**.

**Result:** wePaper default looks **small and comparatively soft** — not because DPR math is wrong at scale 1, but because **scale 1 is the wrong default** for desktop reading vs native viewers.

---

## Native vs custom — why native looks sharper

| Factor | Chrome / Preview / Zotero | wePaper V1.2 |
|--------|----------------------------|--------------|
| Renderer | PDFium / Core Graphics / PDF.js in chrome | PDF.js → canvas |
| Default scale | Fit width (~2× on laptop) | PDF scale 1 (612 px) |
| DPR handling | Full device pixel ratio | **`min(DPR, 2)` hard cap** |
| HiDPI API | Native / `OutputScale` + `limitCanvas` | Manual `setTransform(ratio)` |
| Zoom | Re-rasterize | Re-render (correct) |
| Transport | Same PDF bytes | Same PDF bytes (verified) |

Native viewers are not magic — they render more pixels at the size users actually read. wePaper under-serves pixels at fit-width on 3× hardware and under-scales by default on desktop.

---

## Recommended PDF.js high-DPI recipe

Replace manual ratio math with the official viewer pattern (pdfjs-dist 5.7.x):

```typescript
import { OutputScale, setLayerDimensions } from "pdfjs-dist";

const viewport = page.getViewport({ scale });
const outputScale = new OutputScale(); // sx/sy = devicePixelRatio (uncapped)

// Optional: cap memory on huge pages (same as PDFPageView)
outputScale.limitCanvas(viewport.width, viewport.height, maxCanvasPixels, maxCanvasDim);

const canvas = canvasRef.current;
const sfx = approximateFraction(outputScale.sx); // or inline floor math
canvas.width = Math.floor(viewport.width * outputScale.sx);
canvas.height = Math.floor(viewport.height * outputScale.sy);
canvas.style.width = `${Math.floor(viewport.width)}px`;
canvas.style.height = `${Math.floor(viewport.height)}px`;

const transform = outputScale.scaled
  ? [outputScale.sx, 0, 0, outputScale.sy, 0, 0]
  : undefined;

await page.render({
  canvasContext: canvas.getContext("2d", { alpha: false }),
  viewport,
  transform,
  canvas,
}).promise;

setLayerDimensions(textLayerDiv, viewport);
```

**Changes vs today:**

1. **Remove `min(DPR, 2)`** — use full `OutputScale.pixelRatio` (optionally limit via `limitCanvas`, not a blind cap).
2. Pass **`transform` into `render()`** instead of pre-mutating the context with `setTransform`.
3. Use **`setLayerDimensions`** for canvas wrapper and text layer (handles rotation + CSS round).
4. Consider **`enableHWA: true`** in getDocument for GPU path (measure first).

---

## Recommended zoom steps (re-render each step)

Replace continuous ±0.1 with discrete presets; each step recomputes `getViewport({ scale })` and re-renders:

| Label | PDF scale `s` |
|-------|---------------|
| 100% | 1.0 |
| 125% | 1.25 |
| 150% | 1.5 |
| 175% | 1.75 |
| 200% | 2.0 |
| 250% | 2.5 |
| 300% | 3.0 |
| 400% | 4.0 |

- Raise max zoom from **3 → 4** if 400% is a product requirement.
- **Fit** remains a separate mode (not a zoom preset); toggling Fit exits zoom presets.
- Acceptance: at 200% vs 100%, canvas backing width **doubles** (`W_back_200 ≈ 2 × W_back_100`), not the same bitmap CSS-scaled.

---

## Implementation checklist (V1.2)

- [ ] Adopt `OutputScale` + `transform` in `render()`; drop DPR cap at 2
- [ ] Default desktop UX: **fit-width** (or remember last zoom) so first paint matches native viewers
- [ ] Debounce / coalesce `widths` from ResizeObserver before triggering re-render (avoid scale 1.31 → 2.12 flicker)
- [ ] Discrete zoom presets 100–400% with re-render
- [ ] Raise max zoom to 4 if 400% required
- [ ] Add dev-only assertion: `canvas.width ≈ canvas.clientWidth × effectiveDPR` after render
- [ ] Optional: `maxCanvasPixels` guard from PDF.js viewer defaults (~8192² area)

---

## References

- `web/src/PdfReader.tsx` — render path audited
- `web/src/styles.css` — `.pdf-page`, `.textLayer`
- `docs/pdf-reader-audit.md` — transport baseline
- `web/node_modules/pdfjs-dist/web/pdf_viewer.mjs` — `PDFPageView.draw()` (lines ~7199–7237)
- Production: `https://wepaper.plainlist.space/paper/{itemKey}/pdf`
