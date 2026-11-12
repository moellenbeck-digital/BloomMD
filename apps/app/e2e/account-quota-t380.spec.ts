/**
 * Ticket #380 — Konto-Quote 100 MB und Kostenobergrenze (aus #276).
 *
 * An der Oberfläche prüfbar (Testmarke @t380), im Standard-Stack und im Testsystem (Schalter aus, ohne Datenbank):
 * - K1: Ohne `BLOOMMD_ACCOUNT_QUOTA=1` (Standard) speichert ein Konto wie bisher (POST und PUT auf `/api/mindmaps`
 *   liefern kein 413 `QUOTA_EXCEEDED`), und `/account` zeigt keinen Speicher-Block (es erscheint keine Grenze, die nichts bewirkt).
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
import { expect, test } from "@playwright/test";

const SAME_ORIGIN_HEADERS = { origin: (process.env.PLAYWRIGHT_BASE_URL?.trim() || `http://localhost:${process.env.PLAYWRIGHT_PORT ?? "3211"}`).replace(/\/$/, "") };

const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const note = (title: string, body: string) =>
  ["---", `title: ${title}`, "---", "", `# ${title}`, "", body, ""].join("\n");

test.describe("Konto-Quote (#380), Schalter aus", () => {
  test("K1: Speichern klappt wie bisher, kein 413 QUOTA_EXCEEDED @t380", async ({ request }) => {
    const filename = `e2e-quota-t380-${runId}.md`;
    try {
      const created = await request.post("/api/mindmaps", {
        headers: SAME_ORIGIN_HEADERS,
        data: { filename, markdown: note("Quote E2E", "Erster Stand.") },
      });
      expect(created.status(), "POST /api/mindmaps ohne Schalter").not.toBe(413);
      expect(created.ok(), "POST /api/mindmaps ohne Schalter").toBe(true);

      // Wachsendes Speichern (größer als der alte Stand) ist ohne Schalter nie eine Quote-Sache.
      const grown = await request.put(`/api/mindmaps/${encodeURIComponent(filename)}`, {
        headers: SAME_ORIGIN_HEADERS,
        data: { markdown: note("Quote E2E", `Zweiter Stand. ${"Mehr Text. ".repeat(2_000)}`) },
      });
      expect(grown.status(), "PUT /api/mindmaps/<name> wachsend ohne Schalter").not.toBe(413);
      expect(grown.ok(), "PUT /api/mindmaps/<name> wachsend ohne Schalter").toBe(true);
      const body = await grown.text();
      expect(body).not.toContain("QUOTA_EXCEEDED");
    } finally {
      await request.delete(`/api/mindmaps/${encodeURIComponent(filename)}`, { headers: SAME_ORIGIN_HEADERS });
    }
  });

  test("K1: /account zeigt keinen Speicher-Block und lädt fehlerfrei @t380", async ({ page }) => {
    const response = await page.goto("/account");
    expect(response?.status(), "/account").toBe(200);
    await expect(page.getByTestId("account-build-version")).toBeVisible();
    await expect(page.getByTestId("account-storage")).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText("Speicherplatz erreicht");
    await expect(page.locator("body")).not.toContainText("von 100 MB");
  });
});
