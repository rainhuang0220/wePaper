import { expect, test } from "@playwright/test";

const KEY = "TEST0002";

test("desktop comments entry opens discussion, reply, like, and back", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "desktop comments entry");
  await page.goto("/?q=Other");
  const row = page.locator(`ol.rows li.row:has(a.row-open[href$="/paper/${KEY}"])`);
  await expect(row).toBeVisible();
  await row.locator(".comment-count").click();
  await expect(page).toHaveURL(new RegExp(`/paper/${KEY}/discussion$`));
  await expect(page.getByRole("heading", { name: "Other fixture paper" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Other fixture paper" }).locator("a")).toHaveAttribute(
    "href",
    new RegExp(`/paper/${KEY}$`),
  );

  await page.getByPlaceholder("写下对这篇论文的讨论…").fill("Local fixture comment");
  await page.getByRole("button", { name: "发布" }).click();
  await expect(page.getByText("Local fixture comment")).toBeVisible();
  await expect(page.locator(".discuss-count")).toHaveText("评论 · 1");

  await page.getByRole("button", { name: "回复" }).click();
  await expect(page.getByText(/回复 匿名/)).toBeVisible();
  await page.getByPlaceholder("写下回复…").fill("Local fixture reply");
  await page.getByRole("button", { name: "发送回复" }).click();
  await expect(page.locator(".comment-body", { hasText: "Local fixture reply" })).toBeVisible();

  await page.getByRole("button", { name: /赞 · 0/ }).first().click();
  await expect(page.getByRole("button", { name: /已赞 · 1/ }).first()).toBeVisible();

  await page.getByRole("link", { name: "← Library" }).click();
  await expect(page).toHaveURL(/[?&]q=Other/);
  await expect(row.locator(".comment-count")).toHaveText("评论 · 2");
});

test("mobile long-press opens discussion and does not open the PDF", async ({ page }, info) => {
  test.skip(!info.project.name.startsWith("mobile"), "mobile long press");
  await page.goto("/");
  const title = page.locator(`ol.rows a.row-open[href$="/paper/${KEY}"]`);
  await expect(title).toBeVisible();
  const box = await title.boundingBox();
  expect(box).toBeTruthy();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(650);
  await page.mouse.up();
  await expect(page).toHaveURL(new RegExp(`/paper/${KEY}/discussion$`));
  await expect(page.locator(".reader-scroll")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Other fixture paper" })).toBeVisible();
  await expect(page.getByPlaceholder("写下对这篇论文的讨论…")).toBeVisible();
});
