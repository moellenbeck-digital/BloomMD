import { defineConfig, devices } from "@playwright/test";
import { nextServerCommand } from "./playwright-server";

const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 3211);
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${PORT}`;
// Local stand-in for the Plausible instance of Ops. The marketing server proxies /_plausible/... to it,
// so the e2e run needs no network access and can read back which headers arrived.
const PLAUSIBLE_STUB_PORT = Number(process.env.PLAYWRIGHT_PLAUSIBLE_STUB_PORT ?? 3291);

export default defineConfig({
  testDir: "./e2e",
  // Wiki needs its own server env because the default marketing run verifies that public Wiki stays
  // disabled unless it is deliberately configured.
  testIgnore: [/wiki\.spec\.ts/, /visual-regression\.spec\.ts/],
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: `bun e2e/support/plausible-stub.ts ${PLAUSIBLE_STUB_PORT}`,
      url: `http://127.0.0.1:${PLAUSIBLE_STUB_PORT}/__health`,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
    {
      command: nextServerCommand(PORT),
      url: baseURL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        PLAUSIBLE_PROXY_TARGET: `http://127.0.0.1:${PLAUSIBLE_STUB_PORT}`,
        NEXT_PUBLIC_SITE_URL: baseURL,
        NEXT_PUBLIC_MARKETING_URL: baseURL,
        NEXT_PUBLIC_APP_URL: "https://bloommd.app",
        // The script only loads on the configured domain; the e2e server is served from localhost.
        NEXT_PUBLIC_PLAUSIBLE_DOMAIN: "localhost",
        NEXT_PUBLIC_PLAUSIBLE_SRC: "/_plausible/js/script.js",
        NEXT_PUBLIC_PLAUSIBLE_API_HOST: "/_plausible",
        NEXT_PUBLIC_DESKTOP_MACOS_ARM64_DOWNLOAD_URL: "https://bloommd.io/_desktop-updates/stable-macos-arm64-BloomMD.dmg",
        BLOOMMD_REQUIRE_AUTH: "1",
        BLOOMMD_E2E_AUTH_BYPASS: "1",
      },
    },
  ],
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      // A project-level testIgnore replaces the top-level one, so separate-suite specs repeat here.
      testIgnore: [/mobile-smoke\.spec\.ts/, /wiki\.spec\.ts/, /visual-regression\.spec\.ts/],
    },
    {
      name: "chromium-mobile",
      use: { ...devices["Pixel 5"] },
      testMatch: /mobile-smoke\.spec\.ts/,
    },
    {
      name: "chromium-mobile-themes",
      use: { ...devices["Pixel 5"], colorScheme: "light" },
      testMatch: /theme-matrix\.spec\.ts/,
    },
  ],
});
