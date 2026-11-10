import { defineConfig, devices } from "@playwright/test";

/**
 * Touch views of the built mobile assets (#68). Serves `dist` (run `bun run build` first) with
 * `vite preview` and opens it with Playwright device profiles. The iOS profiles run on Chromium:
 * they give the iPhone/iPad viewport, touch input and pixel ratio, not WebKit's rendering.
 * Run it from `packages/mobile`: `bunx playwright test --config e2e/playwright.config.ts`.
 */
const PORT = Number(process.env.MOBILE_PREVIEW_PORT ?? 4173);

const chromium = { defaultBrowserType: "chromium" as const };

export default defineConfig({
  testDir: ".",
  testMatch: /touch-views\.spec\.ts/,
  globalSetup: "./global-setup.ts",
  outputDir: "../test-results",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  // The build is static, so a failure is a finding and no flake to retry away.
  retries: 0,
  reporter: [["list"], ["json", { outputFile: "../test-results/results.json" }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: `bun run preview --port ${PORT} --strictPort`,
    cwd: "..",
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects: [
    { name: "iphone-se", use: { ...devices["iPhone SE"], ...chromium } },
    { name: "ipad-portrait", use: { ...devices["iPad (gen 7)"], ...chromium } },
    { name: "pixel-5", use: { ...devices["Pixel 5"] } },
  ],
});
