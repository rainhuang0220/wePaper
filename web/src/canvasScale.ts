export const MAX_CANVAS_PIXELS = 32_000_000;
export const MAX_DPR = 3;

export function outputScale(cssWidth: number, cssHeight: number, dpr: number): number {
  const area = Math.max(cssWidth, 1) * Math.max(cssHeight, 1);
  const want = Math.min(Math.max(dpr || 1, 1), MAX_DPR);
  if (area * want * want <= MAX_CANVAS_PIXELS) return want;
  return Math.max(1, Math.sqrt(MAX_CANVAS_PIXELS / area));
}

export function backingStore(
  cssWidth: number,
  cssHeight: number,
  dpr: number,
): { width: number; height: number; ratio: number } {
  const ratio = outputScale(cssWidth, cssHeight, dpr);
  return {
    width: Math.floor(cssWidth * ratio),
    height: Math.floor(cssHeight * ratio),
    ratio,
  };
}
