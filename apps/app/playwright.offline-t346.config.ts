import { defineConfig, devices } from "@playwright/test";
import { STAGE_CLIENT_VIEWPORT } from "./e2e/offline-t346-stage";
import { nextDevCommand } from "./playwright-server";

/**
 * Ticket #346 — E2E-Abnahme „Offline-Konflikt W1“ (@t346): eigener Sync-Server und Arbeitsordner, zwei Browser-Kontexte,
 * Offline über Playwright, echte Dateien und echte API, kein Mock an der Sync-Grenze. Muster: `playwright.offline.config.ts`
 * (@t261) und `playwright.learnings-w0.config.ts` (@t345). Ablauf und Reset: docs/nachweise/t346.md, docs/offline-konflikt.md.
 *
 * Eigene Ports (Web 3613, Sync 4613), damit der Lauf nicht an die Server von `test:e2e:offline` gerät; zwei `next dev`
 * im selben Projekt gleichzeitig verweigert Next.js, die Läufe also nacheinander starten.
 *
 * Lauf: `bun run --cwd apps/app test:e2e:offline-t346`
 */
const WEB_PORT = Number(process.env.PLAYWRIGHT_OFFLINE_T346_PORT ?? 3613);
const SYNC_PORT = Number(process.env.PLAYWRIGHT_OFFLINE_T346_SYNC_PORT ?? 4613);
// The helpers of @t261 read the health endpoint of the sync server through this variable.
process.env.PLAYWRIGHT_OFFLINE_SYNC_PORT = String(SYNC_PORT);
const baseURL = `http://localhost:${WEB_PORT}`;
const syncURL = `ws://localhost:${SYNC_PORT}`;
const workspaceDir = "../../.qa/playwright-offline-workspace";

export default defineConfig({
  testDir: "./e2e",
  testMatch: /offline-t346\.spec\.ts/,
  // Reset (docs/nachweise/t346.md): deletes the workspace with `.snapshots` and `.bloommd/backups`; the spec creates its files itself.
  globalSetup: "./playwright-offline-setup.ts",
  timeout: 300_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  outputDir: "/tmp/bloommd-e2e-offline-t346",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ...devices["Desktop Chrome"],
    viewport: STAGE_CLIENT_VIEWPORT,
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
  projects: [{ name: "chromium-offline-t346", use: { ...devices["Desktop Chrome"], viewport: STAGE_CLIENT_VIEWPORT } }],
});
