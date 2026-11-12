import { defineConfig, devices } from "@playwright/test";
import { MAIL_OUTBOX_PATH } from "./e2e/fixtures/mail-outbox";
import { nextServerCommand } from "./playwright-server";

/**
 * Read-only mode after the trial and its exception for accounts with an active plan (#274, #378):
 * real database, real auth, `BLOOMMD_TRIAL_READONLY=1`.
 *
 * The default E2E run uses the auth bypass and has no database, so it has neither a trial end nor a
 * plan. This run starts a server like the open-signup suite (no bypass, mails into a file outbox)
 * with the switch on; the spec sets the trial end and the plan per SQL.
 *
 * Needs a migrated database: `PLAYWRIGHT_TRIAL_READONLY_DATABASE_URL` (or `DATABASE_URL`), e.g. the
 * local stack from `deploy/local/docker-compose.yml` after `bun run db:migrate`. A throwaway database.
 */

const PORT = Number(process.env.PLAYWRIGHT_TRIAL_READONLY_PORT ?? 3512);
const baseURL = process.env.PLAYWRIGHT_TRIAL_READONLY_BASE_URL ?? `http://localhost:${PORT}`;
const databaseUrl = process.env.PLAYWRIGHT_TRIAL_READONLY_DATABASE_URL ?? process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("The trial-readonly E2E suite needs PLAYWRIGHT_TRIAL_READONLY_DATABASE_URL (or DATABASE_URL) pointing at a migrated Postgres.");
}

export default defineConfig({
  testDir: "./e2e",
  testMatch: /trial-readonly-t378\.spec\.ts/,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: nextServerCommand(PORT),
    url: `${baseURL}/signup`,
    // Never adopt an already running server: one with the auth bypass or without the switch would pass for the wrong reason.
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_SITE_URL: baseURL,
      NEXT_PUBLIC_APP_URL: baseURL,
      NEXT_PUBLIC_MARKETING_URL: "http://127.0.0.1:3212",
      BLOOMMD_REQUIRE_AUTH: "1",
      BLOOMMD_AUTH_SECRET: "ci-only-auth-secret-that-is-long-and-random",
      BLOOMMD_LOCAL_DEPLOYMENT: "1",
      BLOOMMD_BETA_ACCESS: "0",
      // The test marker only enables the mail outbox here; the bypass flag stays unset on purpose.
      BLOOMMD_E2E_TEST_MODE: "1",
      BLOOMMD_E2E_MAIL_OUTBOX: MAIL_OUTBOX_PATH,
      BLOOMMD_E2E_AUTH_BYPASS: "",
      BLOOMMD_TRIAL_READONLY: "1",
      BLOOMMD_MAIL_HOURLY_LIMIT: "50",
      DATABASE_URL: databaseUrl,
    },
  },
  projects: [{ name: "chromium-trial-readonly", use: { ...devices["Desktop Chrome"] } }],
});
