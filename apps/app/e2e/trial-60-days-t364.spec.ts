/**
 * Ticket #364 — Testzeitraum der Bestandskonten auf 60 Tage (Testende 14.01.2027, Hinweise 30.12.2026 und 07.01.2027).
 *
 * Geprüft wird an der Oberfläche des Testsystems, auf beiden Hosts (App = `PLAYWRIGHT_BASE_URL`, Marketing =
 * `PLAYWRIGHT_MARKETING_URL`, sonst aus `PLAYWRIGHT_BASE_URL` abgeleitet: `app.` → `marketing.`), je in DE und `?lang=en`.
 * Rein lesend; es entstehen keine Testdaten.
 *
 * Nicht prüfbar an der Oberfläche des Testsystems:
 * - K1 (`/account` zeigt „Testzeitraum bis 14.01.2027“): Das Testsystem läuft im E2E-Bypass ohne Datenbankkonto; dort gibt es
 *   kein Testende, die Zeile erscheint nicht (docs/TRIAL.md, „Ohne Datenbank … gibt es kein Testende“). Abgedeckt durch
 *   `trial.test.ts` und `trial-period-db.integration.test.ts`. Geprüft wird hier nur: Ohne Konto zeigt `/account` nie das
 *   Altdatum 15.12.2026.
 * - K4 (Hinweis-Job `db:trial-reminders --apply --jetzt …`), K5 (Konto registrieren, bestätigen, Hinweise nach 15/23 Tagen)
 *   und K6 (Migration `015`, zweiter `db:migrate`): brauchen Datenbankzugriff und das E2E-Outbox auf dem Testsystem; ein
 *   Browser erreicht beides nicht. Abgedeckt durch `trial-reminders.test.ts`, `trial.test.ts`, `db.test.ts` und
 *   `tests/integration/trial-period-db.integration.test.ts`.
 */
import { expect, test, type Page } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL?.trim() ?? "";
const marketingURL = (process.env.PLAYWRIGHT_MARKETING_URL?.trim() || baseURL.replace("//app.", "//marketing.")).replace(/\/$/, "");

const HOSTS = [
  { name: "App", origin: baseURL.replace(/\/$/, "") },
  { name: "Marketing", origin: marketingURL },
] as const;
const LANGS = ["de", "en"] as const;
type Lang = (typeof LANGS)[number];

/** Altdaten (Testende 15.12., Hinweise 30.11./08.12.) dürfen nirgends mehr für Bestandskonten stehen. */
const OLD_DATES = /15\.12\.2026|December 15, 2026|15\. Dezember 2026|30\.11\.2026|08\.12\.2026|November 30, 2026|December 8, 2026/;

const END = { de: "14.01.2027", en: "January 14, 2027" } as const;
const REMINDERS = { de: ["30.12.2026", "07.01.2027"], en: ["December 30, 2026", "January 7, 2027"] } as const;

async function visibleText(page: Page, url: string) {
  const response = await page.goto(url);
  expect(response?.status(), `${url} muss 200 liefern`).toBe(200);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  return (await page.locator("body").innerText()).replace(/\s+/g, " ").trim();
}

const url = (origin: string, path: string, lang: Lang) => `${origin}${path}${lang === "en" ? "?lang=en" : ""}`;

