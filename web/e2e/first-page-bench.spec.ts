import { expect, test, type Browser, type Page } from "@playwright/test";
import { writeFileSync } from "node:fs";
import path from "node:path";

const resultsDir = path.resolve(import.meta.dirname, "../../docs/research");

const PAPERS = [
  { key: "PSELS7ZT", size: "small", bytes: 227_651 },
  { key: "PAS2TSBP", size: "medium", bytes: 2_705_358 },
  { key: "MUZIM3FK", size: "linearized", bytes: 1_895_106 },
  { key: "3FYGRVK7", size: "large", bytes: 5_568_857 },
];

function pageOne(page: Page) {
  return page.locator('.page[data-page-number="1"]');
}

async function firstPageReady(page: Page, timeout = 20_000) {
  await expect(page.locator('.reader-scroll[data-first-ready="true"]')).toBeVisible({ timeout });
  await expect(pageOne(page).locator("canvas").first()).toBeVisible({ timeout });
  await expect
    .poll(async () => pageOne(page).locator("canvas").first().evaluate((node) => (node as HTMLCanvasElement).width), {
      timeout,
    })
    .toBeGreaterThan(0);
}

async function textLayerReady(page: Page) {
  await expect(pageOne(page).locator(".textLayer")).not.toHaveText("", { timeout: 10_000 });
}

async function canvasMetrics(page: Page) {
  return pageOne(page).evaluate((root) => {
    const canvases = [...root.querySelectorAll("canvas")] as HTMLCanvasElement[];
    const el = canvases.reduce<HTMLCanvasElement | undefined>(
      (best, node) => (!best || node.width > best.width ? node : best),
      undefined,
    );
    if (!el) return { backingWidth: 0, backingHeight: 0, cssWidth: 0, cssHeight: 0, dpr: window.devicePixelRatio };
    return {
      backingWidth: el.width,
      backingHeight: el.height,
      cssWidth: el.clientWidth,
      cssHeight: el.clientHeight,
      dpr: window.devicePixelRatio,
    };
  });
}

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

async function isolatedPage(
  browser: Browser,
  projectUse: { baseURL?: string; viewport?: { width: number; height: number } },
) {
  const mobile = Boolean(projectUse.viewport && projectUse.viewport.width < 500);
  const context = await browser.newContext({
    baseURL: projectUse.baseURL,
    viewport: projectUse.viewport,
    deviceScaleFactor: mobile ? 3 : 2,
  });
  const page = await context.newPage();
  const session = await context.newCDPSession(page);
  await session.send("Network.setCacheDisabled", { cacheDisabled: true });
  return { context, page };
}

test("isolated cold catalog clicks meet first-page gate", async ({ browser }, info) => {
  const records: object[] = [];
  const samples: number[] = [];
  for (const paper of PAPERS) {
    const { context, page } = await isolatedPage(browser, info.project.use);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const row = page.locator(`a.row[href="/paper/${paper.key}"]`);
    await expect(row).toBeVisible();
    const started = Date.now();
    await row.click();
    await firstPageReady(page);
    const firstPageMs = Date.now() - started;
    await textLayerReady(page);
    samples.push(firstPageMs);
    const box = await canvasMetrics(page);
    records.push({ project: info.project.name, ...paper, firstPageMs, ...box, at: new Date().toISOString() });
    await context.close();
    expect(firstPageMs, `${paper.key} ${firstPageMs}ms`).toBeLessThanOrEqual(3000);
  }
  const p50 = percentile(samples, 50);
  const p95 = percentile(samples, 95);
  writeFileSync(
    path.join(resultsDir, `v12-bench-click-${info.project.name}.json`),
    `${JSON.stringify({ p50, p95, samples, records }, null, 2)}\n`,
  );
  expect(p50, `P50 ${p50}ms`).toBeLessThanOrEqual(2000);
  expect(p95, `P95 ${p95}ms`).toBeLessThanOrEqual(3000);
});

test("warm second open of a medium paper is fast", async ({ page }) => {
  await page.goto("/paper/PAS2TSBP", { waitUntil: "domcontentloaded" });
  await firstPageReady(page);
  await expect
    .poll(async () => page.evaluate(async () => !!(await caches.match("/paper/PAS2TSBP/pdf"))), { timeout: 20_000 })
    .toBeTruthy();
  const started = Date.now();
  await page.reload({ waitUntil: "domcontentloaded" });
  await firstPageReady(page);
  const warmMs = Date.now() - started;
  writeFileSync(
    path.join(resultsDir, "v12-bench-warm-medium.json"),
    `${JSON.stringify({ warmMs, at: new Date().toISOString() }, null, 2)}\n`,
  );
  expect(warmMs, `warm ${warmMs}ms`).toBeLessThan(3000);
});

async function zoomToAtLeast(page: Page, percent: number) {
  const label = page.locator(".zoom-label");
  if ((await label.textContent()) === "Fit") {
    const prior = (await canvasMetrics(page)).backingWidth;
    await page.getByLabel("Actual size").evaluate((el) => (el as HTMLButtonElement).click());
    await expect(label).toHaveText("100%");
    await expect
      .poll(async () => (await canvasMetrics(page)).backingWidth, { timeout: 10_000 })
      .not.toBe(prior);
  }
  for (let step = 0; step < 40; step += 1) {
    const text = (await label.textContent()) ?? "";
    const value = Number.parseInt(text, 10);
    if (Number.isFinite(value) && value >= percent) {
      await expect.poll(async () => (await canvasMetrics(page)).backingWidth, { timeout: 10_000 }).toBeGreaterThan(0);
      return value;
    }
    await page.getByLabel("Zoom in").evaluate((el) => (el as HTMLButtonElement).click());
    await expect
      .poll(async () => Number.parseInt((await label.textContent()) ?? "", 10), { timeout: 10_000 })
      .toBeGreaterThan(Number.isFinite(value) ? value : 0);
  }
  throw new Error(`could not reach ${percent}% (label=${await label.textContent()})`);
}

test("zoom re-renders a sharper backing canvas", async ({ page }) => {
  await page.goto("/paper/PSELS7ZT", { waitUntil: "domcontentloaded" });
  await firstPageReady(page);
  await zoomToAtLeast(page, 100);
  const at100 = await canvasMetrics(page);
  await zoomToAtLeast(page, 200);
  await expect
    .poll(async () => {
      const metrics = await canvasMetrics(page);
      const canvases = await pageOne(page).locator("canvas").count();
      return metrics.backingWidth > at100.backingWidth * 1.2 || canvases > 1;
    }, { timeout: 15_000 })
    .toBeTruthy();
  const at200 = await canvasMetrics(page);
  await zoomToAtLeast(page, 300);
  await expect
    .poll(async () => {
      const metrics = await canvasMetrics(page);
      const canvases = await pageOne(page).locator("canvas").count();
      return metrics.backingWidth > at200.backingWidth || canvases > 1;
    }, { timeout: 15_000 })
    .toBeTruthy();
  const at300 = await canvasMetrics(page);
  await zoomToAtLeast(page, 400);
  const at400 = await canvasMetrics(page);
  const canvases = await pageOne(page).locator("canvas").count();
  expect(
    at400.backingWidth > at300.backingWidth || canvases > 1,
    `400% must not reuse the 300% bitmap (${at300.backingWidth} vs ${at400.backingWidth}, canvases=${canvases})`,
  ).toBeTruthy();
});
