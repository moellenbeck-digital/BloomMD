/**
 * Ticket #379 — Billing „Cloud“ (Stripe): 6 EUR/Monat, 60 EUR/Jahr.
 *
 * An der Oberfläche prüfbar (Testmarke @t379):
 * - K1: Ohne `BLOOMMD_BILLING_ENABLED=1` sind `/api/billing/*` unerreichbar (404), auch `POST` mit `tier=cloud&interval=monthly`.
 * - K7: Die Rechtsseiten (`widerruf` auf App und Marketing, `leistungen` auf Marketing) sagen weiterhin „keine kostenpflichtigen Pläne“.
 *
 * Nicht prüfbar an der Oberfläche (abgedeckt durch Bun-Tests, siehe Ticket-Meldung):
 * - K2/K3: Brauchen ein laufendes Billing (`BLOOMMD_BILLING_ENABLED=1`), Datenbank und ein eingeloggtes Konto ohne Price-IDs; das
 *   Testsystem läuft mit ausgeschaltetem Billing. Abgedeckt durch `src/app/api/billing/checkout/route.test.ts`.
 * - K4/K5: Stripe-Aufruf und signierte Webhook-Events; abgedeckt durch `checkout/route.test.ts`, `webhook/route.test.ts` und
 *   `tests/integration/trial-lock-entitlement-db.integration.test.ts` (braucht Postgres).
 * - K6: `/account` mit Abo-Zeile braucht ein Konto mit gespeichertem Abo (Datenbank); `planLabel` liegt in `src/app/account/page.tsx`.
 * - Der echte Stripe-Checkout braucht Test-Price-IDs und ist offen (Testmodus-Durchlauf, siehe `docs/BILLING.md`).
 *
 * Die Tests sind rein lesend bzw. lösen nur abgewiesene Anfragen aus; es entstehen keine Testdaten.
 */
import { expect, test } from "@playwright/test";

const baseURL = (process.env.PLAYWRIGHT_BASE_URL?.trim() ?? "").replace(/\/$/, "");
const marketingURL = (process.env.PLAYWRIGHT_MARKETING_URL?.trim() || baseURL.replace("//app.", "//marketing.")).replace(/\/$/, "");

test.describe("Billing Cloud (#379)", () => {
  test("K1: ohne Billing-Flag sind alle Stripe-Routen 404 @t379", async ({ request }) => {
    for (const path of ["/api/billing/checkout", "/api/billing/portal", "/api/billing/webhook"]) {
      const response = await request.get(`${baseURL}${path}`);
      expect(response.status(), `GET ${path} darf ohne Billing nicht erreichbar sein`).toBe(404);
    }

    const checkout = await request.post(`${baseURL}/api/billing/checkout`, {
      form: { tier: "cloud", interval: "monthly" },
      headers: { origin: baseURL },
      maxRedirects: 0,
    });
    expect(checkout.status(), "POST /api/billing/checkout (tier=cloud, interval=monthly)").toBe(404);
  });

  test("K7: Rechtsseiten sagen weiterhin „keine kostenpflichtigen Pläne“ @t379", async ({ page }) => {
    const widerrufApp = await page.goto(`${baseURL}/widerruf`);
    expect(widerrufApp?.status(), "App /widerruf").toBe(200);
    await expect(page.locator("body")).toContainText("verkauft derzeit keine kostenpflichtigen Pläne");

    const widerrufMarketing = await page.goto(`${marketingURL}/widerruf`);
    expect(widerrufMarketing?.status(), "Marketing /widerruf").toBe(200);
    await expect(page.locator("body")).toContainText("verkauft derzeit keine kostenpflichtigen Pläne");

    const leistungen = await page.goto(`${marketingURL}/leistungen`);
    expect(leistungen?.status(), "Marketing /leistungen").toBe(200);
    await expect(page.locator("body")).toContainText("Es werden keine kostenpflichtigen Pläne angeboten");
  });
});
