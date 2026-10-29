import { defineConfig, devices } from "@playwright/test";
import { MAIL_OUTBOX_PATH } from "./e2e/fixtures/mail-outbox";
import { nextServerCommand } from "./playwright-server";

/**
 * Open self-registration suite (#104): closed-beta gate off, real database, real auth.
 *
 * The default E2E run uses the auth bypass, which skips password checks, email confirmation and
 * rate limits, so it cannot show that registration works end to end. This run starts a server with
 * the gate off and *without* the bypass, against a real Postgres, and reads the confirmation and
 * reset mails from a file outbox instead of a mail provider.
 *
 * Needs a migrated database: `PLAYWRIGHT_OPEN_SIGNUP_DATABASE_URL` (or `DATABASE_URL`), e.g. the
 * local stack from `deploy/local/docker-compose.yml` after `bun run db:migrate`.
 */

const PORT = Number(process.env.PLAYWRIGHT_OPEN_SIGNUP_PORT ?? 3511);
const baseURL = process.env.PLAYWRIGHT_OPEN_SIGNUP_BASE_URL ?? `http://localhost:${PORT}`;
const databaseUrl = process.env.PLAYWRIGHT_OPEN_SIGNUP_DATABASE_URL ?? process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("The open-signup E2E suite needs PLAYWRIGHT_OPEN_SIGNUP_DATABASE_URL (or DATABASE_URL) pointing at a migrated Postgres.");
}

export default defineConfig({
  testDir: "./e2e",
  testMatch: /open-signup\.spec\.ts/,
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
      // Global mail cap (#169): low enough that the cap test at the end of the suite reaches it,
      // high enough for the ~30 mails of the tests before it. Keep in step with MAIL_HOURLY_LIMIT in the spec.
      BLOOMMD_MAIL_HOURLY_LIMIT: "50",
      DATABASE_URL: databaseUrl,
    },
  },
  projects: [{ name: "chromium-open-signup", use: { ...devices["Desktop Chrome"] } }],
});
