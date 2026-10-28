import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

/**
 * UI tests against an already running test system (e.g. `bloommd-test`). Unlike `playwright.config.ts`
 * this config starts nothing: no `webServer`, no `globalSetup` (the dev-route warm-up is for `next dev`).
 *
 * Prerequisite: the test system runs in test mode (`BLOOMMD_REQUIRE_AUTH=1`, `BLOOMMD_E2E_AUTH_BYPASS=1`,
 * `BLOOMMD_E2E_TEST_MODE=1`).
 *
 * Env: `PLAYWRIGHT_BASE_URL` (required), `PLAYWRIGHT_ARTIFACTS_DIR` (optional, default
 * `./test-results-testsystem`; results go to `results/`, the HTML report to `report/`).
 *
 * Select tests only on the command line: `--grep @t<nr>`. This config sets no `grep`.
 * See `e2e/README.md`.
 */

const baseURL = process.env.PLAYWRIGHT_BASE_URL?.trim();
if (!baseURL) {
  throw new Error(
    "PLAYWRIGHT_BASE_URL is not set. playwright.testsystem.config.ts tests an already running system and starts no server. " +
      "Example: PLAYWRIGHT_BASE_URL=http://app.bloommd-test.svc.cluster.local:3000 bunx playwright test -c playwright.testsystem.config.ts --grep @t<nr>",
  );
}
try {
  new URL(baseURL);
} catch {
  throw new Error(`PLAYWRIGHT_BASE_URL is not a valid URL: "${baseURL}". Expected e.g. http://app.bloommd-test.svc.cluster.local:3000`);
}

const artifactsDir = path.resolve(process.env.PLAYWRIGHT_ARTIFACTS_DIR?.trim() || "./test-results-testsystem");

export default defineConfig({
  testDir: "./e2e",
  // A project-level testIgnore replaces the top-level one, so the exclusions live in the project below.
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  retries: 0,
  workers: 1,
  outputDir: path.join(artifactsDir, "results"),
  reporter: [["list"], ["html", { open: "never", outputFolder: path.join(artifactsDir, "report") }]],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      // Suites that need their own server env/ports (see their own configs), plus the mobile smoke suite.
      testIgnore: [/mobile-smoke\.spec\.ts/, /wiki\.spec\.ts/, /beta-gate\.spec\.ts/, /open-signup\.spec\.ts/, /collaboration\.spec\.ts/, /visual-regression\.spec\.ts/],
    },
  ],
});
