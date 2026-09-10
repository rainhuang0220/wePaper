import { expect, test, type Locator, type Page } from "@playwright/test";

const KEY = "TEST0001";
const STATUSES = ["无状态", "待泛读", "待精读", "泛读中", "精读中", "已泛读", "已精读"] as const;
const EPSILON = 1;

function firstChip(page: Page) {
  return page.locator(`ol.rows li.row:has(a.row-open[href$="/paper/${KEY}"]) .status-chip`);
}

function lastChip(page: Page) {
  return page.locator("ol.rows li.row .status-chip").last();
}

function menu(page: Page) {
  return page.getByTestId("status-menu");
}

async function closeMenu(page: Page) {
  if (await menu(page).count()) {
    await page.keyboard.press("Escape");
  }
  await expect(menu(page)).toHaveCount(0);
}

async function waitMenuPlaced(page: Page) {
  await expect(menu(page)).toBeVisible();
  await page.waitForFunction(() => {
    const el = document.querySelector("[data-testid=status-menu]");
    if (!(el instanceof HTMLElement)) return false;
    const box = el.getBoundingClientRect();
    return box.height > 20 && box.width > 20;
  });
}

async function openChip(page: Page, chip: Locator) {
  await closeMenu(page);
  await chip.evaluate((el) => {
    if (el instanceof HTMLButtonElement) el.click();
  });
  await waitMenuPlaced(page);
}

async function chooseStatus(page: Page, chip: Locator, name: string) {
  await openChip(page, chip);
  await page.getByRole("menuitemradio", { name, exact: true }).click();
  await closeMenu(page);
}

async function pinChipToViewportFloor(chip: Locator, inset: number) {
  await chip.evaluate((el, bottom) => {
    const box = el.getBoundingClientRect();
    el.style.position = "fixed";
    el.style.left = `${box.left}px`;
    el.style.right = "auto";
    el.style.top = "auto";
    el.style.bottom = `${bottom}px`;
    el.style.margin = "0";
    el.style.zIndex = "5";
  }, inset);
}

type ItemMetrics = {
  itemTop: number;
  itemBottom: number;
  itemHeight: number;
  portTop: number;
  portBottom: number;
  viewHeight: number;
  visualHeight: number;
  clientHeight: number;
  scrollHeight: number;
  scrollTop: number;
  clipped: boolean;
};

async function measureItem(page: Page, name: string, scroll: "none" | "start" | "end"): Promise<ItemMetrics> {
  const metrics = await menu(page).evaluate(
    (scroller, args) => {
      if (!(scroller instanceof HTMLElement)) return null;
      if (args.scroll === "start") scroller.scrollTop = 0;
      if (args.scroll === "end") scroller.scrollTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
      const el = [...scroller.querySelectorAll<HTMLElement>("[role=menuitemradio]")].find(
        (node) => node.textContent?.trim() === args.name,
      );
      if (!el) return null;
      const port = scroller.getBoundingClientRect();
      const portTop = port.top + scroller.clientTop;
      const portBottom = portTop + scroller.clientHeight;
      const item = el.getBoundingClientRect();
      let node: HTMLElement | null = el;
      let clipped = false;
      while (node && node !== document.documentElement) {
        const parent = node.parentElement;
        if (!parent) break;
        const style = getComputedStyle(parent);
        if (/(hidden|clip|auto|scroll)/.test(`${style.overflow}${style.overflowX}${style.overflowY}`)) {
          const parentBox = parent.getBoundingClientRect();
          const visible = Math.min(item.bottom, parentBox.bottom) - Math.max(item.top, parentBox.top);
          if (visible + 1 < item.height) clipped = true;
        }
        node = parent;
      }
      return {
        itemTop: item.top,
        itemBottom: item.bottom,
        itemHeight: item.height,
        portTop,
        portBottom,
        viewHeight: window.innerHeight,
        visualHeight: Math.min(window.innerHeight, window.visualViewport?.height ?? window.innerHeight),
        clientHeight: scroller.clientHeight,
        scrollHeight: scroller.scrollHeight,
        scrollTop: scroller.scrollTop,
        clipped,
      };
    },
    { name, scroll },
  );
  expect(metrics, `missing status item ${name}`).toBeTruthy();
  return metrics!;
}

async function expectItemFullyVisible(page: Page, name: string, scroll: "none" | "start" | "end" = "none") {
  const m = await measureItem(page, name, scroll);
  expect(m.itemHeight).toBeGreaterThan(16);
  expect(m.itemTop).toBeGreaterThanOrEqual(m.portTop - EPSILON);
  expect(m.itemBottom).toBeLessThanOrEqual(m.portBottom + EPSILON);
  expect(m.itemTop).toBeGreaterThanOrEqual(-EPSILON);
  expect(m.itemBottom).toBeLessThanOrEqual(Math.min(m.viewHeight, m.visualHeight) + EPSILON);
  expect(m.clipped).toBe(false);
}

