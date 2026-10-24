import { defineConfig, devices } from "@playwright/test";
import { nextDevCommand } from "./playwright-server";

/**
 * The Wiki suite runs on its own, with its own server.
 *
 * Two reasons it cannot share the main run:
 *
 * 1. The main server must keep `BLOOMMD_WIKI_PUBLIC` unset, because a release contract asserts the
 *    public Wiki stays off unless someone enables it deliberately. That is the behaviour being
 *    protected, not a test detail — turning it on globally to make these tests convenient would
 *    delete the guarantee.
 * 2. Next.js refuses to run a second `next dev` for the same project ("Another next dev server is
 *    already running"), so two servers in one config is not an option either.
 *
 * Run with: `bun run --cwd apps/marketing test:e2e:wiki`
 */

const PORT = Number(process.env.PLAYWRIGHT_WIKI_PORT ?? 3311);
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  testMatch: /wiki\.spec\.ts/,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: nextDevCommand(PORT),
    url: `${baseURL}/api/wiki`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_SITE_URL: baseURL,
      BLOOMMD_REQUIRE_AUTH: "1",
      BLOOMMD_E2E_AUTH_BYPASS: "1",
      // The fixture bundle carries a broken link, a missing local file and a remote image on
      // purpose: those are the cases worth asserting.
      BLOOMMD_WIKI_PUBLIC: "1",
      BLOOMMD_WIKI_DIR: "./e2e/fixtures/wiki",
    },
  },
  projects: [{ name: "chromium-wiki", use: { ...devices["Desktop Chrome"] } }],
});
