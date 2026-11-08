/**
 * Ticket #87 — Quellenstatus im Wiki (laufende Überwachung des Quellordners). Alle Fälle tragen @t87.
 *
 * Kriterien K1–K3 und K5 stehen je im Testtitel:
 *  K1  Seitenliste: „Quelle verändert“ und „Quelle fehlt“ nur an der betroffenen Seite, nicht an der unauffälligen.
 *  K2  Geöffnete Seite: Badges „Quelle hat sich geändert“ (gelb), „Quelle fehlt“ (rot), „nicht überwacht“; `ok` ohne Badge.
 *  K3  Filter „Nur Seiten mit Problemen“ zeigt die Seite mit nur fehlender Quelle und blendet die unauffällige aus.
 *  K5  Keine schreibenden Aufrufe auf `/api/wiki/**` (Kriterium „keine Agent-Schreibzugriffe außerhalb von
 *      Vorschlag/Freigabe/Anwenden“); die Seite liest ausschließlich die Mock-Antwort.
 *
 * Das Dev-System hat weder ein Wiki-Bundle noch einen Quellordner (`BLOOMMD_WIKI_DIR=/tmp/wiki` liegt im App-Pod,
 * `BLOOMMD_WIKI_SOURCES_DIR` ist nicht gesetzt), und `wiki.spec.ts` ist in den Configs per `testIgnore`
 * ausgeschlossen. Die Seite `/wiki` ist client-seitig: Der Test ersetzt `GET /api/wiki` per `page.route` durch eine
 * feste Antwort im Format von `src/app/api/wiki/route.ts` (Muster: `website-preview-t91.spec.ts`). So prüft er die
 * echte Oberfläche deterministisch, auch gegen `playwright.config.ts`, wo das Wiki abgeschaltet ist: Die Mock-Antwort
 * übersteuert das. `/api/wiki/proposals` bleibt echt und wird nur mitgezählt.
 *
 * Nicht geprüft:
 *  - Das echte Erkennen einer geänderten oder gelöschten Quelldatei im Pod. Dieser Spec belegt nur, wie die Oberfläche
 *    eine fertige Antwort darstellt. Das Erkennen decken `route.test.ts` (API), `wiki-sources.test.ts` (Kern) und
 *    `watch.test.ts` (CLI) ab, nicht dieser Spec. Am Dev-System ist es offen und nicht nachgewiesen.
 *  - K4 (Englische Texte „Source has changed“, „Source is missing“, „not watched“): Englische Texte auf /wiki nicht prüfbar,
 *    weil /wiki keinen LocaleProvider hat. `useLocale()` liefert dort immer „de“, auch mit `?lang=en` oder `bloommd-locale=en`
 *    im localStorage (beides probiert). Ohne Produktivcode gibt es keinen Weg; das Kriterium ist hier offen.
 */
import { expect, test, type Locator, type Page } from "@playwright/test";

const HASH = (letter: string) => `sha256:${letter.repeat(64)}`;

function citation(id: string, resource: string, title: string, flags: { drifted?: boolean; sourceState: string }) {
  return {
    id,
    resource,
    title,
    author: null,
    retrievedAt: "2026-11-01T09:00:00.000Z",
    contentHash: HASH(id.slice(-1)),
    drifted: flags.drifted ?? false,
    unknown: false,
    sourceState: flags.sourceState,
  };
}

function summary(total: number, drifted: number, changed: number, missing: number) {
  return { total, drifted, unknown: 0, withoutHash: 0, changed, missing };
}

function wikiPage(path: string, title: string, citations: ReturnType<typeof citation>[], issues: string[], counts: ReturnType<typeof summary>) {
  return {
    path,
    title,
    type: "concept",
    updated: "2026-11-01",
    content: `Inhalt der Seite ${title}.`,
    sources: citations.map(({ id, resource, contentHash }) => ({ id, resource, contentHash })),
    lifecycle: "stable",
    trustTier: "verified",
    generated: null,
    verified: [{ by: "e2e", at: "2026-11-01T09:00:00.000Z" }],
    staleAfter: null,
    expired: false,
    resources: [],
    previews: [],
    citations,
    citationSummary: counts,
    tags: ["t87"],
    issues,
  };
}

const MIXED = "concepts/t87-gemischt.md";
const CLEAN = "concepts/t87-unauffaellig.md";
const ONLY_MISSING = "concepts/t87-nur-fehlend.md";
const TITLE = { mixed: "T87 Gemischte Quellen", clean: "T87 Unauffällig", onlyMissing: "T87 Nur fehlende Quelle" };

