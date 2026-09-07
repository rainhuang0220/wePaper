import { expect, test } from "@playwright/test";

const KEY = "TEST0001";

test("visitor can change reading status from the catalog without opening the paper", async ({ page }) => {
  await page.goto("/");
  const row = page.locator(`ol.rows li.row:has(a.row-open[href$="/paper/${KEY}"])`);
  await expect(row).toBeVisible();
  const chip = row.locator(".status-chip");
  await chip.click();
  await expect(page).toHaveURL(/\/(\?.*)?$/);
  await expect(page.locator(".reader-scroll")).toHaveCount(0);
  await page.getByRole("menuitemradio", { name: "精读中" }).click();
  await expect(chip).toHaveText("精读中");
  await expect(page).toHaveURL(/\/(\?.*)?$/);

  await page.reload();
  await expect(page.locator(`ol.rows li.row:has(a.row-open[href$="/paper/${KEY}"]) .status-chip`)).toHaveText("精读中");

  await page.getByLabel("Filter by reading status").selectOption("deep_reading");
  await expect(page.locator(`a.row-open[href$="/paper/${KEY}"]`)).toBeVisible();

  await page.getByLabel("Filter by reading status").selectOption("all");
  await chip.click();
  await page.getByRole("menuitemradio", { name: "无状态" }).click();
  await expect(chip).toHaveText("状态");
});
