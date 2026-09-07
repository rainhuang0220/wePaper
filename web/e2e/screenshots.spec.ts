import { expect, test } from "@playwright/test";
import path from "node:path";

const shots = path.resolve(import.meta.dirname, "../../docs/screenshots");

test("capture library with native PDF title links", async ({ page }, info) => {
  const tag = info.project.name;
  await page.goto("/");
  const row = page.locator("ol.rows a.row").first();
  await row.waitFor();
  await expect(row).toHaveAttribute("href", /\/paper\/[A-Za-z0-9]{8}\/pdf$/);
  await page.screenshot({ path: path.join(shots, `v14-library-${tag}.png`) });
});
