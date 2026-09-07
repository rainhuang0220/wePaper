import { expect, test } from "@playwright/test";

test("library search and continuous reader", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "wePaper" })).toBeVisible();
  const first = page.locator("ol.rows a.row").first();
  await expect(first).toBeVisible();
  await page.getByLabel("Search papers").fill("memory");
  await expect(page.locator("ol.rows a.row").first()).toBeVisible();

  await first.click();
  await expect(page).toHaveURL(/\/paper\/[A-Za-z0-9]{8}/);
  await expect(page.getByRole("link", { name: "Library" })).toBeVisible();
  const openPdf = page.getByRole("link", { name: "Open PDF" });
  await expect(openPdf).toBeVisible();
  await expect(openPdf).toHaveAttribute("href", /\/paper\/[A-Za-z0-9]{8}\/pdf$/);

  await expect(page.locator('.reader-scroll[data-first-ready="true"]')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.page[data-page-number="1"] canvas').first()).toBeVisible({ timeout: 30_000 });

  const fitWidth = await page.locator('.page[data-page-number="1"]').evaluate((el) => el.clientWidth);
  const viewport = page.viewportSize();
  if (viewport && viewport.width >= 1100) {
    await page.setViewportSize({ width: 1100, height: 700 });
    await expect
      .poll(async () => page.locator('.page[data-page-number="1"]').evaluate((el) => el.clientWidth), { timeout: 10_000 })
      .not.toBe(fitWidth);
    await page.setViewportSize(viewport);
  }

  const pageThree = page.locator('.page[data-page-number="3"]');
  await pageThree.evaluate((el) => el.scrollIntoView({ block: "start" }));
  await expect(page.locator(".page-readout input")).not.toHaveValue("1", { timeout: 10_000 });
  await expect(page.locator('.page[data-page-number="2"]')).toBeVisible();
  await expect(pageThree).toBeVisible();

  await page.getByRole("button", { name: "Find in document" }).click();
  await page.getByPlaceholder("Find").fill("the");
  await page.getByPlaceholder("Find").press("Enter");
  await expect(page.locator(".find-count")).not.toHaveText("", { timeout: 15_000 });

  await page.getByLabel("Zoom in").click();
  await page.getByRole("link", { name: "Library" }).click();
  await expect(page).toHaveURL(/\/(\?.*)?$/);

  const href = await page.locator("ol.rows a.row").first().getAttribute("href");
  expect(href).toBeTruthy();
  await page.goto(href!);
  await expect(page.locator('.page[data-page-number="1"]')).toBeVisible({ timeout: 30_000 });
  await page.reload();
  await expect(page.locator('.page[data-page-number="1"] canvas').first()).toBeVisible({ timeout: 30_000 });
});
