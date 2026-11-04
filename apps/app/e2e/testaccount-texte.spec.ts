import { expect, test, type Page } from "@playwright/test";

/**
 * Wording "kostenloser Testaccount" (30 Tage ab E-Mail-Bestätigung), "geschlossene Beta" removed (#271).
 * Runs against the test system (playwright.testsystem.config.ts). The marketing site runs next to the app
 * (host `marketing.…` instead of `app.…`, override with PLAYWRIGHT_MARKETING_BASE_URL).
 *
 * Not testable here:
 * - Access gate ON: the test system cannot switch the gate; only the existing state (gate off, signup form
 *   visible) is checked. The gate-on wording is covered by the unit tests of auth-copy / betaAccess.
 * - Confirmation email subject and body: no mail outbox on the test system; covered by src/lib/email.test.ts.
 * - The grep over the source tree is run by the tester, not by a UI test.
 */

const appBase = process.env.PLAYWRIGHT_BASE_URL ?? "";
const marketingBase =
  process.env.PLAYWRIGHT_MARKETING_BASE_URL?.trim() || appBase.replace("//app.", "//marketing.");

const marketing = (path: string) => `${marketingBase.replace(/\/$/, "")}${path}`;

/** Visible text of the main content plus header/footer, whitespace-normalised. */
async function pageText(page: Page, url: string) {
  const response = await page.goto(url);
  expect(response?.status(), `${url} must answer 200`).toBe(200);
  const text = await page.locator("body").innerText();
  return text.replace(/\s+/g, " ");
}

/** "geschlossene Beta", "geschlossenen M1-Beta", "closed beta", "closed M1 beta", "invite-only". */
const CLOSED_BETA = /geschlossen\w*\s+(M1[ -])?Beta|closed[ -](M1[ -])?beta|invite-only/i;
const PRICE = /(€|\bEUR\b|\bEuro\b|\$\s?\d|\d\s?(€|Euro|EUR))/;

