import { defineConfig, devices } from "@playwright/test";
import { nextDevCommand } from "./playwright-server";

const PORT = Number(process.env.PLAYWRIGHT_VISUAL_PORT ?? 3511);
const baseURL = process.env.PLAYWRIGHT_VISUAL_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  testMatch: /visual-regression\.spec\.ts/,
  timeout: 40_000,
  expect: {
    timeout: 10_000,
    toHaveScreenshot: {
      animations: "disabled",
      caret: "hide",
      maxDiffPixelRatio: 0.015,
      threshold: 0.2,
    },
  },
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report-visual" }]],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: nextDevCommand(PORT),
    url: `${baseURL}/login`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_SITE_URL: baseURL,
      BLOOMMD_REQUIRE_AUTH: "1",
      BLOOMMD_E2E_AUTH_BYPASS: "1",
      BLOOMMD_DIR: "./e2e/fixtures/visual-workspace",
    },
  },
  projects: [
    {
      name: "chromium-1280-light",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 }, colorScheme: "light" },
    },
    {
      name: "chromium-390-light",
      use: { ...devices["Pixel 5"], viewport: { width: 390, height: 844 }, colorScheme: "light" },
    },
    {
      name: "chromium-1280-dark",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 }, colorScheme: "dark" },
    },
  ],
});
