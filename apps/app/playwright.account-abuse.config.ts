import { defineConfig, devices } from "@playwright/test";
import { MAIL_OUTBOX_PATH } from "./e2e/fixtures/mail-outbox";
import { nextServerCommand } from "./playwright-server";

/**
 * Abuse protection for the free trial account (#277), local stage: real database, real auth, mails
 * in the file outbox. Same server setup as the open-signup suite (no auth bypass), but the spec
 * `account-abuse-protection.spec.ts` is the one that runs, and it reads the app and the mails from
 * `PLAYWRIGHT_BASE_URL` and `PLAYWRIGHT_MAIL_OUTBOX`; this config sets both to its own local server
 * and file outbox, whatever the environment says (against a test system use the testsystem config).
 *
 * Needs a migrated database: `PLAYWRIGHT_ACCOUNT_ABUSE_DATABASE_URL` (or `DATABASE_URL`), e.g. the
 * local stack from `deploy/local/docker-compose.yml` after `bun run db:migrate`. A throwaway database.
 */

const PORT = Number(process.env.PLAYWRIGHT_ACCOUNT_ABUSE_PORT ?? 3513);
const baseURL = process.env.PLAYWRIGHT_ACCOUNT_ABUSE_BASE_URL ?? `http://localhost:${PORT}`;
const databaseUrl = process.env.PLAYWRIGHT_ACCOUNT_ABUSE_DATABASE_URL ?? process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("The account-abuse E2E suite needs PLAYWRIGHT_ACCOUNT_ABUSE_DATABASE_URL (or DATABASE_URL) pointing at a migrated Postgres.");
}

// The spec reads these two from the environment (it also runs against a test system by URL).
process.env.PLAYWRIGHT_BASE_URL = baseURL;
process.env.PLAYWRIGHT_MAIL_OUTBOX = MAIL_OUTBOX_PATH;

export default defineConfig({
  testDir: "./e2e",
  testMatch: /account-abuse-protection\.spec\.ts/,
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
  projects: [{ name: "chromium-account-abuse", use: { ...devices["Desktop Chrome"] } }],
});