test.describe("Testaccount-Texte @t271", () => {
  test.beforeAll(() => {
    expect(marketingBase, "marketing base url").toMatch(/^https?:\/\//);
  });

  // The test system runs over plain HTTP (insecure context): `crypto.randomUUID` does not exist there and the
  // landing page's starter-markdown crashes on hydration. Production runs on HTTPS, so polyfill for the test.
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const c = globalThis.crypto as Crypto & { randomUUID?: () => string };
      if (c && typeof c.randomUUID !== "function") {
        c.randomUUID = () => "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
          const r = Math.floor(Math.random() * 16);
          return (ch === "x" ? r : (r & 0x3) | 0x8).toString(16);
        }) as `${string}-${string}-${string}-${string}-${string}`;
      }
    });
  });

  test("Kriterium 1: /leistungen DE nennt Testaccount, 30 Tage, Preisvorbehalt, keinen Preis @t271", async ({ page }) => {
    const text = await pageText(page, marketing("/leistungen"));
    expect(text).toContain("kostenloser Testaccount");
    expect(text).toContain("30 Tage ab E-Mail-Bestätigung");
    expect(text).toContain("Preise und Leistungsumfang werden vor Einführung");
    expect(text).not.toMatch(CLOSED_BETA);
    expect(text).not.toMatch(PRICE);
  });

  test("Kriterium 1: /leistungen EN nennt free trial account, 30 days, keinen Preis @t271", async ({ page }) => {
    const text = await pageText(page, marketing("/leistungen?lang=en"));
    expect(text).toContain("free trial account");
    expect(text).toContain("30 days from email confirmation");
    expect(text).not.toMatch(CLOSED_BETA);
    expect(text).not.toMatch(PRICE);
  });

  test("Kriterium 2: Landing DE (#beta, FAQ, Nav, Footer) @t271", async ({ page }) => {
    const text = await pageText(page, marketing("/"));
    await expect(page.locator("#beta")).toContainText("Testaccount");
    await expect(page.locator("#beta")).toContainText("ohne Einladung und ohne Warteliste");
    await expect(page.locator("#faq")).toContainText("Wie lange gilt der kostenlose Testaccount?");
    await expect(page.locator("header").getByRole("link", { name: "Testaccount", exact: true }).first()).toBeVisible();
    await expect(page.locator("footer")).toContainText("Testaccount");
    expect(text).toContain("30 Tage ab E-Mail-Bestätigung");
    expect(text).not.toMatch(CLOSED_BETA);
    expect(text).not.toMatch(PRICE);
  });

  test("Kriterium 2: Landing EN (/en) @t271", async ({ page }) => {
    const text = await pageText(page, marketing("/en"));
    await expect(page.locator("header").getByRole("link", { name: "Free trial", exact: true }).first()).toBeVisible();
    expect(text).toContain("free trial account");
    expect(text).toContain("no invitation and no waitlist");
    expect(text).not.toMatch(CLOSED_BETA);
    expect(text).not.toMatch(PRICE);
  });

  for (const path of ["/download", "/obsidian"]) {
    test(`Kriterium 2: ${path} nennt Testaccount ohne Einladung und Warteliste @t271`, async ({ page }) => {
      const text = await pageText(page, marketing(path));
      expect(text).toContain("kostenlosen Testaccount");
      expect(text).toContain("ohne Einladung und ohne Warteliste");
      expect(text).not.toMatch(CLOSED_BETA);
      expect(text).not.toMatch(PRICE);
    });
  }

  test("Kriterium 3: Doku closed-beta-zugang DE, Abschnitt Testzeitraum, Slug erreichbar @t271", async ({ page }) => {
    const text = await pageText(page, marketing("/docs/closed-beta-zugang"));
    await expect(page.locator("h1")).toHaveText("Kostenloser Testaccount");
    await expect(page.getByRole("heading", { name: "Testzeitraum", exact: true })).toBeVisible();
    expect(text).not.toMatch(CLOSED_BETA);
    expect(text).not.toMatch(PRICE);
  });

  test("Kriterium 3: Doku closed-beta-zugang EN @t271", async ({ page }) => {
    const text = await pageText(page, marketing("/docs/closed-beta-zugang?lang=en"));
    await expect(page.locator("h1")).toHaveText("Free trial account");
    await expect(page.getByRole("heading", { name: "Trial period", exact: true })).toBeVisible();
    expect(text).not.toMatch(CLOSED_BETA);
  });

  for (const path of ["/docs", "/docs/web", "/docs/lokal-oder-cloud", "/docs/fehlerbehebung"]) {
    test(`Kriterium 3: ${path} verlinkt auf den Testaccount-Slug @t271`, async ({ page }) => {
      await pageText(page, marketing(path));
      const link = page.locator('main a[href="/docs/closed-beta-zugang"]').first();
      await expect(link).toHaveText(/Kostenloser Testaccount/);
      await link.click();
      await expect(page).toHaveURL(/\/docs\/closed-beta-zugang$/);
      await expect(page.locator("h1")).toHaveText("Kostenloser Testaccount");
    });
  }

  test("Kriterium 4: Datenschutz (Marketing) Hinweis-E-Mails 15/23 Tage, Warteliste bleibt @t271", async ({ page }) => {
    const text = await pageText(page, marketing("/datenschutz"));
    await expect(page.getByRole("heading", { name: "Hinweis-E-Mails zum Testzeitraum" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Warteliste (beendet)" })).toBeVisible();
    expect(text).toContain("nach 15 Tagen");
    expect(text).toContain("nach 23 Tagen");
    expect(text).toContain("Zweck:");
    expect(text).toContain("deine E-Mail-Adresse und der Zeitpunkt deiner E-Mail-Bestätigung");
    expect(text).toContain("Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO");
    expect(text).not.toContain("Freischaltung der geschlossenen Beta");
    expect(text).not.toMatch(CLOSED_BETA);
  });

  test("Kriterium 4: Datenschutz (App) Hinweis-E-Mails 15/23 Tage, Warteliste bleibt @t271", async ({ page }) => {
    const text = await pageText(page, "/datenschutz");
    await expect(page.getByRole("heading", { name: "Hinweis-E-Mails zum Testzeitraum" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Warteliste (beendet)" })).toBeVisible();
    expect(text).toContain("nach 15 Tagen");
    expect(text).toContain("nach 23 Tagen");
    expect(text).toContain("deine E-Mail-Adresse und der Zeitpunkt deiner E-Mail-Bestätigung");
    expect(text).toContain("Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO");
    expect(text).not.toMatch(CLOSED_BETA);
  });

  test("Kriterium 4: Datenschutz EN (Marketing) @t271", async ({ page }) => {
    const text = await pageText(page, marketing("/datenschutz?lang=en"));
    await expect(page.getByRole("heading", { name: "Reminder emails during the trial period" })).toBeVisible();
    expect(text).toContain("after 15 days");
    expect(text).toContain("after 23 days");
    expect(text).not.toMatch(CLOSED_BETA);
  });

  for (const [label, resolve] of [
    ["Marketing", (p: string) => marketing(p)],
    ["App", (p: string) => p],
  ] as const) {
    for (const path of ["/agb", "/widerruf"]) {
      test(`Kriterium 4: ${label} ${path} ohne geschlossene Beta und M1-Beta @t271`, async ({ page }) => {
        const text = await pageText(page, resolve(path));
        expect(text).toContain("Testaccount");
        expect(text).not.toMatch(CLOSED_BETA);
        expect(text).not.toMatch(/M1-Beta/);
      });
    }
  }

  test("Kriterium 5: nur lesbar nach 30 Tagen, Export, nichts geht verloren, 15.11.2026 @t271", async ({ page }) => {
    const text = await pageText(page, marketing("/docs/closed-beta-zugang"));
    expect(text).toContain("nur noch lesbar");
    expect(text).toContain("Der Export bleibt möglich");
    expect(text).toContain("Nichts geht verloren");
    expect(text).toContain("15.11.2026");
    const landing = await pageText(page, marketing("/"));
    expect(landing).toContain("nur noch lesbar");
    expect(landing).toContain("nichts geht verloren");
  });

  test("Kriterium 6: /signup (Gate aus) zeigt Formular und Untertitel mit 30 Tagen @t271", async ({ page }) => {
    await page.goto("/signup");
    await expect(page.getByRole("heading", { name: "Account erstellen", exact: true })).toBeVisible();
    await expect(page.locator("form").first()).toBeVisible();
    await expect(page.locator("main")).toContainText("kostenlosen BloomMD-Testaccount");
    await expect(page.locator("main")).toContainText("30 Tage ab E-Mail-Bestätigung");
    const text = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    expect(text).not.toMatch(CLOSED_BETA);
    expect(text).not.toMatch(/Warteliste|waitlist/i);
  });

  test("Kriterium 6: /signup EN @t271", async ({ page }) => {
    await page.goto("/signup?lang=en");
    await expect(page.locator("main")).toContainText("free BloomMD trial account");
    await expect(page.locator("main")).toContainText("30 days from email confirmation");
  });

  test("Kriterium 8: kein Preis auf App-Seiten /signup und /beta @t271", async ({ page }) => {
    for (const path of ["/signup", "/signup?lang=en", "/beta"]) {
      const text = await pageText(page, path);
      expect(text, path).not.toMatch(PRICE);
    }
  });
});
