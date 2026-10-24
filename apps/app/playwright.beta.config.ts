import { defineConfig, devices } from "@playwright/test";
import { nextServerCommand } from "./playwright-server";

/**
 * Closed-beta gate suite.
 *
 * The default web E2E run intentionally keeps the beta gate off, matching local development. This
 * run starts a separate server with the gate on so the invitation boundary is exercised at the HTTP
 * and UI layer, not just through unit tests.
 */

const PORT = Number(process.env.PLAYWRIGHT_BETA_PORT ?? 3411);
const baseURL = process.env.PLAYWRIGHT_BETA_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  testMatch: /beta-gate\.spec\.ts/,
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
    command: nextServerCommand(PORT),
    url: `${baseURL}/signup`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_SITE_URL: baseURL,
      NEXT_PUBLIC_APP_URL: baseURL,
      NEXT_PUBLIC_MARKETING_URL: "http://127.0.0.1:3212",
      BLOOMMD_REQUIRE_AUTH: "1",
      BLOOMMD_AUTH_SECRET: "ci-only-auth-secret-that-is-long-and-random",
      BLOOMMD_E2E_AUTH_BYPASS: "1",
      BLOOMMD_E2E_TEST_MODE: "1",
      BLOOMMD_LOCAL_DEPLOYMENT: "1",
      BLOOMMD_BETA_ACCESS: "1",
      BLOOMMD_BETA_ALLOWED_EMAILS: "invited@bloommd.local,@partner.test",
      BLOOMMD_BETA_INVITE_CODES: "beta-e2e-code",
    },
  },
  projects: [{ name: "chromium-beta", use: { ...devices["Desktop Chrome"] } }],
});
