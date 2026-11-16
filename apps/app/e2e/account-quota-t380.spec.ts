/**
 * Ticket #380 — Konto-Quote 100 MB und Kostenobergrenze (aus #276).
 *
 * An der Oberfläche prüfbar (Testmarke @t380), im Standard-Stack und im Testsystem (Schalter aus, ohne Datenbank):
 * - K1: Ohne `BLOOMMD_ACCOUNT_QUOTA=1` (Standard) speichert ein Konto wie bisher (POST und PUT auf `/api/mindmaps`
 *   liefern kein 413 `QUOTA_EXCEEDED`), und `/account` zeigt keinen Speicher-Block (es erscheint keine Grenze, die nichts bewirkt).
 *
 * - K2 (Teil): Der Release enthält die Route `GET /api/account/quota` (401 ohne Konto-ID statt 404); der Block selbst siehe unten.
 *
 * Nicht prüfbar an der Oberfläche dieses Stacks (abgedeckt durch Bun-Tests, siehe Ticket-Meldung):
 * - K2/K3: Der Block `data-testid="account-storage"` („X MB von 100 MB“, Balken, Warnung ab 80 %) erscheint nur mit
 *   `BLOOMMD_ACCOUNT_QUOTA=1` und einer Datenbank (`getAccountStorageUsage`); der Stack hat keine. Abgedeckt durch
 *   `src/lib/account-quota.test.ts` (`storageUsageView`) und `tests/integration/account-quota-db.integration.test.ts` (Postgres).
 * - K4: 413 `QUOTA_EXCEEDED` bei wachsendem Speichern über 100 MB braucht Schalter, Postgres und den Sync-Server mit gleichem
 *   Schalter. Abgedeckt durch `packages/sync/src/{persistence,server}.test.ts`, `src/lib/account-quota.test.ts` und die Integrationstests.
 * - K5: Close-Code 4013 und Status „Speicherplatz erreicht – Änderung nicht gespeichert“ im Live-Sync: dieselbe Voraussetzung;
 *   abgedeckt durch `packages/sync/src/rooms.test.ts` und `packages/ui/src/sync/SyncProvider.test.ts`.
 * - K6/K7: Lesen, Export, Löschen, Verkleinern bei erreichter bzw. überschrittener Quote: Konto mit Bestand über 100 MB nur per
 *   Datenbank-Fixture; abgedeckt durch die Integrationstests (Postgres).
 * - K8: `bun run --cwd apps/app db:quota-report` braucht `DATABASE_URL` (Exit 2 ohne); kein Browser-Fall.
 *
 * Die Fälle legen Testdaten an (Notizen `e2e-quota-t380-*`) und entfernen sie wieder.
 */
import { expect, test, type APIRequestContext } from "@playwright/test";

const SAME_ORIGIN_HEADERS = { origin: (process.env.PLAYWRIGHT_BASE_URL?.trim() || `http://localhost:${process.env.PLAYWRIGHT_PORT ?? "3211"}`).replace(/\/$/, "") };

const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const note = (title: string, body: string) =>
  ["---", `title: ${title}`, "---", "", `# ${title}`, "", body, ""].join("\n");

// Das Testsystem läuft mit BLOOMMD_REQUIRE_AUTH=1 (siehe e2e/README.md): ohne Sitzung liefern /api/mindmaps 401 und /account
// einen Redirect. Anmeldung über den E2E-Bypass (BLOOMMD_E2E_AUTH_BYPASS=1, Konto nur als Sitzung, ohne Datenbankeintrag).
// Der Kontext von `page` teilt das Cookie mit `page.request`.
async function login(request: APIRequestContext) {
  const response = await request.post("/api/auth/login", {
    headers: SAME_ORIGIN_HEADERS,
    form: { email: `e2e-quota-t380-${runId}@example.com`, password: "E2E-Quota-t380-Passwort!", next: "/app" },
    maxRedirects: 0,
  });
  expect(response.status(), "Anmeldung über den E2E-Bypass").toBe(303);
}

test.describe("Konto-Quote (#380), Schalter aus", () => {
    test("K1: Speichern ohne Schalter ist nie 413 QUOTA_EXCEEDED @t380", async ({ page }) => {
    const request = page.request;
    await login(request);
    const filename = `e2e-quota-t380-${runId}.md`;
    try {
      const created = await request.post("/api/mindmaps", {
        headers: SAME_ORIGIN_HEADERS,
        data: { filename, markdown: note("Quote E2E", "Erster Stand.") },
      });
      expect(created.status(), "POST /api/mindmaps ohne Schalter").not.toBe(413);
      expect(await created.text(), "POST /api/mindmaps ohne Schalter").not.toContain("QUOTA_EXCEEDED");
      // Das Testsystem läuft im Dateimodus und lehnt Schreiben auf /api/mindmaps seit jeher mit 500 ab (unabhängig von #380,
      // siehe #52/#79); dann gibt es nichts zu vergrößern. Dass ein Konto wie bisher speichert, belegen die Bun-Tests.
      test.info().annotations.push({ type: "dateimodus", description: `POST /api/mindmaps -> ${created.status()}` });
      if (!created.ok()) return;

      // Wachsendes Speichern (größer als der alte Stand) ist ohne Schalter nie eine Quote-Sache.
      const grown = await request.put(`/api/mindmaps/${encodeURIComponent(filename)}`, {
        headers: SAME_ORIGIN_HEADERS,
        data: { markdown: note("Quote E2E", `Zweiter Stand. ${"Mehr Text. ".repeat(2_000)}`) },
      });
      expect(grown.status(), "PUT /api/mindmaps/<name> wachsend ohne Schalter").not.toBe(413);
      expect(grown.ok(), "PUT /api/mindmaps/<name> wachsend ohne Schalter").toBe(true);
      expect(await grown.text()).not.toContain("QUOTA_EXCEEDED");
    } finally {
      await request.delete(`/api/mindmaps/${encodeURIComponent(filename)}`, { headers: SAME_ORIGIN_HEADERS });
    }
  });

  test("K2: Release enthält GET /api/account/quota (401 ohne Konto, nicht 404) @t380", async ({ request }) => {
    const response = await request.get("/api/account/quota");
    expect(response.status(), "GET /api/account/quota ohne Sitzung").toBe(401);
  });

  test("K1: /account zeigt keinen Speicher-Block und lädt fehlerfrei @t380", async ({ page }) => {
    await login(page.request);
    const response = await page.goto("/account");
    expect(response?.status(), "/account").toBe(200);
    await expect(page.getByTestId("account-build-version")).toBeVisible();
    await expect(page.getByTestId("account-storage")).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText("Speicherplatz erreicht");
    await expect(page.locator("body")).not.toContainText("von 100 MB");
  });
});
