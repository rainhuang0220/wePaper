import { test } from "@playwright/test";
import path from "node:path";

const shots = path.resolve(import.meta.dirname, "../../docs/screenshots");

test("capture library and reader", async ({ page }, info) => {
  const tag = info.project.name;
  await page.goto("/");
  await page.locator("ol.rows a.row").first().waitFor();
  await page.screenshot({ path: path.join(shots, `v11-pass2-library-${tag}.png`) });
  await page.locator("ol.rows a.row").first().click();
  await page.locator('[data-testid="pdf-page-1"] canvas').waitFor({ timeout: 30_000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(shots, `v11-pass2-reader-${tag}.png`) });
  const pageThree = page.locator('[data-testid="pdf-page-3"]');
  if (await pageThree.count()) {
    await pageThree.scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(shots, `v11-pass2-reader-p3-${tag}.png`) });
  }
});