test.describe("Testzeitraum Bestandskonten 60 Tage @t364", () => {
  test.beforeAll(() => {
    expect(baseURL, "PLAYWRIGHT_BASE_URL muss gesetzt sein").toMatch(/^https?:\/\//);
    expect(marketingURL, "PLAYWRIGHT_MARKETING_URL bzw. PLAYWRIGHT_BASE_URL muss gesetzt sein").toMatch(/^https?:\/\//);
  });

  // Das Testsystem läuft über HTTP (kein sicherer Kontext): `crypto.randomUUID` fehlt, die Landing stürzt sonst beim Hydrieren ab.
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const c = globalThis.crypto as Crypto & { randomUUID?: () => string };
      if (c && typeof c.randomUUID !== "function") {
        c.randomUUID = () =>
          "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
            const r = Math.floor(Math.random() * 16);
            return (ch === "x" ? r : (r & 0x3) | 0x8).toString(16);
          }) as `${string}-${string}-${string}-${string}-${string}`;
      }
    });
  });

  test("K1 (Teil): /account zeigt ohne Datenbankkonto nie das Altdatum 15.12.2026 @t364", async ({ page }) => {
    for (const lang of LANGS) {
      const response = await page.goto(url(HOSTS[0].origin, "/account", lang));
      expect(response?.status(), `/account (${lang})`).toBeLessThan(400);
      const text = (await page.locator("body").innerText()).replace(/\s+/g, " ");
      expect(text, `/account ${lang}`).not.toMatch(OLD_DATES);
    }
  });

  test("K2: /lizenz nennt Bestandskonten bis 14.01.2027, nirgends 15.12.2026, neue Konten weiter 30 Tage @t364", async ({ page }) => {
    for (const host of HOSTS) {
      for (const lang of LANGS) {
        const text = await visibleText(page, url(host.origin, "/lizenz", lang));
        expect(text, `${host.name} ${lang}`).toContain(END[lang]);
        expect(text, `${host.name} ${lang}`).toMatch(lang === "de" ? /30 Tage ab der Bestätigung/ : /30 days from confirmation/);
        expect(text, `${host.name} ${lang}`).not.toMatch(OLD_DATES);
      }
    }
  });

  for (const path of ["/agb", "/datenschutz"]) {
    test(`K2: ${path} nennt Ende 14.01.2027 (60 Tage), Hinweise 30.12.2026 und 07.01.2027, neue Konten 30 Tage mit 15 und 23 @t364`, async ({ page }) => {
      for (const host of HOSTS) {
        for (const lang of LANGS) {
          const text = await visibleText(page, url(host.origin, path, lang));
          const label = `${host.name} ${path} ${lang}`;
          expect(text, label).toContain(END[lang]);
          expect(text, label).toMatch(lang === "de" ? /60 Tage, Zählung ab dem 15\.11\.2026/ : /60 days, counted from November 15, 2026/);
          for (const date of REMINDERS[lang]) expect(text, label).toContain(date);
          expect(text, label).toMatch(lang === "de" ? /30 Tage ab der Bestätigung|30 Tage ab E-Mail-Bestätigung|30 Tage nach der Bestätigung/ : /30 days (from|after) (you |email )*confirm/);
          expect(text, label).toMatch(lang === "de" ? /nach 15 (Tagen )?und (eine weitere )?(nach )?23 Tagen/ : /after 15 days and (another )?(after )?23 days/);
          expect(text, label).not.toMatch(OLD_DATES);
        }
      }
    });
  }

  test("K3: Landing-FAQ DE und EN nennen 60 Tage und 14.01.2027 @t364", async ({ page }) => {
    const cases = [
      { path: "/", question: "Wie lange gilt der kostenlose Testaccount?", expected: [/dauert 60 Tage \(bis 14\.01\.2027\)/, /30 Tage ab E-Mail-Bestätigung/] },
      { path: "/en", question: "What is included in the free trial account and the beta?", expected: [/lasts 60 days \(until January 14, 2027\)/, /30 days from email confirmation/] },
    ] as const;
    for (const c of cases) {
      const response = await page.goto(`${marketingURL}${c.path}`);
      expect(response?.status(), c.path).toBe(200);
      const faq = page.locator("#faq");
      const button = faq.getByRole("button", { name: c.question });
      await expect(button, c.path).toBeVisible();
      if ((await button.getAttribute("aria-expanded")) !== "true") await button.click();
      await expect(button).toHaveAttribute("aria-expanded", "true");
      const text = (await faq.innerText()).replace(/\s+/g, " ");
      for (const pattern of c.expected) expect(text, c.path).toMatch(pattern);
      expect(text, c.path).not.toMatch(OLD_DATES);
    }
  });

  test("K3: /leistungen DE und EN nennen 60 Tage und 14. Januar 2027 @t364", async ({ page }) => {
    const expected = {
      de: /ab dem 15\. November 2026 und dauert 60 Tage \(bis 14\. Januar 2027\)/,
      en: /November 15, 2026 and lasts 60 days \(until January 14, 2027\)/,
    } as const;
    for (const lang of LANGS) {
      const text = await visibleText(page, url(marketingURL, "/leistungen", lang));
      expect(text, lang).toMatch(expected[lang]);
      expect(text, lang).toMatch(lang === "de" ? /30 Tage ab E-Mail-Bestätigung/ : /30 days from email confirmation/);
      expect(text, lang).not.toMatch(OLD_DATES);
    }
  });

  test("K3: Doku closed-beta-zugang (Marketing) DE und EN nennen 60 Tage und 14.01.2027 @t364", async ({ page }) => {
    const expected = {
      de: /15\.11\.2026 und dauert 60 Tage \(bis 14\.01\.2027\)/,
      en: /November 15, 2026 and lasts 60 days \(until January 14, 2027\)/,
    } as const;
    for (const lang of LANGS) {
      const response = await page.goto(url(marketingURL, "/docs/closed-beta-zugang", lang));
      expect(response?.status(), `docs ${lang}`).toBe(200);
      const text = (await page.getByTestId("docs-article").innerText()).replace(/\s+/g, " ");
      expect(text, lang).toMatch(expected[lang]);
      expect(text, lang).not.toMatch(OLD_DATES);
    }
  });
});
