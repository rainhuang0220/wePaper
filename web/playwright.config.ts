import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.WEPAPER_E2E_URL || "https://wepaper.plainlist.space";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: 0,
  use: {
    baseURL,
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
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
});
