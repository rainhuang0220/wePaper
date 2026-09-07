import { expect, test, type Page, type Response } from "@playwright/test";

const KEY = "PSELS7ZT";
const PDF_PATH = `/paper/${KEY}/pdf`;
const OLD_PATH = `/paper/${KEY}`;

function isPdfResponse(res: Response, key = KEY): boolean {
  return (
    res.url().includes(`/paper/${key}/pdf`) &&
    res.status() < 400 &&
    (res.headers()["content-type"] || "").includes("application/pdf")
  );
}

async function clickOpensPdf(page: Page, row: ReturnType<Page["locator"]>, key = KEY): Promise<Response> {
  const [response] = await Promise.all([
    page.waitForResponse((res) => isPdfResponse(res, key), { timeout: 30_000 }),
    row.click(),
  ]);
  return response;
}

test("library title opens native PDF and old paper URL redirects", async ({ page, request }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "wePaper" })).toBeVisible();
  const first = page.locator("ol.rows a.row").first();
  await expect(first).toBeVisible();
  await expect(first).toHaveAttribute("href", /\/paper\/[A-Za-z0-9]{8}\/pdf$/);
  await expect(first).not.toHaveAttribute("target", "_blank");

  await page.getByLabel("Search papers").fill("memory");
  const target = page.locator(`ol.rows a.row[href$="/paper/${KEY}/pdf"]`);
  await expect(target).toBeVisible();

  const pdfResponse = await clickOpensPdf(page, target, KEY);
  expect(pdfResponse.url()).toMatch(new RegExp(`/paper/${KEY}/pdf`));
  expect(pdfResponse.headers()["content-type"] || "").toMatch(/application\/pdf/);

  if (new URL(page.url()).pathname.endsWith(`/paper/${KEY}/pdf`)) {
    await page.goBack();
    await expect(page).toHaveURL(/\/(\?.*)?$/);
    await expect(page.locator("ol.rows a.row").first()).toBeVisible();
  }

  const direct = await request.get(PDF_PATH);
  expect(direct.status()).toBe(200);
  expect(direct.headers()["content-type"] || "").toMatch(/application\/pdf/);

  const ranged = await request.get(PDF_PATH, { headers: { Range: "bytes=0-3" } });
  expect(ranged.status()).toBe(206);
  expect(ranged.headers()["content-type"] || "").toMatch(/application\/pdf/);
  expect(Buffer.from(await ranged.body()).subarray(0, 4).toString("latin1")).toBe("%PDF");

  const redirected = await request.get(OLD_PATH, { maxRedirects: 0 });
  expect(redirected.status(), `old URL status ${redirected.status()}`).toBe(302);
  expect(redirected.headers()["location"] || "").toMatch(new RegExp(`/paper/${KEY}/pdf$`));

  const followed = await request.get(OLD_PATH);
  expect(followed.status()).toBe(200);
  expect(followed.headers()["content-type"] || "").toMatch(/application\/pdf/);
});
