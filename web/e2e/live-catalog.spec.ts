import { expect, test } from "@playwright/test";

const TOKEN = "e2e-token";

async function ingest(request: import("@playwright/test").APIRequestContext, key: string, title: string) {
  const res = await request.put("/api/v1/sync/papers", {
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    data: {
      zotero_item_key: key,
      title,
      authors: "Ada Lovelace",
      collection: "wePaper E2E",
      visibility: "public",
      zotero_version: 1,
    },
  });
  expect(res.ok()).toBeTruthy();
}

function isCatalogList(url: string): boolean {
  return /\/api\/v1\/papers(?:\?|$)/.test(url);
}

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "live catalog coverage is project-independent");
});

test("version unchanged does not refetch the catalog list", async ({ page }) => {
  const paperGets: string[] = [];
  page.on("request", (req) => {
    if (req.method() === "GET" && isCatalogList(req.url())) paperGets.push(req.url());
  });
  await page.goto("/");
  await expect(page.locator("ol.rows a.row-open").first()).toBeVisible();
  const afterLoad = paperGets.length;
  expect(afterLoad).toBeGreaterThan(0);
  await page.waitForTimeout(5500);
  expect(paperGets.length).toBe(afterLoad);
});

test("open catalog updates when a paper is ingested", async ({ page, request }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Fixture memory paper" })).toBeVisible();
  await ingest(request, "LIVE0001", "Live catalog paper");
  await expect(page.getByRole("heading", { name: "Live catalog paper" })).toBeVisible({ timeout: 15_000 });
});

test("search and filter survive a live catalog refresh", async ({ page, request }) => {
  const needle = `Zz${Date.now().toString(36)}`;
  const key = `L${Date.now().toString(36).toUpperCase()}`.replace(/[^A-Z0-9]/g, "0").padEnd(8, "0").slice(0, 8);
  await page.goto("/");
  await page.getByRole("button", { name: "Title" }).click();
  await page.getByLabel("Search papers").fill(needle);
  await expect(page.getByText("No matching papers.")).toBeVisible();
  await ingest(request, key, `${needle} search survivor`);
  await expect(page.getByRole("heading", { name: `${needle} search survivor` })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByLabel("Search papers")).toHaveValue(needle);
  await expect(page.getByRole("button", { name: "Title" })).toHaveClass(/on/);
});

test("visibility check refetches when the catalog version changed", async ({ page, request }) => {
  await page.goto("/");
  await expect(page.locator("ol.rows a.row-open").first()).toBeVisible();
  await ingest(request, "LIVE0003", "Visible again paper");
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect(page.getByRole("heading", { name: "Visible again paper" })).toBeVisible({ timeout: 15_000 });
});
