/**
 * Ticket #435 (Testsystem) — /wiki: `deprecated` hat Vorrang vor dem Vertrauens-Badge. Alle Fälle tragen @t435.
 *
 * `learnings-w0-t435.spec.ts` prüft dasselbe gegen einen lokalen Vault mit eigenem Server (`BLOOMMD_WIKI_DIR`). Das Testsystem hat
 * kein Wiki-Bundle (`/api/wiki` liefert 0 Seiten), der Spec scheitert dort schon beim Öffnen der Seite; deshalb schließt ihn
 * `playwright.testsystem.config.ts` per `testIgnore` aus. Dieser Spec ersetzt `GET /api/wiki` per `page.route` durch eine feste
 * Antwort im Format von `src/app/api/wiki/route.ts` (Muster: `wiki-comments-t432.spec.ts`) und prüft die Darstellung des
 * ausgerollten Builds. Er läuft mit jeder Config.
 *
 * Die Mock-Seite `korrigiert.md` entspricht dem Fixture: Status `ersetzt` → Lebenszyklus `deprecated`, Vertrauensstufe `verified`,
 * ein `verified`-Eintrag. `gueltig.md` ist `bestätigt` (`stable`, `verified`).
 *
 * Nicht geprüft:
 *  - Frontmatter der Datei und `trustTier` aus echter Berechnung: Es gibt am Testsystem keine Datei; die API-Antwort trägt
 *    `verified`/`trustTier` nur, weil der Mock sie liefert. Das deckt lokal `learnings-w0-t435.spec.ts` ab.
 *  - Statischer Export und Marketing-Seite (Unit-Test `wiki-export-browser.test.ts`).
 */
import { expect, test, type Page } from "@playwright/test";

const GUELTIG_PAGE = "learnings/gueltig.md";
const KORRIGIERT_PAGE = "learnings/korrigiert.md";
const GUELTIG_TITLE = "T435 Bun-Version je Repo festhalten";
const KORRIGIERT_TITLE = "T435 Eine Bun-Version reicht für alle Repos";

function wikiPage(path: string, title: string, lifecycle: string) {
  return {
    path,
    title,
    type: "learning",
    updated: "2026-11-28",
    content: `# ${title}\n\n## Regel\n\n- Beleg: PR 306 im Repo BloomMD.\n`,
    sources: [],
    lifecycle,
    trustTier: "verified",
    generated: null,
    verified: [{ by: "E2E t435", at: "2026-11-28T09:00:00.000Z" }],
    staleAfter: null,
    expired: false,
    resources: [],
    previews: [],
    citations: [],
    citationSummary: { total: 0, drifted: 0, unknown: 0, withoutHash: 0, changed: 0, missing: 0 },
    tags: ["t435"],
    issues: [],
  };
}

// Form wie `GET /api/wiki` (route.ts); dieselben Felder wie der Mock in wiki-comments-t432.spec.ts.
const WIKI_RESPONSE = {
  enabled: true,
  sourceVerification: "verified",
  sourceMode: "live",
  status: {
    okfVersion: "0.2",
    pageCount: 2,
    sourceCount: 0,
    staleSourceCount: 0,
    missingSourceFileCount: 0,
    unmonitoredSourceCount: 0,
    pendingPageCount: 0,
    expiredPageCount: 0,
    statusCounts: { stable: 1, deprecated: 1 },
    trustCounts: { verified: 2 },
    issueCount: 0,
  },
  index: "# Wiki\n",
  log: "## 2026-11-28\n- Learning ersetzt\n",
  graph: {
    nodes: [
      { id: GUELTIG_PAGE, path: GUELTIG_PAGE, title: GUELTIG_TITLE, kind: "concept", status: "stable", trustTier: "verified", citationCount: 0, missingProvenance: false },
      { id: KORRIGIERT_PAGE, path: KORRIGIERT_PAGE, title: KORRIGIERT_TITLE, kind: "concept", status: "deprecated", trustTier: "verified", citationCount: 0, missingProvenance: false },
    ],
    edges: [],
  },
  graphHealth: { brokenLinks: 0, pagesWithoutProvenance: 0, concepts: 2 },
  pages: [wikiPage(GUELTIG_PAGE, GUELTIG_TITLE, "stable"), wikiPage(KORRIGIERT_PAGE, KORRIGIERT_TITLE, "deprecated")],
};

async function openWiki(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("bloommd_onboarding_seen", "1");
    window.localStorage.setItem("bloommd-theme", "light");
    window.localStorage.setItem("bloommd-locale", "de");
  });
  await page.route("**/api/wiki", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(WIKI_RESPONSE) }));
  await page.goto("/wiki", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("wiki-search")).toBeVisible({ timeout: 90_000 });
}

async function openPage(page: Page, title: string) {
  await page.getByRole("navigation").getByRole("button", { name: title }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
}

test.describe("Wiki: deprecated hat Vorrang vor dem Vertrauens-Badge (Mock-API)", () => {
  test("@t435 korrigiert.md: „deprecated“ sichtbar, „verified“ nicht, in Artikel und Knowledge Map", async ({ page }) => {
    test.setTimeout(120_000);
    // Vorbedingung: Die Mock-Seite trägt beide Merkmale (sonst prüft der Test nichts).
    expect(WIKI_RESPONSE.pages[1]).toMatchObject({ lifecycle: "deprecated", trustTier: "verified" });

    await openWiki(page);
    await openPage(page, KORRIGIERT_TITLE);
    const article = page.locator("article");
    await expect(article.getByText("deprecated", { exact: true })).toBeVisible();
    await expect(article.getByText("verified", { exact: true })).toHaveCount(0);
    await expect(article.getByText("generated", { exact: true })).toHaveCount(0);
    await expect(article.getByText("unattributed", { exact: true })).toHaveCount(0);

    await page.getByTestId("wiki-view-map").click();
    const node = page.getByTestId("wiki-knowledge-map").locator("li").filter({ has: page.getByRole("button", { name: KORRIGIERT_TITLE }) });
    await expect(node).toHaveCount(1);
    await expect(node.getByText("verified", { exact: true })).toHaveCount(0);
  });

  test("@t435 Regression: bestätigtes Learning zeigt weiter „verified“ und kein „deprecated“", async ({ page }) => {
    test.setTimeout(120_000);
    await openWiki(page);
    await openPage(page, GUELTIG_TITLE);
    const article = page.locator("article");
    await expect(article.getByText("verified", { exact: true })).toBeVisible();
    await expect(article.getByText("deprecated", { exact: true })).toHaveCount(0);

    await page.getByTestId("wiki-view-map").click();
    const node = page.getByTestId("wiki-knowledge-map").locator("li").filter({ has: page.getByRole("button", { name: GUELTIG_TITLE }) });
    await expect(node.getByText("verified", { exact: true })).toBeVisible();
  });
});