async function expectEndsReachable(page: Page) {
  const first = await measureItem(page, "无状态", "start");
  expect(first.itemTop).toBeGreaterThanOrEqual(first.portTop - EPSILON);
  expect(first.itemBottom).toBeLessThanOrEqual(first.portBottom + EPSILON);
  expect(first.clipped).toBe(false);
  const last = await measureItem(page, "已精读", "end");
  expect(last.scrollTop + last.clientHeight).toBeGreaterThanOrEqual(Math.min(last.scrollHeight, last.clientHeight) - EPSILON);
  expect(last.itemTop).toBeGreaterThanOrEqual(last.portTop - EPSILON);
  expect(last.itemBottom).toBeLessThanOrEqual(last.portBottom + EPSILON);
  expect(last.itemHeight).toBeGreaterThanOrEqual(first.itemHeight - EPSILON);
  expect(last.clipped).toBe(false);
  expect(last.itemBottom).toBeLessThanOrEqual(Math.min(last.viewHeight, last.visualHeight) + EPSILON);
}

async function expectMenuPortaled(page: Page) {
  const info = await menu(page).evaluate((el) => ({
    inRow: Boolean(el.closest("li.row")),
    inBody: document.body.contains(el),
    inRoot: Boolean(document.getElementById("root")?.contains(el)),
  }));
  expect(info.inRow).toBe(false);
  expect(info.inBody).toBe(true);
  expect(info.inRoot).toBe(false);
}

async function expectMenuInsideViewport(page: Page) {
  const box = await menu(page).evaluate((el) => {
    const r = el.getBoundingClientRect();
    return {
      top: r.top,
      bottom: r.bottom,
      view: Math.min(window.innerHeight, window.visualViewport?.height ?? window.innerHeight),
    };
  });
  expect(box.top).toBeGreaterThanOrEqual(-EPSILON);
  expect(box.bottom).toBeLessThanOrEqual(box.view + EPSILON);
}

async function menuVsChip(page: Page, chip: Locator) {
  return chip.evaluate((trigger) => {
    const panel = document.querySelector("[data-testid=status-menu]");
    if (!(trigger instanceof HTMLElement) || !(panel instanceof HTMLElement)) return null;
    const a = trigger.getBoundingClientRect();
    const b = panel.getBoundingClientRect();
    return { chipTop: a.top, chipBottom: a.bottom, menuTop: b.top, menuBottom: b.bottom };
  });
}

async function expectMenuBelowTrigger(page: Page, chip: Locator) {
  const box = await menuVsChip(page, chip);
  expect(box).toBeTruthy();
  expect(box!.menuTop).toBeGreaterThanOrEqual(box!.chipBottom - EPSILON);
}

async function expectMenuShiftedOverTrigger(page: Page, chip: Locator) {
  const box = await menuVsChip(page, chip);
  expect(box).toBeTruthy();
  expect(box!.menuTop).toBeLessThan(box!.chipBottom);
  expect(box!.menuBottom).toBeGreaterThan(box!.chipTop);
}

