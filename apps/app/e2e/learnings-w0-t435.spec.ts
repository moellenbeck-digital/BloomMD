/**
 * Ticket #435 — /wiki: Der Lebenszyklus `deprecated` hat Vorrang vor dem Vertrauens-Badge. Alle Fälle tragen @t435.
 *
 * Gleicher Aufbau wie @t433: Fixture-Vault frisch kopieren, echte Dateien unter `BLOOMMD_WIKI_DIR`, echte API, kein `page.route`.
 * `korrigiert.md` (status `ersetzt` → `deprecated`) hat einen `verified`-Eintrag und darf nur „deprecated“ zeigen;
 * `gueltig.md` (`bestätigt`) zeigt weiter „verified“. Frontmatter und `trustTier` bleiben unverändert (nur die Anzeige ändert sich).
 *
 * Nicht geprüft: der statische Export und die Marketing-Seite (Unit-Test `wiki-export-browser.test.ts` bzw. gleicher Code).
 */
import { expect, test, type Page } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { LEARNINGS_W0_VAULT, resetLearningsW0, WIKI_CLI } from "./learnings-w0-paths";

const GUELTIG_TITLE = "Bun-Version je Repo festhalten, das dev-team-Image braucht Bun 1.4 oder neuer";
const KORRIGIERT_TITLE = "Eine Bun-Version reicht für alle Repos";

async function openWiki(page: Page) {
  await page.goto("/wiki");
  await expect(page.getByTestId("wiki-search")).toBeVisible({ timeout: 60_000 });
}

async function openPage(page: Page, title: string) {
  await page.getByRole("button", { name: title }).first().click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
}

test.describe("@t435 deprecated hat Vorrang vor dem Vertrauens-Badge", () => {
  test.beforeAll(() => {
    test.setTimeout(300_000);
    resetLearningsW0();
  });

  test("@t435 korrigiert.md: „deprecated“ sichtbar, „verified“ nicht, in Artikel und Knowledge Map", async ({ page }) => {
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
    await openWiki(page);
    await openPage(page, GUELTIG_TITLE);
    const article = page.locator("article");
    await expect(article.getByText("verified", { exact: true })).toBeVisible();
    await expect(article.getByText("deprecated", { exact: true })).toHaveCount(0);

    await page.getByTestId("wiki-view-map").click();
    const node = page.getByTestId("wiki-knowledge-map").locator("li").filter({ has: page.getByRole("button", { name: GUELTIG_TITLE }) });
    await expect(node.getByText("verified", { exact: true })).toBeVisible();
  });

  test("@t435 Verlauf bleibt: `verified` im Frontmatter, `trustTier` in der API unverändert", async ({ request }) => {
    const api = await request.get("/api/wiki");
    expect(api.ok()).toBe(true);
    const body = (await api.json()) as { pages: Array<{ path: string; lifecycle: string; trustTier: string; verified: Array<{ by: string }> }> };
    const korrigiert = body.pages.find((entry) => entry.path === "korrigiert.md");
    expect(korrigiert).toMatchObject({ lifecycle: "deprecated", trustTier: "verified" });
    expect(korrigiert?.verified.length).toBeGreaterThan(0);

    const run = spawnSync("bun", [WIKI_CLI, "agent", "read", "Learnings/korrigiert.md", "--vault", LEARNINGS_W0_VAULT], { encoding: "utf8", env: process.env, timeout: 60_000 });
    if (run.error) throw run.error;
    expect(run.status, run.stdout + run.stderr).toBe(0);
    const read = JSON.parse(run.stdout) as { frontmatter: { status: string; verified?: Array<{ by: string; at: string }> } };
    expect(read.frontmatter.status).toBe("ersetzt");
    expect(read.frontmatter.verified).toEqual([{ by: "Brand-Chief bloommd", at: expect.anything() }]);
  });
});
