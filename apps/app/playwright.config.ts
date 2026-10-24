import { defineConfig, devices } from "@playwright/test";
import { nextServerCommand } from "./playwright-server";

const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 3211);
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  // These suites need dedicated server env/ports. The default run keeps release contracts honest
  // and runs the specialized suites through their own configs.
  testIgnore: [/wiki\.spec\.ts/, /beta-gate\.spec\.ts/, /collaboration\.spec\.ts/, /visual-regression\.spec\.ts/],
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  globalSetup: "./playwright-global-setup.ts",
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: nextServerCommand(PORT),
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_SITE_URL: baseURL,
      NEXT_PUBLIC_APP_URL: baseURL,
      NEXT_PUBLIC_MARKETING_URL: "https://bloommd.io",
      BLOOMMD_REQUIRE_AUTH: "1",
      BLOOMMD_AUTH_SECRET: "ci-only-auth-secret-that-is-long-and-random",
      BLOOMMD_E2E_AUTH_BYPASS: "1",
      BLOOMMD_E2E_TEST_MODE: "1",
      BLOOMMD_LOCAL_DEPLOYMENT: "1",
    },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      // A project-level testIgnore replaces the top-level one, so separate-suite specs repeat here.
      testIgnore: [/mobile-smoke\.spec\.ts/, /wiki\.spec\.ts/, /beta-gate\.spec\.ts/, /collaboration\.spec\.ts/, /visual-regression\.spec\.ts/],
    },
    {
      name: "chromium-mobile",
      use: { ...devices["Pixel 5"] },
      testMatch: /mobile-smoke\.spec\.ts/,
    },
    {
      name: "chromium-mobile-themes",
      use: { ...devices["Pixel 5"], colorScheme: "light" },
      testMatch: /theme-matrix\.spec\.ts/,
    },
  ],
});
