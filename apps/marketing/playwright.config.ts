import { defineConfig, devices } from "@playwright/test";
import { nextServerCommand } from "./playwright-server";

const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 3211);
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${PORT}`;

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
  webServer: {
    command: nextServerCommand(PORT),
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_SITE_URL: baseURL,
      NEXT_PUBLIC_MARKETING_URL: baseURL,
      NEXT_PUBLIC_APP_URL: "https://bloommd.app",
      NEXT_PUBLIC_PLAUSIBLE_DOMAIN: "bloommd.io",
      NEXT_PUBLIC_PLAUSIBLE_SRC: "https://plausible.moellenbeck-digital.io/js/script.js",
      NEXT_PUBLIC_PLAUSIBLE_API_HOST: "https://plausible.moellenbeck-digital.io",
      NEXT_PUBLIC_DESKTOP_MACOS_ARM64_DOWNLOAD_URL: "https://bloommd.io/_desktop-updates/stable-macos-arm64-BloomMD.dmg",
      BLOOMMD_REQUIRE_AUTH: "1",
      BLOOMMD_E2E_AUTH_BYPASS: "1",
    },
  },
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
