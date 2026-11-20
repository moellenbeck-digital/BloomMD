import { defineConfig, devices } from "@playwright/test";
import { nextDevCommand } from "./playwright-server";

const WEB_PORT = Number(process.env.PLAYWRIGHT_OFFLINE_PORT ?? 3612);
const SYNC_PORT = Number(process.env.PLAYWRIGHT_OFFLINE_SYNC_PORT ?? 4612);
const baseURL = process.env.PLAYWRIGHT_OFFLINE_BASE_URL ?? `http://localhost:${WEB_PORT}`;
const syncURL = process.env.PLAYWRIGHT_OFFLINE_SYNC_URL ?? `ws://localhost:${SYNC_PORT}`;
const workspaceDir = "../../.qa/playwright-offline-workspace";

export default defineConfig({
  testDir: "./e2e",
  testMatch: /offline-collaboration\.spec\.ts/,
  // Reset (see docs/offline-konflikt.md): test room, snapshots and starting files are recreated.
  globalSetup: "./playwright-offline-setup.ts",
  timeout: 180_000,
  expect: { timeout: 12_000 },
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report-offline" }]],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    ...devices["Desktop Chrome"],
    viewport: { width: 1280, height: 800 },
  },
  webServer: [
    {
      command: "bun run --cwd ../../packages/sync start",
      url: `http://localhost:${SYNC_PORT}/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        BLOOMMD_DIR: workspaceDir,
        SYNC_PORT: String(SYNC_PORT),
        SYNC_PERSIST_DEBOUNCE: "250",
        SYNC_DESTROY_DELAY: "1000",
      },
    },
    {
      command: nextDevCommand(WEB_PORT),
      url: `${baseURL}/app`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        NEXT_PUBLIC_SITE_URL: baseURL,
        NEXT_PUBLIC_SYNC_URL: syncURL,
        BLOOMMD_REQUIRE_AUTH: "1",
        BLOOMMD_E2E_AUTH_BYPASS: "1",
        BLOOMMD_DIR: workspaceDir,
      },
    },
  ],
  projects: [{ name: "chromium-offline", use: { ...devices["Desktop Chrome"] } }],
});
