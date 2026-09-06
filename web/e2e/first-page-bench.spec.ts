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

async function firstPageReady(page: Page, timeout = 20_000) {
  await expect(page.locator('[data-testid="pdf-page-1"][data-ready="true"]')).toBeVisible({ timeout });
}

async function textLayerReady(page: Page) {
  await expect(page.locator('[data-testid="pdf-page-1"] .textLayer')).not.toHaveText("", { timeout: 10_000 });
}

async function canvasMetrics(page: Page) {
  return page.locator('[data-testid="pdf-page-1"] canvas').evaluate((node) => {
    const el = node as HTMLCanvasElement;
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

test("zoom re-renders a sharper backing canvas", async ({ page }) => {
  await page.goto("/paper/PSELS7ZT", { waitUntil: "domcontentloaded" });
  await firstPageReady(page);
  const zoomLabel = page.getByRole("button", { name: /Actual size|Fit width/ });
  if ((await zoomLabel.getAttribute("aria-label")) === "Actual size") {
    await zoomLabel.click();
  }
  await expect(page.locator(".zoom-label")).toHaveText("100%");
  const at100 = await canvasMetrics(page);
  for (let i = 0; i < 4; i += 1) await page.getByLabel("Zoom in").click();
  await expect(page.locator(".zoom-label")).toHaveText("200%");
  await expect
    .poll(async () => (await canvasMetrics(page)).backingWidth, { timeout: 10_000 })
    .toBeGreaterThan(at100.backingWidth * 1.6);
  const at200 = await canvasMetrics(page);
  for (let i = 0; i < 2; i += 1) await page.getByLabel("Zoom in").click();
  await expect(page.locator(".zoom-label")).toHaveText("300%");
  await expect
    .poll(async () => (await canvasMetrics(page)).backingWidth, { timeout: 10_000 })
    .toBeGreaterThan(at200.backingWidth);
  const at300 = await canvasMetrics(page);
  expect(at300.backingWidth).toBeGreaterThan(at200.backingWidth);
});
