import { expect, test, type Page, type Response } from "@playwright/test";

const KEY = "PSELS7ZT";
const PDF_PATH = `/paper/${KEY}/pdf`;
const PAPER_PATH = `/paper/${KEY}`;

function isPdfResponse(res: Response, key = KEY): boolean {
  return (
    res.url().includes(`/paper/${key}/pdf`) &&
    res.status() < 400 &&
    (res.headers()["content-type"] || "").includes("application/pdf")
  );
}

async function firstTitle(page: Page) {
  return page.locator("ol.rows a.row-open").first();
}

test("catalog titles use canonical paper URLs", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "wePaper" })).toBeVisible();
  const first = await firstTitle(page);
  await expect(first).toBeVisible();
  await expect(first).toHaveAttribute("href", /\/paper\/[A-Za-z0-9]{8}$/);
  await expect(first).not.toHaveAttribute("href", /\/pdf$/);
});

test("desktop title click opens native PDF and back returns to library", async ({ page, request }, info) => {
  test.skip(info.project.name !== "desktop", "desktop native PDF");
  await page.goto("/");
  await page.getByLabel("Search papers").fill("memory");
  const target = page.locator(`ol.rows a.row-open[href$="/paper/${KEY}"]`);
  await expect(target).toBeVisible();

  const [pdfResponse] = await Promise.all([
    page.waitForResponse((res) => isPdfResponse(res, KEY), { timeout: 30_000 }),
    target.click(),
  ]);
  expect(pdfResponse.url()).toMatch(new RegExp(`/paper/${KEY}/pdf`));
  expect(pdfResponse.headers()["content-type"] || "").toMatch(/application\/pdf/);
  if (new URL(page.url()).pathname.endsWith(`/paper/${KEY}/pdf`)) {
    await page.goBack();
    await expect(page).toHaveURL(/\/(\?.*)?$/);
    await expect(page.locator("ol.rows a.row-open").first()).toBeVisible();
  }

  const direct = await request.get(PDF_PATH);
  expect(direct.status()).toBe(200);
  expect(direct.headers()["content-type"] || "").toMatch(/application\/pdf/);

  const redirected = await request.get(PAPER_PATH, { maxRedirects: 0 });
  expect(redirected.status()).toBe(302);
  expect(redirected.headers()["location"] || "").toMatch(new RegExp(`/paper/${KEY}/pdf$`));
  expect(redirected.headers()["cache-control"] || "").toMatch(/no-store/i);
  expect(redirected.headers()["vary"] || "").toMatch(/User-Agent/i);
});

test("mobile title tap opens inline viewer without a download prompt", async ({ page, request }, info) => {
  test.skip(info.project.name !== "mobile", "mobile inline viewer");
  const downloads: string[] = [];
  page.on("download", (download) => downloads.push(download.url()));

  await page.goto("/");
  await page.getByLabel("Search papers").fill("memory");
  const target = page.locator(`ol.rows a.row-open[href$="/paper/${KEY}"]`);
  await expect(target).toBeVisible();
  await target.click();

  await expect(page).toHaveURL(new RegExp(`/paper/${KEY}$`));
  await expect(page.getByRole("link", { name: /Library/ })).toBeVisible();
  await expect(page.locator('.reader-scroll[data-first-ready="true"]')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.page[data-page-number="1"] canvas').first()).toBeVisible();
  expect(downloads).toEqual([]);

  const pageThree = page.locator('.page[data-page-number="3"]');
  await pageThree.evaluate((el) => el.scrollIntoView({ block: "start" }));
  await expect(pageThree).toBeVisible();

  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Find in document" }).click();
  await page.getByLabel("Find").fill("the");
  await page.getByLabel("Find").press("Enter");
  await expect(page.locator(".find-count")).not.toHaveText("", { timeout: 15_000 });

  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Zoom in" }).click();

  await page.getByRole("link", { name: /Library/ }).click();
  await expect(page).toHaveURL(/\/(\?.*)?$/);

  await page.goto(PAPER_PATH);
  await expect(page.locator('.page[data-page-number="1"] canvas').first()).toBeVisible({ timeout: 30_000 });
  await page.goBack();
  await expect(page).toHaveURL(/\/(\?.*)?$/);

  const raw = await request.get(PDF_PATH, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
      "Sec-CH-UA-Mobile": "?1",
    },
  });
  expect(raw.status()).toBe(200);
  expect(raw.headers()["content-type"] || "").toMatch(/application\/pdf/);
  expect((await raw.body()).subarray(0, 4).toString("latin1")).toBe("%PDF");
});

test("status control does not open the paper", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("ol.rows .row").first()).toBeVisible();
  const chip = page.locator("ol.rows .status-chip").first();
  if ((await chip.count()) === 0) {
    test.info().annotations.push({ type: "note", description: "no public status chip yet" });
    return;
  }
  await chip.click();
  await expect(page).toHaveURL(/\/(\?.*)?$/);
  await expect(page.locator("ol.rows .row").first()).toBeVisible();
  await expect(page.locator(".reader-scroll")).toHaveCount(0);
});
