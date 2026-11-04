import { defineConfig, devices } from "@playwright/test";
import { fileURLToPath } from "node:url";

/**
 * Screenshots for the online help (`bloommd.io/docs`).
 *
 * A separate config, not part of the normal E2E run: the capture specs live in `docs-screenshots/`
 * (the default `testDir` is `e2e/`) and write PNG files into `public/docs/`.
 *
 * Run with: `bun run --cwd apps/marketing docs:screenshots`
 * Subsets:  `docs:screenshots:app` (web app and sync), `docs:screenshots:marketing` (demo) and
 *           `docs:screenshots:gate` (signup pages with the access switch on, a server of its own).
 *
 * Fixed on purpose: window 1280x800, scale factor 1, light theme, UTC, reduced motion. Every picture
 * comes out once per language (`name.png` German, `name-en.png` English). The only data source is
 * checked-in material (`test-vault/`); nothing private is read.
 *
 * Three servers, so run it through `scripts/team-lauf` inside the dev-team pod:
 * `scripts/team-lauf bun run --cwd apps/marketing docs:screenshots`.
 */

const APP_PORT = Number(process.env.DOCS_SCREENSHOTS_APP_PORT ?? 3811);
const MARKETING_PORT = Number(process.env.DOCS_SCREENSHOTS_MARKETING_PORT ?? 3812);
const SYNC_PORT = Number(process.env.DOCS_SCREENSHOTS_SYNC_PORT ?? 4811);
const target = process.env.DOCS_SCREENSHOTS_TARGET ?? "all";

if (!["all", "app", "marketing", "gate"].includes(target)) {
  throw new Error(`DOCS_SCREENSHOTS_TARGET must be all, app, marketing or gate, got "${target}".`);
}
const gate = target === "gate";

const appURL = `http://localhost:${APP_PORT}`;
const marketingURL = `http://localhost:${MARKETING_PORT}`;
const syncURL = `ws://localhost:${SYNC_PORT}`;
const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
// Server-mode workspace for the sync picture: a copy of one checked-in fixture file, in the git-ignored `.qa/`.
const syncWorkspace = `${repoRoot}.qa/docs-screenshots-workspace`;
const prepareSyncWorkspace = `rm -rf '${syncWorkspace}' && mkdir -p '${syncWorkspace}' && cp '${repoRoot}test-vault/Konzepte/Graphentheorie.md' '${syncWorkspace}/'`;

const appServers = [
  {
    command: `${prepareSyncWorkspace} && bun run --cwd '${repoRoot}packages/sync' start`,
    url: `http://localhost:${SYNC_PORT}/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      BLOOMMD_DIR: syncWorkspace,
      SYNC_PORT: String(SYNC_PORT),
      SYNC_PERSIST_DEBOUNCE: "250",
      SYNC_DESTROY_DELAY: "1000",
    },
  },
  {
    command: `bun run --cwd '${repoRoot}apps/app' dev -- -p ${APP_PORT}`,
    url: `${appURL}/login`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      NEXT_PUBLIC_SITE_URL: appURL,
      NEXT_PUBLIC_APP_URL: appURL,
      NEXT_PUBLIC_MARKETING_URL: marketingURL,
      NEXT_PUBLIC_SYNC_URL: syncURL,
      BLOOMMD_REQUIRE_AUTH: "1",
      BLOOMMD_AUTH_SECRET: "docs-screenshots-only-secret-that-is-long-and-random",
      BLOOMMD_E2E_AUTH_BYPASS: "1",
      BLOOMMD_E2E_TEST_MODE: "1",
      BLOOMMD_LOCAL_DEPLOYMENT: "1",
      BLOOMMD_DIR: syncWorkspace,
      // Access switch on: only the listed address is invited. Shown on the signup pages for the invitation flow.
      ...(gate ? { BLOOMMD_BETA_ACCESS: "1", BLOOMMD_BETA_ALLOWED_EMAILS: "alex@example.com" } : {}),
    },
  },
];

const marketingServers = [
  {
    command: `bun run --cwd '${repoRoot}apps/marketing' dev -- -p ${MARKETING_PORT}`,
    url: `${marketingURL}/demo`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      NEXT_PUBLIC_SITE_URL: marketingURL,
      NEXT_PUBLIC_MARKETING_URL: marketingURL,
      NEXT_PUBLIC_APP_URL: appURL,
      // The public Wiki view is off by default; for the OKF picture it reads the checked-in `test-wiki/` bundle.
      BLOOMMD_WIKI_PUBLIC: "1",
      BLOOMMD_WIKI_DIR: `${repoRoot}test-wiki`,
    },
  },
];

export default defineConfig({
  testDir: "./docs-screenshots",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  outputDir: "./test-results-docs-screenshots",
  use: {
    ...devices["Desktop Chrome"],
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    colorScheme: "light",
    timezoneId: "UTC",
    reducedMotion: "reduce",
    trace: "off",
    screenshot: "off",
  },
  webServer: [
    ...(target === "marketing" ? [] : gate ? appServers.slice(1) : appServers),
    ...(target === "app" || gate ? [] : marketingServers),
  ],
  projects: gate
    ? [{ name: "docs-gate", testMatch: /gate\.capture\.ts/, use: { baseURL: appURL } }]
    : [
        { name: "docs-app", testMatch: /app\.capture\.ts/, use: { baseURL: appURL } },
        { name: "docs-marketing", testMatch: /marketing\.capture\.ts/, use: { baseURL: marketingURL } },
      ],
});