async function expectDocumentHeightUnchanged(page: Page, act: () => Promise<void>) {
  const before = await page.evaluate(() => document.documentElement.scrollHeight);
  await act();
  const after = await page.evaluate(() => document.documentElement.scrollHeight);
  expect(after).toBeLessThanOrEqual(before + 1);
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

test.describe("status menu floating layer", () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await expect(firstChip(page)).toBeVisible();
    await expectNoPageSpacer(page);
    await chooseStatus(page, firstChip(page), "无状态");
    await expect(firstChip(page)).toHaveText("状态");
  });

  test("Case A: top trigger keeps natural below placement and both ends reachable", async ({ page }) => {
    await expectDocumentHeightUnchanged(page, async () => {
      await openChip(page, firstChip(page));
    });
    await expectMenuPortaled(page);
    await expectMenuInsideViewport(page);
    await expectMenuBelowTrigger(page, firstChip(page));
    await expect(page.getByRole("menuitemradio", { name: "无状态" })).toHaveAttribute("aria-checked", "true");
    await expectItemFullyVisible(page, "无状态", "none");
    await expectEndsReachable(page);
    await expectNoPageSpacer(page);
  });

  test("Case B: middle selected item stays fully visible without jumping the page", async ({ page }) => {
    await chooseStatus(page, firstChip(page), "泛读中");
    await expect(firstChip(page)).toHaveText("泛读中");
    const before = await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }));
    await openChip(page, firstChip(page));
    const after = await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }));
    expect(after).toEqual(before);
    await expect(page.getByRole("menuitemradio", { name: "泛读中" })).toHaveAttribute("aria-checked", "true");
    await expectItemFullyVisible(page, "泛读中", "none");
    await expectEndsReachable(page);
  });

  test("Case C: last selected item on a low trigger is fully painted and scrollable", async ({ page }) => {
    await chooseStatus(page, lastChip(page), "已精读");
    await expect(lastChip(page)).toHaveText("已精读");
    await page.setViewportSize({ width: 1280, height: 280 });
    await expectDocumentHeightUnchanged(page, async () => {
      await openChip(page, lastChip(page));
    });
    await expectMenuPortaled(page);
    await expectMenuInsideViewport(page);
    await expectMenuShiftedOverTrigger(page, lastChip(page));
    await expectItemFullyVisible(page, "已精读", "none");
    await expectEndsReachable(page);
    await expectNoPageSpacer(page);
  });

  test("Case D: extreme floor triggers keep the last option fully inside the viewport", async ({ page }) => {
    await chooseStatus(page, lastChip(page), "已精读");
    for (const inset of [16, 8, 4]) {
      await closeMenu(page);
      await pinChipToViewportFloor(lastChip(page), inset);
      const trigger = await lastChip(page).evaluate((el, expected) => {
        const box = el.getBoundingClientRect();
        return { bottom: box.bottom, view: window.innerHeight, expected };
      }, inset);
      expect(trigger.bottom).toBeGreaterThan(trigger.view - expectedInsetSlack(inset));
      await openChip(page, lastChip(page));
      await expectMenuInsideViewport(page);
      await expectMenuShiftedOverTrigger(page, lastChip(page));
      await expectItemFullyVisible(page, "已精读", "none");
      await expectEndsReachable(page);
    }
  });

  test("Case E: short viewports keep a single scrollport that can show first and last items", async ({ page }) => {
    await chooseStatus(page, lastChip(page), "已精读");
    for (const height of [360, 320, 240]) {
      await closeMenu(page);
      await page.setViewportSize({ width: 1280, height });
      await openChip(page, lastChip(page));
      await expectMenuInsideViewport(page);
      const geom = await measureItem(page, "已精读", "end");
      if (geom.scrollHeight > geom.clientHeight + EPSILON) {
        expect(geom.clientHeight).toBeLessThanOrEqual(height);
      }
      await expectItemFullyVisible(page, "已精读", "end");
      await expectEndsReachable(page);
    }
  });

  test("Case F: resize while open reclamps and does not keep a stale max-height", async ({ page }) => {
    await openChip(page, lastChip(page));
    const tall = await menu(page).evaluate((el) => el.getBoundingClientRect().height);
    await page.setViewportSize({ width: 1280, height: 360 });
    await expect.poll(async () => {
      const box = await menu(page).evaluate((el) => el.getBoundingClientRect().bottom);
      return box <= 360 + EPSILON;
    }).toBe(true);
    await expectMenuInsideViewport(page);
    await page.setViewportSize({ width: 1280, height: 240 });
    await expect.poll(async () => {
      const box = await menu(page).evaluate((el) => el.getBoundingClientRect().bottom);
      return box <= 240 + EPSILON;
    }).toBe(true);
    await expectMenuInsideViewport(page);
    await expectEndsReachable(page);
    const short = await menu(page).evaluate((el) => el.getBoundingClientRect().height);
    expect(short).toBeLessThanOrEqual(240);
    await page.setViewportSize({ width: 1280, height: 720 });
    await expect.poll(async () => {
      return menu(page).evaluate((el) => el.getBoundingClientRect().height);
    }).toBeGreaterThan(short);
    await expectMenuInsideViewport(page);
    const restored = await menu(page).evaluate((el) => {
      const box = el.getBoundingClientRect();
      return { height: box.height, maxHeight: el.style.maxHeight };
    });
    expect(restored.height).toBeGreaterThan(short);
    expect(restored.height).toBeGreaterThanOrEqual(tall - 2);
    expect(restored.maxHeight === "" || Number.parseFloat(restored.maxHeight) >= restored.height - 2).toBe(true);
    await expectEndsReachable(page);
  });

  test("Case G: ancestor scroll keeps the menu anchored to the chip", async ({ page }) => {
    await page.evaluate(() => {
      const lib = document.querySelector(".lib");
      if (!(lib instanceof HTMLElement)) return;
      lib.style.height = "220px";
      lib.style.overflow = "auto";
    });
    await openChip(page, lastChip(page));
    const before = await page.evaluate(() => {
      const chips = document.querySelectorAll("ol.rows li.row .status-chip");
      const chip = chips[chips.length - 1];
      const panel = document.querySelector("[data-testid=status-menu]");
      if (!(chip instanceof HTMLElement) || !(panel instanceof HTMLElement)) return null;
      const a = chip.getBoundingClientRect();
      const b = panel.getBoundingClientRect();
      return { dx: b.left - a.left, dy: b.top - a.top };
    });
    expect(before).toBeTruthy();
    await page.evaluate(() => {
      const lib = document.querySelector(".lib");
      if (lib instanceof HTMLElement) lib.scrollTop = 48;
    });
    await page.waitForFunction(
      (prev) => {
        const chips = document.querySelectorAll("ol.rows li.row .status-chip");
        const chip = chips[chips.length - 1];
        const panel = document.querySelector("[data-testid=status-menu]");
        if (!(chip instanceof HTMLElement) || !(panel instanceof HTMLElement) || !prev) return false;
        const a = chip.getBoundingClientRect();
        const b = panel.getBoundingClientRect();
        return Math.abs(b.left - a.left - prev.dx) <= 2 && Math.abs(b.top - a.top - prev.dy) <= 2;
      },
      before,
    );
    await expectMenuInsideViewport(page);
  });

  test("Case H: content resize while open repositions and keeps last item reachable", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 320 });
    await openChip(page, lastChip(page));
    await menu(page).evaluate((el) => {
      el.querySelectorAll<HTMLElement>("button").forEach((button) => {
        button.style.minHeight = "72px";
      });
    });
    await page.waitForFunction(() => {
      const el = document.querySelector("[data-testid=status-menu]");
      if (!(el instanceof HTMLElement)) return false;
      return el.scrollHeight > el.clientHeight;
    });
    await expectMenuInsideViewport(page);
    await expectEndsReachable(page);
  });

  test("stress: 12 extra options still scroll the last row fully into the menu viewport", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 280 });
    await openChip(page, firstChip(page));
    await menu(page).evaluate((el) => {
      for (let index = 1; index <= 12; index += 1) {
        const button = document.createElement("button");
        button.type = "button";
        button.setAttribute("role", "menuitemradio");
        button.textContent = `压力项 ${index}`;
        el.append(button);
      }
    });
    await page.waitForFunction(() => {
      const el = document.querySelector("[data-testid=status-menu]");
      return el instanceof HTMLElement && el.querySelectorAll("[role=menuitemradio]").length >= 19;
    });
    const last = await measureItem(page, "压力项 12", "end");
    expect(last.scrollHeight).toBeGreaterThan(last.clientHeight);
    expect(last.itemTop).toBeGreaterThanOrEqual(last.portTop - EPSILON);
    expect(last.itemBottom).toBeLessThanOrEqual(last.portBottom + EPSILON);
    expect(last.clipped).toBe(false);
    const first = await measureItem(page, "无状态", "start");
    expect(first.itemTop).toBeGreaterThanOrEqual(first.portTop - EPSILON);
    expect(first.itemBottom).toBeLessThanOrEqual(first.portBottom + EPSILON);
  });
});

