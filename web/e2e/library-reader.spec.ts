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

  const pageOne = page.locator('[data-testid="pdf-page-1"]');
  const pageTwo = page.locator('[data-testid="pdf-page-2"]');
  const pageThree = page.locator('[data-testid="pdf-page-3"]');
  await expect(page.locator('[data-testid="pdf-page-1"][data-ready="true"]')).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.locator(".reader-scroll canvas").first()).toBeVisible({ timeout: 30_000 });

  await pageThree.evaluate((el) => el.scrollIntoView({ block: "start" }));
  await expect(page.locator(".page-readout input")).not.toHaveValue("1", { timeout: 10_000 });
  await expect(pageTwo).toBeVisible();
  await expect(pageThree).toBeVisible();

  await page.getByRole("button", { name: "Find in document" }).click();
  await page.getByPlaceholder("Find").fill("the");
  await expect(page.locator(".find-count")).not.toHaveText("");

  await page.getByLabel("Zoom in").click();
  await page.getByRole("link", { name: "Library" }).click();
  await expect(page).toHaveURL(/\/(\?.*)?$/);

  const href = await page.locator("ol.rows a.row").first().getAttribute("href");
  expect(href).toBeTruthy();
  await page.goto(href!);
  await expect(page.locator('[data-testid="pdf-page-1"]')).toBeVisible({ timeout: 30_000 });
  await page.reload();
  await expect(page.locator('[data-testid="pdf-page-1"]')).toBeVisible({ timeout: 30_000 });
});
