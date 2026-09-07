import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.WEPAPER_E2E_URL || "https://wepaper.plainlist.space";
const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: 0,
  use: {
    baseURL,
    acceptDownloads: true,
    trace: "off",
    launchOptions: {
      args: process.env.WEPAPER_RESOLVE_IP
        ? [`--host-resolver-rules=MAP wepaper.plainlist.space ${process.env.WEPAPER_RESOLVE_IP}`]
        : [],
    },
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
    },
    {
      name: "mobile",
      use: {
        ...devices["Desktop Chrome"],
        browserName: "chromium",
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
        userAgent: IPHONE_UA,
        extraHTTPHeaders: { "Sec-CH-UA-Mobile": "?1" },
      },
    },
  ],
});
