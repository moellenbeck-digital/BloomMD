import { defineConfig, devices } from "@playwright/test";
import { LEARNINGS_W0_WIKI_DIR } from "./e2e/learnings-w0-paths";
import { nextDevCommand } from "./playwright-server";

/**
 * Ticket #345 — E2E „Learnings W0“ (@t345) mit eigenem Server, nach dem Muster von `playwright.wiki.config.ts`.
 *
 * `BLOOMMD_WIKI_DIR` zeigt auf ein Temp-Verzeichnis, das die Spec vor dem Lauf frisch aus
 * `e2e/fixtures/learnings-w0/` kopiert (Reset). `/api/wiki` ist die echte API auf echten Dateien, ohne `page.route`.
 * Eigener Port, damit der Lauf nicht an den Wiki-Server von `test:e2e:wiki` (3311) gerät; zwei `next dev` im selben
 * Projekt gleichzeitig verweigert Next.js, die beiden Läufe also nacheinander starten.
 *
 * Enthält auch @t432 (BloomMD-Kommentare in der Artikelansicht, `learnings-w0-t432.spec.ts`), @t433 (Zitate aus `source`, `learnings-w0-t433.spec.ts`) und @t434 (`replaced_by` in der Suche, `learnings-w0-t434.spec.ts`); die Specs laufen nacheinander (workers 1).
 *
 * Lauf: `bun run --cwd apps/app test:e2e:learnings-w0`
 */
const PORT = Number(process.env.PLAYWRIGHT_LEARNINGS_W0_PORT ?? 3312);
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  testMatch: /learnings-w0-t(?:345|432|433|434)\.spec\.ts/,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: nextDevCommand(PORT),
    // /wiki statt /api/wiki: der Start kompiliert die Seite vor, der erste Aufruf im Test bleibt schnell.
    url: `${baseURL}/wiki`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_SITE_URL: baseURL,
      BLOOMMD_REQUIRE_AUTH: "1",
      BLOOMMD_E2E_AUTH_BYPASS: "1",
      BLOOMMD_WIKI_PUBLIC: "1",
      BLOOMMD_WIKI_DIR: LEARNINGS_W0_WIKI_DIR,
    },
  },
  projects: [{ name: "chromium-learnings-w0", use: { ...devices["Desktop Chrome"] } }],
});
