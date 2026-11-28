/**
 * Ticket #432 (Nacharbeit Testsystem) — /wiki blendet `bloommd:id`/`bloommd:meta`-Kommentare in der Artikelansicht aus. Alle Fälle tragen @t432.
 *
 * `learnings-w0-t432.spec.ts` prüft dasselbe mit echtem `bloommd-wiki agent decide` in einem lokalen Vault. Er braucht einen
 * Kindprozess und die App mit `BLOOMMD_WIKI_DIR`, deshalb schließt ihn `playwright.testsystem.config.ts` per `testIgnore` aus
 * und am Testsystem lief kein @t432-Fall („KEIN TEST“). Dieser Spec ersetzt `GET /api/wiki` per `page.route` durch eine feste
 * Antwort im Format von `src/app/api/wiki/route.ts` (Muster: `wiki-sources-t87.spec.ts`). Er läuft mit jeder Config, auch mit
 * `playwright.config.ts` (dort ist das Wiki abgeschaltet, der Mock übersteuert das) und gegen das Testsystem.
 *
 * Das Markdown der Mock-Seite ist die Ausgabe von `agent decide Learnings/neu.md --entscheid bestaetigt` (Knoten „Entscheidung“:
 * Überschrift mit `<!-- bloommd:id=… -->`, darunter Datum/Entscheid/Grund/Quelle/Wer als Liste), ergänzt um den `bloommd:meta`-Kommentar,
 * den BloomMD an Knoten mit Art/Status schreibt (Format wie `parser.test.ts`).
 *
 * Nicht geprüft:
 *  - Dass `agent decide` echt in eine Datei im Pod schreibt und `/api/wiki` diese Datei liefert. Das Testsystem hat kein Wiki-Bundle;
 *    der Spec belegt nur, wie die Oberfläche eine fertige Antwort darstellt. Das echte Schreiben deckt `learnings-w0-t432.spec.ts`
 *    lokal ab (eigener Vault, `playwright.learnings-w0.config.ts`), `agent-learnings.test.ts` den Kern.
 *  - Dass die Datei selbst unverändert bleibt: Die Seite liest nur die Mock-Antwort, es gibt keine Datei.
 */
import { expect, test, type Page } from "@playwright/test";

const ENTSCHEIDUNG_PAGE = "learnings/t432-entscheidung.md";
const OHNE_PAGE = "learnings/t432-ohne-kommentar.md";
const ENTSCHEIDUNG_TITLE = "T432 Learning nach agent decide";
const OHNE_TITLE = "T432 Learning ohne Kommentare";

const ID_COMMENT = "<!-- bloommd:id=ee4d0ce4b3ce -->";
const META_COMMENT = '<!-- bloommd:meta={"kind":"decision","decision":"accepted"} -->';
const META_ONLY_COMMENT = '<!-- bloommd:meta={"kind":"task","status":"open","assignee":"E2E t432"} -->';

// Wie nach `agent decide`: Überschrift mit id- und meta-Kommentar, Kommentar am Zeilenende eines Absatzes, Liste mit Entscheid/Wer.
const ENTSCHEIDUNG_MARKDOWN = [
  "# Bun-Version des Repos im Lockfile-Check der CI festhalten",
  "",
  "## Regel",
  "",
  "- Die Bun-Version des Repos in der CI festhalten, statt die Version des Images zu übernehmen.",
  "",
  `## Entscheidung ${ID_COMMENT} ${META_COMMENT}`,
  "",
  "- Datum: 2026-11-28",
  "- Entscheid: bestätigt",
  "- Grund: Gegen PR 306 im Repo BloomMD geprüft",
  "- Quelle: https://github.com/moellenbeck-digital/BloomMD/pull/306",
  "- Wer: E2E t432",
  "",
  `## Nacharbeit <!-- bloommd:id=a1b2c3d4e5f6 --> ${META_ONLY_COMMENT}`,
  "",
  "Offen: Beleg im Quartal prüfen.",
  "",
].join("\n");

const OHNE_MARKDOWN = ["# Ohne Kommentare", "", "## Beleg", "", "- PR 306 im Repo BloomMD.", ""].join("\n");

function wikiPage(path: string, title: string, content: string, status: string) {
  return {
    path,
    title,
    type: "learning",
    updated: "2026-11-28",
    content,
    sources: [],
    lifecycle: status,
    trustTier: "verified",
    generated: null,
    verified: [{ by: "E2E t432", at: "2026-11-28T09:00:00.000Z" }],
    staleAfter: null,
    expired: false,
    resources: [],
    previews: [],
    citations: [],
    citationSummary: { total: 0, drifted: 0, unknown: 0, withoutHash: 0, changed: 0, missing: 0 },
    tags: ["t432"],
    issues: [],
  };
}

// Form wie `GET /api/wiki` (route.ts); dieselben Felder wie der Mock in wiki-sources-t87.spec.ts.
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
    statusCounts: { stable: 2 },
    trustCounts: { verified: 2 },
    issueCount: 0,
  },
  index: "# Wiki\n",
  log: "## 2026-11-28\n- Entscheidung bestätigt\n",
  graph: {
    nodes: [
      { id: ENTSCHEIDUNG_PAGE, path: ENTSCHEIDUNG_PAGE, title: ENTSCHEIDUNG_TITLE, kind: "concept", status: "stable", trustTier: "verified", citationCount: 0, missingProvenance: false },
      { id: OHNE_PAGE, path: OHNE_PAGE, title: OHNE_TITLE, kind: "concept", status: "stable", trustTier: "verified", citationCount: 0, missingProvenance: false },
    ],
    edges: [],
  },
  graphHealth: { brokenLinks: 0, pagesWithoutProvenance: 0, concepts: 2 },
  pages: [wikiPage(ENTSCHEIDUNG_PAGE, ENTSCHEIDUNG_TITLE, ENTSCHEIDUNG_MARKDOWN, "stable"), wikiPage(OHNE_PAGE, OHNE_TITLE, OHNE_MARKDOWN, "stable")],
};

