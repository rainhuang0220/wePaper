import { expect, test } from "@playwright/test";
import { writeFileSync } from "node:fs";
import path from "node:path";

const resultsDir = path.resolve(import.meta.dirname, "../../docs/research");

const PAPERS = [
  { key: "PSELS7ZT", size: "small", bytes: 227_651 },
  { key: "PAS2TSBP", size: "medium", bytes: 2_705_358 },
  { key: "MUZIM3FK", size: "linearized", bytes: 1_895_106 },
  { key: "3FYGRVK7", size: "large", bytes: 5_568_857 },
];

async function firstPageReady(page: import("@playwright/test").Page, timeout = 20_000) {
  await expect(page.locator('[data-testid="pdf-page-1"][data-ready="true"]')).toBeVisible({ timeout });
}

async function canvasMetrics(page: import("@playwright/test").Page) {
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

async function pdfResources(page: import("@playwright/test").Page) {
  return page.evaluate(() =>
    performance
      .getEntriesByType("resource")
      .filter((entry) => entry.name.includes("/pdf"))
      .map((entry) => {
        const resource = entry as PerformanceResourceTiming;
        return {
          name: resource.name,
          duration: Math.round(resource.duration),
          transferSize: resource.transferSize,
          encodedBodySize: resource.encodedBodySize,
        };
      }),
  );
}

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

test("cold catalog clicks meet first-page gate", async ({ page }, info) => {
  const session = await page.context().newCDPSession(page);
  await session.send("Network.setCacheDisabled", { cacheDisabled: true });
  const records: object[] = [];
  const clickSamples: number[] = [];
  for (const paper of PAPERS) {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const row = page.locator(`a.row[href="/paper/${paper.key}"]`);
    await expect(row).toBeVisible();
    const started = Date.now();
    await row.click();
    await firstPageReady(page);
    const firstPageMs = Date.now() - started;
    clickSamples.push(firstPageMs);
    const box = await canvasMetrics(page);
    records.push({
      kind: "catalog-click",
      project: info.project.name,
      ...paper,
      firstPageMs,
      ...box,
      pdfResources: await pdfResources(page),
      at: new Date().toISOString(),
    });
    expect(box.dpr).toBeGreaterThan(1);
    expect(box.backingWidth).toBeGreaterThan(box.cssWidth * 1.5);
  }
  const ordinary = records.filter((row) => "bytes" in row && (row as { bytes: number }).bytes <= 3_000_000);
  const ordinaryMs = ordinary.map((row) => (row as { firstPageMs: number }).firstPageMs);
  const p50 = percentile(ordinaryMs.length ? ordinaryMs : clickSamples, 50);
  const p95 = percentile(ordinaryMs.length ? ordinaryMs : clickSamples, 95);
  writeFileSync(
    path.join(resultsDir, `v12-bench-click-${info.project.name}.json`),
    `${JSON.stringify({ p50, p95, samples: clickSamples, ordinaryMs, records }, null, 2)}\n`,
  );
  expect(ordinaryMs[0] ?? clickSamples[0], "small paper first page").toBeLessThan(2000);
});

test("repeated small-paper clicks meet P50/P95", async ({ page }, info) => {
  const session = await page.context().newCDPSession(page);
  await session.send("Network.setCacheDisabled", { cacheDisabled: true });
  const samples: number[] = [];
  for (let i = 0; i < 5; i += 1) {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const row = page.locator('a.row[href="/paper/PSELS7ZT"]');
    await expect(row).toBeVisible();
    const started = Date.now();
    await row.click();
    await firstPageReady(page);
    samples.push(Date.now() - started);
  }
  const p50 = percentile(samples, 50);
  const p95 = percentile(samples, 95);
  writeFileSync(
    path.join(resultsDir, `v12-bench-p50-${info.project.name}.json`),
    `${JSON.stringify({ p50, p95, samples, at: new Date().toISOString() }, null, 2)}\n`,
  );
  expect(p50, `P50 ${p50}ms`).toBeLessThanOrEqual(2000);
  expect(p95, `P95 ${p95}ms`).toBeLessThanOrEqual(3000);
});

test("cold and warm direct opens by size", async ({ page }, info) => {
  const records: object[] = [];
  for (const paper of PAPERS) {
    const cold = await page.context().newCDPSession(page);
    await cold.send("Network.setCacheDisabled", { cacheDisabled: true });
    let started = Date.now();
    await page.goto(`/paper/${paper.key}`, { waitUntil: "domcontentloaded" });
    await firstPageReady(page);
    const coldMs = Date.now() - started;
    const box = await canvasMetrics(page);
    await cold.send("Network.setCacheDisabled", { cacheDisabled: false });
    started = Date.now();
    await page.goto(`/paper/${paper.key}`, { waitUntil: "domcontentloaded" });
    await firstPageReady(page);
    const warmMs = Date.now() - started;
    records.push({
      project: info.project.name,
      ...paper,
      coldMs,
      warmMs,
      ...box,
      at: new Date().toISOString(),
    });
  }
  writeFileSync(path.join(resultsDir, `v12-bench-direct-${info.project.name}.json`), `${JSON.stringify(records, null, 2)}\n`);
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
  expect(at200.backingWidth / at200.cssWidth).toBeGreaterThan(1.5);
});