// Form wie `GET /api/wiki` mit `BLOOMMD_WIKI_SOURCES_DIR` (route.test.ts: „shows changed and missing sources per page“).
const WIKI_RESPONSE = {
  enabled: true,
  sourceVerification: "verified",
  sourceMode: "live",
  status: {
    okfVersion: "0.2",
    pageCount: 3,
    sourceCount: 6,
    staleSourceCount: 1,
    missingSourceFileCount: 2,
    unmonitoredSourceCount: 1,
    pendingPageCount: 0,
    expiredPageCount: 0,
    statusCounts: { stable: 3 },
    trustCounts: { verified: 3 },
    issueCount: 3,
  },
  index: "# Wiki\n",
  log: "## 2026-11-01\n- Quellen geprüft\n",
  graph: {
    nodes: [
      { id: MIXED, path: MIXED, title: TITLE.mixed, kind: "concept", status: "stable", trustTier: "verified", citationCount: 4, missingProvenance: false },
      { id: CLEAN, path: CLEAN, title: TITLE.clean, kind: "concept", status: "stable", trustTier: "verified", citationCount: 1, missingProvenance: false },
      { id: ONLY_MISSING, path: ONLY_MISSING, title: TITLE.onlyMissing, kind: "concept", status: "stable", trustTier: "verified", citationCount: 1, missingProvenance: false },
    ],
    edges: [],
  },
  graphHealth: { brokenLinks: 0, pagesWithoutProvenance: 0, concepts: 3 },
  pages: [
    wikiPage(
      MIXED,
      TITLE.mixed,
      [
        citation("id:a", "same.md", "Quelle unverändert", { sourceState: "ok" }),
        citation("id:b", "edited.md", "Quelle bearbeitet", { drifted: true, sourceState: "changed" }),
        citation("id:c", "gone.md", "Quelle gelöscht", { sourceState: "missing" }),
        citation("id:d", "https://example.com/x", "Quelle im Web", { sourceState: "unmonitored" }),
      ],
      ["stale-source", "missing-source"],
      summary(4, 1, 1, 1),
    ),
    wikiPage(CLEAN, TITLE.clean, [citation("id:e", "same.md", "Quelle unverändert", { sourceState: "ok" })], [], summary(1, 0, 0, 0)),
    wikiPage(ONLY_MISSING, TITLE.onlyMissing, [citation("id:f", "weg.md", "Quelle entfernt", { sourceState: "missing" })], ["missing-source"], summary(1, 0, 0, 1)),
  ],
};

const COPY = {
  de: { changedList: "Quelle verändert", missingList: "Quelle fehlt", changedBadge: "Quelle hat sich geändert", missingBadge: "Quelle fehlt", unmonitored: "nicht überwacht", problems: "Nur Seiten mit Problemen" },
} as const;

interface Recorded {
  method: string;
  pathname: string;
}

/** Ersetzt `/api/wiki`, lässt `/api/wiki/proposals` echt und zeichnet alle Requests auf `/api/wiki/**` auf. */
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
  await page.route("**/api/wiki", (route) => {
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(WIKI_RESPONSE) });
  });
  await page.goto("/wiki", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("wiki-search")).toBeVisible();
  return { recorded };
}

const pageButton = (page: Page, title: string) => page.getByRole("navigation").getByRole("button", { name: title });
const citationItem = (page: Page, resource: string) => page.getByTestId("wiki-citations").getByRole("listitem").filter({ hasText: resource });

/** Farbton (0–360°) der Randfarbe, über ein Canvas in sRGB gewandelt, damit oklch/lab der Config keine Rolle spielt. */
async function borderHue(locator: Locator): Promise<number> {
  return locator.evaluate((element) => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const context = canvas.getContext("2d")!;
    context.fillStyle = getComputedStyle(element).borderTopColor;
    context.fillRect(0, 0, 1, 1);
    const [r, g, b] = Array.from(context.getImageData(0, 0, 1, 1).data).map((value) => value / 255) as [number, number, number];
    const max = Math.max(r, g, b);
    const delta = max - Math.min(r, g, b);
    if (delta === 0) return -1;
    const hue = max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
    return (hue * 60 + 360) % 360;
  });
}