interface Recorded {
  method: string;
  pathname: string;
}

/** Ersetzt `/api/wiki` durch die feste Antwort; `/api/wiki/**` darunter bleibt echt und wird nur aufgezeichnet. */
async function openWiki(page: Page) {
  const recorded: Recorded[] = [];
  page.on("request", (request) => {
    const { pathname } = new URL(request.url());
    if (/^\/api\/wiki(\/|$)/.test(pathname)) recorded.push({ method: request.method(), pathname });
  });
  await page.addInitScript(() => {
    window.localStorage.setItem("bloommd_onboarding_seen", "1");
    window.localStorage.setItem("bloommd-theme", "light");
    window.localStorage.setItem("bloommd-locale", "de");
  });
  await page.route("**/api/wiki", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(WIKI_RESPONSE) }));
  await page.goto("/wiki", { waitUntil: "domcontentloaded" });
  // Erster Aufruf im Dev-Server kompiliert die Route: länger warten als die 10 s der Config.
  await expect(page.getByTestId("wiki-search")).toBeVisible({ timeout: 90_000 });
  return { recorded };
}

const pageButton = (page: Page, title: string) => page.getByRole("navigation").getByRole("button", { name: title });

test.describe("Wiki: bloommd-Kommentare nach agent decide ohne echtes Bundle", () => {
  test("@t432 Artikel nach agent decide zeigt Entscheidung, Entscheid und Wer, aber keine bloommd:-Kommentare", async ({ page }) => {
    // Der erste Aufruf von `/wiki` kompiliert die Route im Dev-Server; das sprengt die 30 s der Config. Gewartet wird auf das UI-Signal in `openWiki`.
    test.setTimeout(120_000);
    // Vorbedingung: Die Mock-Antwort trägt die Kommentare im Rohtext (sonst prüft der Test nichts).
    expect(ENTSCHEIDUNG_MARKDOWN).toMatch(/^## Entscheidung .*<!--\s*bloommd:id=/m);
    expect(ENTSCHEIDUNG_MARKDOWN).toContain("bloommd:meta=");

    await openWiki(page);
    await pageButton(page, ENTSCHEIDUNG_TITLE).click();
    await expect(page.getByRole("heading", { name: ENTSCHEIDUNG_TITLE })).toBeVisible();

    const article = page.locator("article");
    await expect(article).toContainText("## Entscheidung");
    await expect(article).toContainText("Entscheid: bestätigt");
    await expect(article).toContainText("Wer: E2E t432");
    await expect(article).toContainText("## Nacharbeit");
    await expect(article).toContainText("Offen: Beleg im Quartal prüfen.");

    const text = (await article.textContent()) ?? "";
    expect(text).not.toContain("bloommd:");
    expect(text).not.toContain("bloommd:id");
    expect(text).not.toContain("bloommd:meta");
    expect(text).not.toContain("<!--");
    expect(text).not.toContain("-->");
  });

  test("@t432 Überschrift bleibt sauber: kein Leerzeichen am Zeilenende, Zeilen und Leerzeilen des Textes bleiben", async ({ page }) => {
    await openWiki(page);
    await pageButton(page, ENTSCHEIDUNG_TITLE).click();
    await expect(page.getByRole("heading", { name: ENTSCHEIDUNG_TITLE })).toBeVisible();

    const rendered = await page.locator("article").innerText();
    expect(rendered).toMatch(/^## Entscheidung$/m);
    expect(rendered).toMatch(/^## Nacharbeit$/m);
    expect(rendered).toMatch(/^- Entscheid: bestätigt$/m);
    expect(rendered).toMatch(/^- Wer: E2E t432$/m);
  });

  test("@t432 Seite ohne bloommd:-Kommentare wird unverändert angezeigt", async ({ page }) => {
    await openWiki(page);
    await pageButton(page, OHNE_TITLE).click();
    await expect(page.getByRole("heading", { name: OHNE_TITLE })).toBeVisible();

    const article = page.locator("article");
    await expect(article).toContainText("## Beleg");
    await expect(article).toContainText("- PR 306 im Repo BloomMD.");
    expect(await article.textContent()).not.toContain("<!--");
  });

  test("@t432 nur die Anzeige ändert sich: die API-Antwort trägt die Kommentare weiter, die Seite schreibt nichts", async ({ page }) => {
    const { recorded } = await openWiki(page);
    await pageButton(page, ENTSCHEIDUNG_TITLE).click();
    await expect(page.locator("article")).toContainText("Entscheid: bestätigt");

    // Der Rohtext in der Antwort behält die Kommentare; sichtbar sind sie im Artikel nicht.
    const response = await page.evaluate(async () => (await fetch("/api/wiki")).json() as Promise<{ pages: Array<{ path: string; content: string }> }>);
    expect(response.pages.find((entry) => entry.path === ENTSCHEIDUNG_PAGE)?.content).toMatch(/<!--\s*bloommd:(?:id|meta)=/);
    expect(await page.locator("article").textContent()).not.toContain("<!--");

    expect(recorded.filter((entry) => !["GET", "HEAD"].includes(entry.method))).toEqual([]);
  });
});
