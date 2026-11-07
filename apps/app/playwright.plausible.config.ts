import { defineConfig, devices } from "@playwright/test";

/**
 * Plausible tracking suite (#299): the positive criteria against the production build.
 *
 * Unlike the other configs this one has no `webServer`: the spec starts a local counterpart and starts
 * the built app twice itself (tracking on, then `BLOOMMD_PLAUSIBLE_DISABLED=true`), because the switch
 * is a runtime env and the second start must use the same build. The default E2E run cannot cover it:
 * its servers run with `BLOOMMD_E2E_TEST_MODE=1`, which switches the tracking off.
 *
 * Needs the production build: `bun run build`, then `PLAYWRIGHT_SERVER_MODE=production bun run test:e2e:plausible`.
 */

if (process.env.PLAYWRIGHT_SERVER_MODE !== "production") {
  throw new Error("The Plausible E2E suite needs the production build: run `bun run build`, then set PLAYWRIGHT_SERVER_MODE=production.");
}

export default defineConfig({
  testDir: "./e2e",
  testMatch: /plausible-tracking-local\.spec\.ts/,
  timeout: 120_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium-plausible", use: { ...devices["Desktop Chrome"] } }],
});