test.describe("Wiki: Quellenstatus ohne echtes Bundle", () => {
  test("K1: Seitenliste nennt veränderte und fehlende Quelle nur an der betroffenen Seite @t87", async ({ page }) => {
    // Der erste Aufruf von `/wiki` kompiliert die Route im Dev-Server; das sprengt die 30 s der Config. Gewartet wird auf das UI-Signal in `openWiki`.
    test.setTimeout(120_000);
    await openWiki(page);
    const mixed = pageButton(page, TITLE.mixed);
    const clean = pageButton(page, TITLE.clean);
    const onlyMissing = pageButton(page, TITLE.onlyMissing);

    await expect(mixed).toContainText(COPY.de.changedList);
    await expect(mixed).toContainText(COPY.de.missingList);
    await expect(onlyMissing).toContainText(COPY.de.missingList);
    await expect(onlyMissing).not.toContainText(COPY.de.changedList);
    await expect(clean).toBeVisible();
    await expect(clean).not.toContainText(COPY.de.changedList);
    await expect(clean).not.toContainText(COPY.de.missingList);
  });

  test("K2: geöffnete Seite zeigt gelbes „geändert“, rotes „fehlt“ und „nicht überwacht“, die intakte Quelle kein Badge @t87", async ({ page }) => {
    await openWiki(page);
    await pageButton(page, TITLE.mixed).click();
    await expect(page.getByRole("heading", { name: TITLE.mixed })).toBeVisible();

    const changed = citationItem(page, "edited.md").getByText(COPY.de.changedBadge, { exact: true });
    const missing = citationItem(page, "gone.md").getByText(COPY.de.missingBadge, { exact: true });
    const unmonitored = citationItem(page, "https://example.com/x").getByText(COPY.de.unmonitored, { exact: true });
    await expect(changed).toBeVisible();
    await expect(missing).toBeVisible();
    await expect(unmonitored).toBeVisible();

    // Gelb (Bernstein, ~45°) für „geändert“, Rot (~0°) für „fehlt“.
    expect(await borderHue(changed)).toBeGreaterThan(30);
    expect(await borderHue(changed)).toBeLessThan(60);
    const missingHue = await borderHue(missing);
    expect(missingHue === 0 || missingHue < 15 || missingHue > 345).toBe(true);

    const intact = citationItem(page, "same.md");
    await expect(intact).toBeVisible();
    for (const text of [COPY.de.changedBadge, COPY.de.missingBadge, COPY.de.unmonitored]) {
      await expect(intact).not.toContainText(text);
    }
    // Pro Zustand genau ein Badge: nichts bleibt an der falschen Quelle hängen.
    await expect(page.getByTestId("wiki-citations").getByText(COPY.de.changedBadge, { exact: true })).toHaveCount(1);
    await expect(page.getByTestId("wiki-citations").getByText(COPY.de.missingBadge, { exact: true })).toHaveCount(1);
    await expect(page.getByTestId("wiki-citations").getByText(COPY.de.unmonitored, { exact: true })).toHaveCount(1);
  });

  test("K3: Filter „Nur Seiten mit Problemen“ zeigt die Seite mit fehlender Quelle und blendet die unauffällige aus @t87", async ({ page }) => {
    await openWiki(page);
    await expect(pageButton(page, TITLE.clean)).toBeVisible();

    await page.getByTestId("wiki-only-problems").check();

    await expect(pageButton(page, TITLE.onlyMissing)).toBeVisible();
    await expect(pageButton(page, TITLE.mixed)).toBeVisible();
    await expect(pageButton(page, TITLE.clean)).toHaveCount(0);

    await page.getByTestId("wiki-only-problems").uncheck();
    await expect(pageButton(page, TITLE.clean)).toBeVisible();
  });

  test("K5: die Seite liest nur, es gibt keinen schreibenden Aufruf auf /api/wiki/** @t87", async ({ page }) => {
    const { recorded } = await openWiki(page);
    await pageButton(page, TITLE.mixed).click();
    await page.getByTestId("wiki-only-problems").check();
    await pageButton(page, TITLE.onlyMissing).click();
    await expect(page.getByRole("heading", { name: TITLE.onlyMissing })).toBeVisible();
    await page.getByTestId("wiki-view-map").click();
    await expect(page.getByTestId("wiki-knowledge-map")).toBeVisible();
    await page.getByTestId("wiki-view-pages").click();
    await expect(page.getByTestId("wiki-citations")).toBeVisible();

    // Die Seite liest nur: Auf `/api/wiki/**` (Antwort aus dem Mock, `proposals` echt) gibt es keinen schreibenden Aufruf.
    expect(recorded.filter((entry) => entry.pathname.startsWith("/api/wiki/proposals") && entry.method !== "GET")).toEqual([]);
    expect(recorded.filter((entry) => !["GET", "HEAD"].includes(entry.method))).toEqual([]);
  });
});
