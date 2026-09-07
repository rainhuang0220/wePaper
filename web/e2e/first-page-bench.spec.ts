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

async function clickTitleOpensNativePdf(page: Page, key: string): Promise<number> {
  const row = page.locator(`a.row[href$="/paper/${key}/pdf"]`);
  await expect(row).toBeVisible();
  const started = Date.now();
  const [response] = await Promise.all([
    page.waitForResponse(
      (res) =>
        res.url().includes(`/paper/${key}/pdf`) &&
        res.status() < 400 &&
        (res.headers()["content-type"] || "").includes("application/pdf"),
      { timeout: 20_000 },
    ),
    row.click(),
  ]);
  expect(response.headers()["content-type"] || "").toMatch(/application\/pdf/);
  return Date.now() - started;
}

test("isolated cold catalog clicks open native PDF within the gate", async ({ browser }, info) => {
  const records: object[] = [];
  const samples: number[] = [];
  for (const paper of PAPERS) {
    const { context, page } = await isolatedPage(browser, info.project.use);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const firstPageMs = await clickTitleOpensNativePdf(page, paper.key);
    samples.push(firstPageMs);
    records.push({ project: info.project.name, ...paper, firstPageMs, at: new Date().toISOString() });
    await context.close();
    expect(firstPageMs, `${paper.key} ${firstPageMs}ms`).toBeLessThanOrEqual(3000);
  }
  const p50 = percentile(samples, 50);
  const p95 = percentile(samples, 95);
  writeFileSync(
    path.join(resultsDir, `v14-bench-click-${info.project.name}.json`),
    `${JSON.stringify({ p50, p95, samples, records }, null, 2)}\n`,
  );
  expect(p50, `P50 ${p50}ms`).toBeLessThanOrEqual(2000);
  expect(p95, `P95 ${p95}ms`).toBeLessThanOrEqual(3000);
});

test("warm second open of a medium PDF is fast", async ({ request }) => {
  const first = await request.get("/paper/PAS2TSBP/pdf");
  expect(first.status()).toBe(200);
  expect(first.headers()["content-type"] || "").toMatch(/application\/pdf/);
  const started = Date.now();
  const second = await request.get("/paper/PAS2TSBP/pdf");
  const warmMs = Date.now() - started;
  expect(second.status()).toBe(200);
  expect(second.headers()["content-type"] || "").toMatch(/application\/pdf/);
  writeFileSync(
    path.join(resultsDir, "v14-bench-warm-medium.json"),
    `${JSON.stringify({ warmMs, at: new Date().toISOString() }, null, 2)}\n`,
  );
  expect(warmMs, `warm ${warmMs}ms`).toBeLessThan(3000);
});
