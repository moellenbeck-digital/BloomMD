/**
 * Ticket #381 — Rechtstexte für den Cloud-Tarif (AGB, Widerruf, Datenschutz, Leistungen).
 *
 * Geprüft wird an der Oberfläche, auf beiden Hosts (App = `PLAYWRIGHT_BASE_URL`, Marketing = `PLAYWRIGHT_MARKETING_URL`,
 * sonst aus `PLAYWRIGHT_BASE_URL` abgeleitet: `app.` → `marketing.`), je in DE und `?lang=en`. Ein Fall je Kriterium.
 * `/leistungen` gibt es nur auf Marketing.
 *
 * - K1: `/agb` nennt Cloud, 6 EUR/Monat, 60 EUR/Jahr, Stripe, 100 MB.
 * - K2: `/widerruf` hat das Widerrufsrecht; „keine Zahlungen“ und „keine Rückabwicklung“ fehlen.
 * - K3: `/datenschutz` hat den Abschnitt „Zahlung und Abo“ und nennt Stripe und 180 Tage; „Keine Zahlungen“ fehlt.
 * - K4: `/leistungen` nennt Preise und Cloud-Tarif; „keine kostenpflichtigen Pläne“ fehlt.
 * - K5: Kein Studierendenrabatt und keine Lifetime-Option in allen Rechtsseiten; die Testzeitraum-Daten stehen unverändert.
 *
 * Nicht prüfbar: Ob die Texte juristisch tragen (offene Rechtsfragen: `docs/BILLING.md`). Billing ist auf dem Testsystem aus,
 * es gibt keinen Checkout.
 *
 * Die Tests sind rein lesend; es entstehen keine Testdaten.
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

async function open(page: Page, origin: string, path: string, lang: Lang) {
  const response = await page.goto(`${origin}/${path}${lang === "en" ? "?lang=en" : ""}`);
  expect(response?.status(), `${origin}/${path} (${lang})`).toBe(200);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
}

async function pageText(page: Page) {
  return (await page.locator("article").innerText()).replace(/\s+/g, " ").trim();
}

/** Sichtbarer Text des Abschnitts (`<section>` mit der Überschrift `heading`). */
async function section(page: Page, heading: string) {
  const box = page.locator("section").filter({ has: page.getByRole("heading", { level: 2, name: heading, exact: true }) });
  await expect(box, `Abschnitt „${heading}“`).toHaveCount(1);
  await expect(box).toBeVisible();
  return (await box.innerText()).replace(/\s+/g, " ").trim();
}

