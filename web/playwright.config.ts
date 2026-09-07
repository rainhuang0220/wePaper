import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.WEPAPER_E2E_URL || "http://127.0.0.1:8799";
const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const ANDROID_UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  use: {
    baseURL,
    acceptDownloads: true,
    trace: "off",
  },
  webServer: process.env.WEPAPER_E2E_URL
    ? undefined
    : {
        command: "uv run python -m wepaper.e2e_server",
        url: "http://127.0.0.1:8799/api/v1/health",
        reuseExistingServer: false,
        timeout: 30_000,
        cwd: "..",
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
        userAgent: ANDROID_UA,
        extraHTTPHeaders: { "Sec-CH-UA-Mobile": "?1" },
      },
    },
    {
      name: "mobile-ios-emulation",
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
