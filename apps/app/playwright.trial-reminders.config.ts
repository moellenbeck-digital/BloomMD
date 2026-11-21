import { defineConfig, devices } from "@playwright/test";
import { MAIL_OUTBOX_PATH } from "./e2e/fixtures/mail-outbox";
import { nextServerCommand } from "./playwright-server";

/**
 * Proof of the trial period and its reminder mails (#274): real database, real auth, mails into a file outbox.
 *
 * Like the open-signup and trial-readonly suites this starts a server without the auth bypass, against a real Postgres.
 * The spec registers and confirms accounts for real and runs the reminder job (`bun run db:trial-reminders`) as a child
 * process with the same outbox; day 15 and day 23 are reached with the job's `--jetzt`, not by waiting.
 *
 * Needs a migrated database: `PLAYWRIGHT_TRIAL_REMINDERS_DATABASE_URL` (or `DATABASE_URL`), e.g. the local stack from
 * `deploy/local/docker-compose.yml` after `bun run db:migrate`. A throwaway database: the spec deletes the accounts of its
 * test mailbox. Against a test system the suite runs with `playwright.testsystem.config.ts --grep @t274`; see e2e/README.md.
 */

const PORT = Number(process.env.PLAYWRIGHT_TRIAL_REMINDERS_PORT ?? 3513);
const baseURL = process.env.PLAYWRIGHT_TRIAL_REMINDERS_BASE_URL ?? `http://localhost:${PORT}`;
const databaseUrl = process.env.PLAYWRIGHT_TRIAL_REMINDERS_DATABASE_URL ?? process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("The trial-reminders E2E suite needs PLAYWRIGHT_TRIAL_REMINDERS_DATABASE_URL (or DATABASE_URL) pointing at a migrated Postgres.");
}

// The spec reads these (the config is loaded in the runner and in every worker, so they are set before the spec starts).
process.env.PLAYWRIGHT_TRIAL_REMINDERS_LOCAL = "1";
process.env.PLAYWRIGHT_T274_DATABASE_URL = databaseUrl;
process.env.PLAYWRIGHT_BASE_URL = baseURL;

export default defineConfig({
  testDir: "./e2e",
  testMatch: /trial-reminders-t274\.spec\.ts/,
  timeout: 240_000,
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
    // Never adopt an already running server: one with the auth bypass would pass for the wrong reason.
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
      BLOOMMD_MAIL_HOURLY_LIMIT: "50",
      DATABASE_URL: databaseUrl,
    },
  },
  projects: [{ name: "chromium-trial-reminders", use: { ...devices["Desktop Chrome"] } }],
});
