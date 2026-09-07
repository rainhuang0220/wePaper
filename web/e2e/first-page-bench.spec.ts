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
  projectUse: { baseURL?: string; viewport?: { width: number; height: number }; userAgent?: string },
  mobile: boolean,
) {
  const context = await browser.newContext({
    baseURL: projectUse.baseURL,
    viewport: projectUse.viewport,
    deviceScaleFactor: mobile ? 3 : 2,
    userAgent: projectUse.userAgent,
    extraHTTPHeaders: mobile ? { "Sec-CH-UA-Mobile": "?1" } : { "Sec-CH-UA-Mobile": "?0" },
  });
  const page = await context.newPage();
  if (!mobile) {
    const session = await context.newCDPSession(page);
    await session.send("Network.setCacheDisabled", { cacheDisabled: true });
  }
  return { context, page };
}

async function clickTitleOpensNativePdf(page: Page, key: string): Promise<number> {
  const row = page.locator(`a.row-open[href$="/paper/${key}"]`);
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

test("isolated cold catalog clicks meet the first-page gate", async ({ browser }, info) => {
  test.skip(!process.env.WEPAPER_BENCH, "opt-in production bench");
  const mobile = info.project.name === "mobile";
  const records: object[] = [];
  const samples: number[] = [];
  for (const paper of PAPERS) {
    const { context, page } = await isolatedPage(browser, info.project.use, mobile);
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
    path.join(resultsDir, `v15-bench-click-${info.project.name}.json`),
    `${JSON.stringify({ p50, p95, samples, records }, null, 2)}\n`,
  );
  expect(p50, `P50 ${p50}ms`).toBeLessThanOrEqual(2000);
  expect(p95, `P95 ${p95}ms`).toBeLessThanOrEqual(3000);
});

test("warm second Range of a medium PDF is fast", async ({ request }) => {
  test.skip(!process.env.WEPAPER_BENCH, "opt-in production bench");
  const headers = { Range: "bytes=0-262143" };
  const first = await request.get("/paper/PAS2TSBP/pdf", { headers });
  expect([200, 206]).toContain(first.status());
  expect(first.headers()["content-type"] || "").toMatch(/application\/pdf/);
  const started = Date.now();
  const second = await request.get("/paper/PAS2TSBP/pdf", { headers });
  const warmMs = Date.now() - started;
  expect([200, 206]).toContain(second.status());
  expect(second.headers()["content-type"] || "").toMatch(/application\/pdf/);
  writeFileSync(
    path.join(resultsDir, "v15-bench-warm-medium.json"),
    `${JSON.stringify({ warmMs, at: new Date().toISOString() }, null, 2)}\n`,
  );
  expect(warmMs, `warm ${warmMs}ms`).toBeLessThan(3000);
});
