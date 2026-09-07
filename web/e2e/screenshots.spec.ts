import { expect, test } from "@playwright/test";
import path from "node:path";

const shots = path.resolve(import.meta.dirname, "../../docs/screenshots");
const KEY = "TEST0001";

test("capture library, status, and discussion", async ({ page }, info) => {
  const tag = info.project.name;
  await page.goto("/");
  const row = page.locator("ol.rows a.row-open").first();
  await row.waitFor();
  await expect(row).toHaveAttribute("href", /\/paper\/[A-Za-z0-9]{8}$/);
  await page.screenshot({ path: path.join(shots, `v16-library-${tag}.png`) });

  const chip = page.locator(`ol.rows li.row:has(a.row-open[href$="/paper/${KEY}"]) .status-chip`);
  await chip.click();
  await expect(page.getByRole("menu", { name: "阅读状态" })).toBeVisible();
  await page.screenshot({ path: path.join(shots, `v16-status-${tag}.png`) });
  await page.keyboard.press("Escape");

  await page.locator(`ol.rows li.row:has(a.row-open[href$="/paper/${KEY}"]) .comment-count`).click();
  await expect(page).toHaveURL(/\/discussion$/);
  await page.screenshot({ path: path.join(shots, `v16-discussion-${tag}.png`) });

  await page.goto("/paper/TEST0002/discussion");
  await expect(page.getByRole("heading", { name: "Other fixture paper" })).toBeVisible();
  if ((await page.locator(".comment-body").count()) > 0) {
    await page.screenshot({ path: path.join(shots, `v16-discussion-replies-${tag}.png`) });
  }
});
