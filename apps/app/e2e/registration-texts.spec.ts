import { expect, test } from "@playwright/test";

/**
 * Ticket #165: Texte und Seiten der App passen zur offenen Registrierung (Gate aus, Standardfall des Dev-Systems).
 * Nur lesend, es werden keine Testdaten angelegt. Lauf: `e2e-test ausfuehren 165` bzw.
 * `PLAYWRIGHT_BASE_URL=… bunx playwright test -c playwright.testsystem.config.ts --grep @t165`.
 *
 * Nicht über die Oberfläche der App prüfbar (Begründung):
 * - Marketing (`/#beta`, Landing, Leistungen, Obsidian, Download, `/api/waitlist` → 410, `/waitlist/bestaetigt` → 308,
 *   Marketing-Doku/-Datenschutz/-Widerruf): läuft in einem eigenen Dienst, das Testsystem-Setup kennt nur die App-URL.
 * - Doku `closed-beta-zugang` der App (`apps/app/content/docs`): hat keine Route in der App (`lib/docs.ts` wird nirgends
 *   gerendert), also keine Oberfläche.
 * - Gate an: das Testsystem hat das Gate aus; abgedeckt durch `scripts/qa/run-production-smoke.test.ts` und `beta-gate.spec.ts`.
 */

async function bodyText(page: import("@playwright/test").Page) {
  return (await page.locator("body").innerText()).replace(/\s+/g, " ");
}

test.describe("offene Registrierung, Texte der App @t165", () => {
  test("Signup bei Gate aus zeigt das Formular ohne Beta-Block, Warteliste und Weiterleitung @t165", async ({ page }) => {
    const response = await page.goto("/signup");
    expect(response?.status()).toBe(200);
    await expect(page.getByTestId("signup-form")).toBeVisible();
    await expect(page.getByTestId("beta-access-gate")).toHaveCount(0);
    await expect(page.getByText("Zur Beta-Warteliste")).toHaveCount(0);
    await expect(page.getByText("Beta-Code (optional)")).toHaveCount(0);
    await expect(page.locator('a[href*="#beta"]')).toHaveCount(0);
    expect(new URL(page.url()).pathname).toBe("/signup");
  });

  test("Signup (EN) zeigt weder Beta-Block noch Warteliste @t165", async ({ page }) => {
    await page.goto("/signup?lang=en");
    await expect(page.getByTestId("signup-form")).toBeVisible();
    await expect(page.getByTestId("beta-access-gate")).toHaveCount(0);
    await expect(page.getByText("Join the beta waitlist")).toHaveCount(0);
    await expect(page.getByText("Beta code (optional)")).toHaveCount(0);
    expect(new URL(page.url()).pathname).toBe("/signup");
  });

  for (const [lang, url, verboten, positiv] of [
    ["DE", "/beta", /Einladung|Einladungs-Mail|manuell gegatet/i, /nicht registrieren/i],
    ["EN", "/beta?lang=en", /invitation|invited|manually gated/i, /not need to register/i],
  ] as const) {
    test(`Beta-Seite ${lang} nennt keine Einladung und keine Registrierungspflicht für den Desktop @t165`, async ({ page }) => {
      const response = await page.goto(url);
      expect(response?.status()).toBe(200);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      const text = await bodyText(page);
      expect(text).not.toMatch(verboten);
      expect(text).toMatch(positiv);
    });
  }

  test("Datenschutz DE: Abschnitt Warteliste (beendet) mit Löschung 90 Tage nach der Einladungs-E-Mail @t165", async ({ page }) => {
    await page.goto("/datenschutz");
    const abschnitt = page.locator("section", { has: page.getByRole("heading", { name: "Warteliste (beendet)" }) });
    await expect(abschnitt).toBeVisible();
    await expect(abschnitt).toContainText("Die Warteliste ist beendet; neue Einträge sind nicht mehr möglich.");
    await expect(abschnitt).toContainText("90 Tage nach dieser Einladungs-E-Mail gelöscht");
    await expect(page.getByRole("heading", { name: /^Warteliste$/ })).toHaveCount(0);
  });

  test("Datenschutz EN: Abschnitt Waitlist (ended) mit 90 Tagen @t165", async ({ page }) => {
    await page.goto("/datenschutz?lang=en");
    const abschnitt = page.locator("section", { has: page.getByRole("heading", { name: "Waitlist (ended)" }) });
    await expect(abschnitt).toBeVisible();
    await expect(abschnitt).toContainText("The waitlist has ended; nobody can join it any more.");
    await expect(abschnitt).toContainText("deleted 90 days after that invitation email");
  });

  test("Widerruf nennt den noch bestehenden Eintrag der beendeten Warteliste @t165", async ({ page }) => {
    await page.goto("/widerruf");
    await expect(page.locator("body")).toContainText("einen noch bestehenden Eintrag der beendeten Warteliste");
    expect(await bodyText(page)).not.toContain("den Wartelisten-Eintrag über den Abmeldelink entfernen");
  });
});