test.describe("status menu mobile viewport", () => {
  test.use({ viewport: { width: 390, height: 500 } });

  test("Case I: last selected status stays fully visible on a short mobile window", async ({ page }) => {
    await page.goto("/");
    await expect(lastChip(page)).toBeVisible();
    await chooseStatus(page, lastChip(page), "已精读");
    await pinChipToViewportFloor(lastChip(page), 8);
    await expectDocumentHeightUnchanged(page, async () => {
      await openChip(page, lastChip(page));
    });
    await expectMenuPortaled(page);
    await expectMenuInsideViewport(page);
    await expectItemFullyVisible(page, "已精读", "none");
    await expectEndsReachable(page);
    await expectNoPageSpacer(page);
  });
});

test.describe("status menu screenshots", () => {
  test.use({ viewport: { width: 1280, height: 360 } });

  test("status-menu-low-trigger and short-viewport", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "screenshot baseline is desktop-only");
    await page.goto("/");
    await chooseStatus(page, lastChip(page), "已精读");
    await pinChipToViewportFloor(lastChip(page), 8);
    await openChip(page, lastChip(page));
    await expectItemFullyVisible(page, "已精读", "none");
    await expect(page).toHaveScreenshot("status-menu-low-trigger.png", {
      animations: "disabled",
      maxDiffPixels: 120,
    });
    await page.setViewportSize({ width: 1280, height: 240 });
    await expect.poll(async () => {
      const box = await menu(page).evaluate((el) => el.getBoundingClientRect().bottom);
      return box <= 240 + EPSILON;
    }).toBe(true);
    await expectMenuInsideViewport(page);
    await expectEndsReachable(page);
    await expect(page).toHaveScreenshot("status-menu-short-viewport.png", {
      animations: "disabled",
      maxDiffPixels: 120,
    });
  });
});

function expectedInsetSlack(inset: number) {
  return inset + 6;
}
