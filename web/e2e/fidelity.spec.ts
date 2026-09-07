import { expect, test, type Page } from "@playwright/test";

const PAPERS = ["PSELS7ZT", "3FYGRVK7", "PAS2TSBP"] as const;

async function firstPageReady(page: Page) {
  await expect(page.locator('.reader-scroll[data-first-ready="true"]')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('.page[data-page-number="1"] canvas').first()).toBeVisible();
}

async function maxBacking(page: Page) {
  return page.locator('.page[data-page-number="1"]').evaluate((el) => {
    const widths = [...el.querySelectorAll("canvas")].map((node) => (node as HTMLCanvasElement).width);
    return widths.length ? Math.max(...widths) : 0;
  });
}

async function zoomToAtLeast(page: Page, percent: number) {
  const label = page.locator(".zoom-label");
  if ((await label.textContent()) === "Fit") {
    const prior = await maxBacking(page);
    await page.getByLabel("Actual size").evaluate((el) => (el as HTMLButtonElement).click());
    await expect(label).toHaveText("100%");
    await expect.poll(async () => maxBacking(page), { timeout: 10_000 }).not.toBe(prior);
  }
  for (let step = 0; step < 40; step += 1) {
    const text = (await label.textContent()) ?? "";
    const value = Number.parseInt(text, 10);
    if (Number.isFinite(value) && value >= percent) {
      await expect.poll(async () => maxBacking(page), { timeout: 10_000 }).toBeGreaterThan(0);
      return value;
    }
    await page.getByLabel("Zoom in").evaluate((el) => (el as HTMLButtonElement).click());
    await expect
      .poll(async () => Number.parseInt((await label.textContent()) ?? "", 10), { timeout: 10_000 })
      .toBeGreaterThan(Number.isFinite(value) ? value : 0);
  }
  throw new Error(`could not reach ${percent}%`);
}

for (const key of PAPERS) {
  test(`${key} zoom 100-400 re-renders`, async ({ page }) => {
    await page.goto(`/paper/${key}`, { waitUntil: "domcontentloaded" });
    await firstPageReady(page);
    await expect(page.locator('.page[data-page-number="1"] .textLayer')).not.toHaveText("", { timeout: 10_000 });
    const widths: number[] = [];
    const canvasCounts: number[] = [];
    for (const percent of [100, 200, 300, 400]) {
      await zoomToAtLeast(page, percent);
      await expect.poll(async () => maxBacking(page), { timeout: 15_000 }).toBeGreaterThan(0);
      widths.push(await maxBacking(page));
      canvasCounts.push(await page.locator('.page[data-page-number="1"] canvas').count());
    }
    expect(
      widths[1] > widths[0] || canvasCounts[1] > 1,
      `${key} 200% ${widths[1]} canvases=${canvasCounts[1]}`,
    ).toBeTruthy();
    expect(
      widths[2] > widths[1] * 0.9 || canvasCounts[2] > 1,
      `${key} 300% ${widths[2]} canvases=${canvasCounts[2]}`,
    ).toBeTruthy();
    expect(
      widths[3] > widths[2] || canvasCounts[3] > 1,
      `${key} 400% vs 300% ${widths.join(",")} canvases=${canvasCounts[3]}`,
    ).toBeTruthy();
  });
}
