import { defineConfig, devices } from "@playwright/test";
import { nextDevCommand } from "./playwright-server";

const WEB_PORT = Number(process.env.PLAYWRIGHT_COLLAB_PORT ?? 3611);
const SYNC_PORT = Number(process.env.PLAYWRIGHT_COLLAB_SYNC_PORT ?? 4611);
const baseURL = process.env.PLAYWRIGHT_COLLAB_BASE_URL ?? `http://localhost:${WEB_PORT}`;
const syncURL = process.env.PLAYWRIGHT_COLLAB_SYNC_URL ?? `ws://localhost:${SYNC_PORT}`;
const workspaceDir = "../../.qa/playwright-collaboration-workspace";
const prepareWorkspace = `mkdir -p ${workspaceDir} && cp e2e/fixtures/collaboration-workspace/*.md ${workspaceDir}/`;

export default defineConfig({
  testDir: "./e2e",
  testMatch: /collaboration\.spec\.ts/,
  timeout: 45_000,
  expect: { timeout: 12_000 },
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report-collaboration" }]],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    ...devices["Desktop Chrome"],
    viewport: { width: 1280, height: 800 },
  },
  webServer: [
    {
      command: `${prepareWorkspace} && bun run --cwd ../../packages/sync start`,
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
      command: `${prepareWorkspace} && ${nextDevCommand(WEB_PORT)}`,
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
  projects: [{ name: "chromium-collaboration", use: { ...devices["Desktop Chrome"] } }],
});
