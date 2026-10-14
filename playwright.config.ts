import { defineConfig, devices } from "@playwright/test";

/**
 * E2E for the main flow. Uses Playwright's bundled Chromium by default
 * (`npx playwright install chromium`). Set CHROMIUM_PATH (and optionally
 * CHROMIUM_ARGS as a JSON array) to use another Chromium build, e.g. in CI images
 * where the Playwright CDN is blocked.
 */
const executablePath = process.env.CHROMIUM_PATH || undefined;
const args: string[] = process.env.CHROMIUM_ARGS ? JSON.parse(process.env.CHROMIUM_ARGS) : [];
const port = Number(process.env.E2E_PORT ?? 3100);

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 45_000,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${port}`,
    trace: "retain-on-failure",
    launchOptions: { executablePath, args },
  },
  projects: [
    {
      name: "mobile",
      use: { ...devices["Pixel 7"], browserName: "chromium", launchOptions: { executablePath, args } },
    },
    {
      name: "desktop",
      use: { viewport: { width: 1440, height: 900 }, browserName: "chromium", launchOptions: { executablePath, args } },
    },
  ],
  webServer: {
    command: `npx next start -p ${port}`,
    port,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    // No provider keys: the suite always runs against demo mode.
    env: { ROUTE_PROVIDER: "mock", TRAFFIC_PROVIDER: "mock" },
  },
});
