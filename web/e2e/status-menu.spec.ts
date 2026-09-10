import { expect, test, type Page } from "@playwright/test";
import { placeStatusMenu, STATUS_MENU_GAP, STATUS_MENU_MARGIN } from "../src/statusMenuPlacement";

test.describe("status menu placement math", () => {
  test("keeps the panel below the trigger when it already fits", () => {
    const placed = placeStatusMenu({
      trigger: { top: 40, bottom: 68, left: 40 },
      panel: { height: 200, width: 136 },
      viewport: { height: 360, width: 1280 },
    });
    expect(placed.top).toBe(68 + STATUS_MENU_GAP);
    expect(placed.left).toBe(40);
    expect(placed.maxHeight).toBe(200);
    expect(placed.shifted).toBe(false);
  });

  test("shifts the panel up when the default below-trigger box overflows the viewport", () => {
    const placed = placeStatusMenu({
      trigger: { top: 320, bottom: 348, left: 40 },
      panel: { height: 316, width: 136 },
      viewport: { height: 360, width: 1280 },
    });
    expect(placed.maxHeight).toBe(316);
    expect(placed.top).toBe(360 - STATUS_MENU_MARGIN - 316);
    expect(placed.shifted).toBe(true);
    expect(placed.top + placed.maxHeight).toBeLessThanOrEqual(360 - STATUS_MENU_MARGIN);
    expect(placed.top).toBeGreaterThanOrEqual(STATUS_MENU_MARGIN);
    expect(placed.top + placed.maxHeight).toBeGreaterThan(320);
  });

  test("clamps height and top when the panel is taller than the viewport", () => {
    const placed = placeStatusMenu({
      trigger: { top: 100, bottom: 128, left: 40 },
      panel: { height: 400, width: 136 },
      viewport: { height: 200, width: 1280 },
    });
    expect(placed.maxHeight).toBe(200 - 2 * STATUS_MENU_MARGIN);
    expect(placed.top).toBe(STATUS_MENU_MARGIN);
    expect(placed.shifted).toBe(true);
  });
});

const KEY = "TEST0001";
const STATUSES = ["无状态", "待泛读", "待精读", "泛读中", "精读中", "已泛读", "已精读"] as const;

function firstChip(page: Page) {
  return page.locator(`ol.rows li.row:has(a.row-open[href$="/paper/${KEY}"]) .status-chip`);
}

function lastChip(page: Page) {
  return page.locator("ol.rows li.row .status-chip").last();
}

function menu(page: Page) {
  return page.getByRole("menu", { name: "阅读状态" });
}

async function closeMenu(page: Page) {
  await expect(menu(page)).toHaveCount(0);
}

async function openChip(page: Page, chip: ReturnType<typeof firstChip>) {
  await closeMenu(page);
  await chip.click({ force: true });
  await expect(menu(page)).toBeVisible();
}

async function chooseStatus(page: Page, chip: ReturnType<typeof firstChip>, name: string) {
  await openChip(page, chip);
  await page.getByRole("menuitemradio", { name, exact: true }).click();
  await closeMenu(page);
}

async function expectMenuInsideViewport(page: Page) {
  const viewport = page.viewportSize();
  expect(viewport).toBeTruthy();
  const box = await menu(page).boundingBox();
  expect(box).toBeTruthy();
  expect(box!.y).toBeGreaterThanOrEqual(STATUS_MENU_MARGIN - 1);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height - STATUS_MENU_MARGIN + 1);
}

async function expectMenuBelowTrigger(page: Page, chip: ReturnType<typeof firstChip>) {
  const chipBox = await chip.boundingBox();
  const menuBox = await menu(page).boundingBox();
  expect(chipBox).toBeTruthy();
  expect(menuBox).toBeTruthy();
  expect(menuBox!.y).toBeGreaterThanOrEqual(chipBox!.y + chipBox!.height);
}

async function expectMenuShiftedToStayOnScreen(page: Page, chip: ReturnType<typeof firstChip>) {
  const viewportHeight = page.viewportSize()?.height ?? 0;
  const chipBox = await chip.boundingBox();
  const menuBox = await menu(page).boundingBox();
  expect(chipBox).toBeTruthy();
  expect(menuBox).toBeTruthy();
  const desiredTop = chipBox!.y + chipBox!.height + STATUS_MENU_GAP;
  expect(desiredTop + menuBox!.height).toBeGreaterThan(viewportHeight - STATUS_MENU_MARGIN);
  expect(menuBox!.y).toBeLessThan(desiredTop);
  expect(menuBox!.y + menuBox!.height).toBeGreaterThan(chipBox!.y);
}

async function expectDocumentHeightUnchanged(page: Page, act: () => Promise<void>) {
  const before = await page.evaluate(() => document.documentElement.scrollHeight);
  await act();
  const after = await page.evaluate(() => document.documentElement.scrollHeight);
  expect(after).toBeLessThanOrEqual(before + 1);
}

async function expectItemInsideMenu(page: Page, name: string) {
  const metrics = await menu(page).evaluate((scroller, label) => {
    if (!(scroller instanceof HTMLElement)) return null;
    const el = [...scroller.querySelectorAll<HTMLElement>('[role=menuitemradio]')].find(
      (node) => node.textContent?.trim() === label,
    );
    if (!el) return null;
    const portTop = scroller.getBoundingClientRect().top + scroller.clientTop;
    const portBottom = portTop + scroller.clientHeight;
    const itemRect = el.getBoundingClientRect();
    if (itemRect.top < portTop) scroller.scrollTop -= portTop - itemRect.top;
    else if (itemRect.bottom > portBottom) scroller.scrollTop += itemRect.bottom - portBottom;
    const moved = el.getBoundingClientRect();
    const nextTop = scroller.getBoundingClientRect().top + scroller.clientTop;
    const nextBottom = nextTop + scroller.clientHeight;
    return {
      itemTop: moved.top,
      itemBottom: moved.bottom,
      portTop: nextTop,
      portBottom: nextBottom,
      viewHeight: window.innerHeight,
    };
  }, name);
  expect(metrics).toBeTruthy();
  expect(metrics!.itemTop).toBeGreaterThanOrEqual(metrics!.portTop - 2);
  expect(metrics!.itemBottom).toBeLessThanOrEqual(metrics!.portBottom + 2);
  expect(metrics!.itemTop).toBeGreaterThanOrEqual(-1);
  expect(metrics!.itemBottom).toBeLessThanOrEqual(metrics!.viewHeight + 1);
}