test.describe("Rechtstexte Cloud-Tarif @t381", () => {
  test.beforeAll(() => {
    expect(baseURL, "PLAYWRIGHT_BASE_URL muss gesetzt sein").toMatch(/^https?:\/\//);
    expect(marketingURL, "PLAYWRIGHT_MARKETING_URL bzw. PLAYWRIGHT_BASE_URL muss gesetzt sein").toMatch(/^https?:\/\//);
  });

  test("K1: /agb nennt Cloud, 6 EUR/Monat, 60 EUR/Jahr, Stripe, 100 MB @t381", async ({ page }) => {
    const heading = { de: "Preise und Zahlungen", en: "Prices and payments" } as const;
    const expected = {
      de: [/Cloud/, /6 EUR pro Monat/, /60 EUR pro Jahr/, /Stripe/, /100 MB/, /Testaccount ist kostenlos/],
      en: [/Cloud/, /6 EUR per month/, /60 EUR per year/, /Stripe/, /100 MB/, /trial account is free of charge/],
    } as const;
    for (const host of HOSTS) {
      for (const lang of LANGS) {
        await open(page, host.origin, "agb", lang);
        const text = await section(page, heading[lang]);
        for (const pattern of expected[lang]) expect(text, `${host.name} ${lang}`).toMatch(pattern);
      }
    }
  });

  test("K2: /widerruf hat das Widerrufsrecht; „keine Zahlungen“ und „keine Rückabwicklung“ fehlen @t381", async ({ page }) => {
    const heading = { de: "Widerrufsrecht", en: "Right of withdrawal" } as const;
    const expected = {
      de: [/binnen vierzehn Tagen ohne Angabe von Gründen/, /Muster-Widerrufsformular/],
      en: [/within fourteen days without giving any reason/, /Model withdrawal form/],
    } as const;
    for (const host of HOSTS) {
      for (const lang of LANGS) {
        await open(page, host.origin, "widerruf", lang);
        const text = await section(page, heading[lang]);
        for (const pattern of expected[lang]) expect(text, `${host.name} ${lang}`).toMatch(pattern);
        const all = await pageText(page);
        expect(all, `${host.name} ${lang}`).not.toMatch(/keine Zahlungen|keine Zahlungsrückabwicklung|keine Rückabwicklung|no payments|no payment reversal/i);
        expect(all, `${host.name} ${lang}`).not.toMatch(/keine kostenpflichtigen Pläne|no paid plans/i);
      }
    }
  });

  test("K3: /datenschutz hat „Zahlung und Abo“, nennt Stripe und 180 Tage; „Keine Zahlungen“ fehlt @t381", async ({ page }) => {
    const heading = { de: "Zahlung und Abo", en: "Payment and subscription" } as const;
    const expected = {
      de: [/Art\. 6 Abs\. 1 lit\. b DSGVO/, /keine Kartendaten/, /Stripe/],
      en: [/Art\. 6\(1\)\(b\) GDPR/, /card data/, /Stripe/],
    } as const;
    for (const host of HOSTS) {
      for (const lang of LANGS) {
        await open(page, host.origin, "datenschutz", lang);
        const text = await section(page, heading[lang]);
        for (const pattern of expected[lang]) expect(text, `${host.name} ${lang}`).toMatch(pattern);
        const all = await pageText(page);
        expect(all, `${host.name} ${lang}`).toMatch(/Stripe Payments Europe, Ltd\./);
        expect(all, `${host.name} ${lang}`).toMatch(lang === "de" ? /180 Tage nach der Verarbeitung/ : /180 days after they were processed/);
        expect(all, `${host.name} ${lang}`).not.toMatch(/Keine Zahlungen|No payments|Zahlungsdienstleister werden erst relevant|Payment service providers become relevant/);
      }
    }
  });

  test("K4: /leistungen nennt Preise und Cloud-Tarif; „keine kostenpflichtigen Pläne“ fehlt @t381", async ({ page }) => {
    const expected = {
      de: [/Cloud/, /6 EUR pro Monat/, /60 EUR pro Jahr/, /Stripe/, /100 MB/, /Testaccount bleibt kostenlos/],
      en: [/Cloud/, /6 EUR per month/, /60 EUR per year/, /Stripe/, /100 MB/, /trial account stays free of charge/],
    } as const;
    for (const lang of LANGS) {
      await open(page, marketingURL, "leistungen", lang);
      const all = await pageText(page);
      for (const pattern of expected[lang]) expect(all, `Marketing ${lang}`).toMatch(pattern);
      expect(all, `Marketing ${lang}`).not.toMatch(/keine kostenpflichtigen Pläne|no paid plans/i);
    }
  });

  test("K5: kein Studierendenrabatt, keine Lifetime-Option; Testzeitraum-Daten unverändert @t381", async ({ page }) => {
    const dates = {
      de: ["14.01.2027", "30.12.2026", "07.01.2027"],
      en: ["January 14, 2027", "December 30, 2026", "January 7, 2027"],
    } as const;
    for (const host of HOSTS) {
      for (const lang of LANGS) {
        for (const name of ["lizenz", "agb", "datenschutz", "widerruf", "impressum"]) {
          await open(page, host.origin, name, lang);
          expect(await pageText(page), `${host.name} ${lang} /${name}`).not.toMatch(/Studierende|Studenten|Rabatt|Lifetime|student|discount/i);
        }
        for (const name of ["agb", "datenschutz"]) {
          await open(page, host.origin, name, lang);
          const all = await pageText(page);
          for (const date of dates[lang]) expect(all, `${host.name} ${lang} /${name}`).toContain(date);
        }
      }
    }
    for (const lang of LANGS) {
      await open(page, marketingURL, "leistungen", lang);
      expect(await pageText(page), `Marketing ${lang} /leistungen`).not.toMatch(/Studierende|Studenten|Rabatt|Lifetime|student|discount/i);
    }
  });
});
