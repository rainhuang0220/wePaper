import { expect, test } from "@playwright/test";

const KEY = "PSELS7ZT";

test("owner can change reading status from the catalog without opening the paper", async ({ page }) => {
  const password = process.env.WEPAPER_E2E_OWNER_PASSWORD;
  test.skip(!password, "WEPAPER_E2E_OWNER_PASSWORD not set");

  await page.goto("/owner");
  await page.getByLabel("Password").fill(password!);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/(\?.*)?$/);
  await expect(page.getByText("Owner signed in")).toBeVisible();

  await page.getByLabel("Search papers").fill("memory");
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
  await page.getByLabel("Search papers").fill("memory");
  await expect(page.locator(`ol.rows li.row:has(a.row-open[href$="/paper/${KEY}"]) .status-chip`)).toHaveText("精读中");

  await page.getByLabel("Filter by reading status").selectOption("deep_reading");
  await expect(page.locator(`a.row-open[href$="/paper/${KEY}"]`)).toBeVisible();
});