async function expectEveryStatusReachable(page: Page) {
  for (const name of STATUSES) {
    await expectItemInsideMenu(page, name);
  }
}

async function expectNoPageSpacer(page: Page) {
  await expect(page.locator("[data-testid=status-menu-spacer-before]")).toHaveCount(0);
  await expect(page.locator("[data-testid=status-menu-spacer-after]")).toHaveCount(0);
  const extraBottom = await page.evaluate(() => {
    const lib = document.querySelector(".lib");
    if (!(lib instanceof HTMLElement)) return 0;
    return Number.parseFloat(getComputedStyle(lib).paddingBottom) || 0;
  });
  expect(extraBottom).toBe(0);
}

test.describe("status menu stays fully reachable", () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await expect(firstChip(page)).toBeVisible();
    await expectNoPageSpacer(page);
    await chooseStatus(page, firstChip(page), "无状态");
    await expect(firstChip(page)).toHaveText("状态");
  });

  test("Case A: top trigger stays below the chip and does not grow the page", async ({ page }) => {
    await expectDocumentHeightUnchanged(page, async () => {
      await openChip(page, firstChip(page));
    });
    await expectMenuInsideViewport(page);
    await expectMenuBelowTrigger(page, firstChip(page));
    await expect(page.getByRole("menuitemradio", { name: "无状态" })).toHaveAttribute("aria-checked", "true");
    await expectEveryStatusReachable(page);
    await expectNoPageSpacer(page);
  });

  test("Case B: mid-list trigger keeps every status reachable", async ({ page }) => {
    await chooseStatus(page, firstChip(page), "泛读中");
    await expect(firstChip(page)).toHaveText("泛读中");
    await openChip(page, firstChip(page));
    await expectMenuInsideViewport(page);
    await expect(page.getByRole("menuitemradio", { name: "泛读中" })).toHaveAttribute("aria-checked", "true");
    await expectItemInsideMenu(page, "泛读中");
    await expectItemInsideMenu(page, "无状态");
    await expectItemInsideMenu(page, "已精读");
  });

  test("Case C: last-row trigger shifts the panel up instead of adding page space", async ({ page }) => {
    await chooseStatus(page, lastChip(page), "已精读");
    await expect(lastChip(page)).toHaveText("已精读");
    await page.setViewportSize({ width: 1280, height: 280 });
    await expectDocumentHeightUnchanged(page, async () => {
      await openChip(page, lastChip(page));
    });
    await expectMenuInsideViewport(page);
    await expectMenuShiftedToStayOnScreen(page, lastChip(page));
    await expect(page.getByRole("menuitemradio", { name: "已精读" })).toHaveAttribute("aria-checked", "true");
    await expectItemInsideMenu(page, "已精读");
    await expectItemInsideMenu(page, "无状态");
    await expectEveryStatusReachable(page);
    await expectNoPageSpacer(page);
  });

  test("Case E: switching from last status back to first does not depend on selected index hacks", async ({ page }) => {
    await chooseStatus(page, lastChip(page), "已精读");
    await chooseStatus(page, lastChip(page), "无状态");
    await expect(lastChip(page)).toHaveText("状态");
    await openChip(page, firstChip(page));
    await expectMenuInsideViewport(page);
    await expectMenuBelowTrigger(page, firstChip(page));
    await expect(page.getByRole("menuitemradio", { name: "无状态" })).toHaveAttribute("aria-checked", "true");
    await expectItemInsideMenu(page, "无状态");
    await expectItemInsideMenu(page, "已精读");
  });

  test("Case G: an open menu re-clamps after the viewport shrinks", async ({ page }) => {
    await openChip(page, lastChip(page));
    await page.setViewportSize({ width: 1280, height: 240 });
    await page.evaluate(() => window.dispatchEvent(new Event("resize")));
    await expectMenuInsideViewport(page);
    await expectEveryStatusReachable(page);
    await expectNoPageSpacer(page);
  });
});

test.describe("status menu on a short mobile viewport", () => {
  test.use({ viewport: { width: 390, height: 500 } });

  test("Case D/F: last selected status stays visible without growing the document", async ({ page }) => {
    await page.goto("/");
    await expect(lastChip(page)).toBeVisible();
    await expectNoPageSpacer(page);
    await chooseStatus(page, lastChip(page), "已精读");
    await expectDocumentHeightUnchanged(page, async () => {
      await openChip(page, lastChip(page));
    });
    await expectMenuInsideViewport(page);
    await expect(page.getByRole("menuitemradio", { name: "已精读" })).toHaveAttribute("aria-checked", "true");
    await expectItemInsideMenu(page, "已精读");
    await expectItemInsideMenu(page, "无状态");
    await expectEveryStatusReachable(page);
    await page.getByRole("menuitemradio", { name: "待泛读" }).click();
    await closeMenu(page);
    await expect(lastChip(page)).toHaveText("待泛读");
    await expectNoPageSpacer(page);
  });
});
