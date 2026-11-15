/**
 * Ticket #199 — Rechtsseiten für den öffentlichen Betrieb (Lizenz, AGB, Datenschutz, Widerruf, Impressum).
 *
 * Geprüft wird an der Oberfläche, auf beiden Hosts (App = `PLAYWRIGHT_BASE_URL`, Marketing =
 * `PLAYWRIGHT_MARKETING_URL`, sonst aus `PLAYWRIGHT_BASE_URL` abgeleitet: `app.` → `marketing.`), je in DE und `?lang=en`.
 * Ein Fall je Kriterium, jeder Fall mit eigenem `expect` je Host und Sprache.
 *
 * Nicht prüfbar:
 * - Kriterium 7, Abmeldelink aus einer Wartelisten-Mail → „Abgemeldet“: Es gibt auf dem Testsystem keine Wartelisten-Mail
 *   und keinen gültigen Abmelde-Token; eine neue Eintragung ist nicht mehr möglich (Warteliste beendet). Geprüft wird nur
 *   der Text des Abschnitts „Warteliste (beendet)“.
 * - Kriterium 9, Fall „Nummer gesetzt“: Die Telefonnummer ist Umgebungswert des Deployments (`BLOOMMD_LEGAL_PHONE`) und lässt
 *   sich am laufenden System nicht setzen. Abgedeckt durch `apps/marketing/src/app/legal-pages.test.tsx`. Geprüft wird: Ist
 *   keine Nummer gesetzt, gibt es keine Zeile „Telefon“; ist eine gesetzt, steht sie in der Zeile „Telefon“.
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

const PAGES = ["lizenz", "agb", "datenschutz", "widerruf", "impressum"] as const;
// Stand 4. November 2026 oder neuer; die englische Seite zeigt das Datum derzeit im deutschen Format.
const AS_OF = /^(Stand|As of) (4\. November 2026|November 4, 2026|(\d{1,2}\. (November|Dezember) 2026))/;

async function open(page: Page, origin: string, path: string, lang: Lang) {
  const response = await page.goto(`${origin}/${path}${lang === "en" ? "?lang=en" : ""}`);
  expect(response?.status(), `${origin}/${path} (${lang})`).toBe(200);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
}

/** Sichtbarer Text des Abschnitts (`<section>` mit der Überschrift `heading`). */
async function section(page: Page, heading: string) {
  const box = page.locator("section").filter({ has: page.getByRole("heading", { level: 2, name: heading, exact: true }) });
  await expect(box, `Abschnitt „${heading}“`).toHaveCount(1);
  await expect(box).toBeVisible();
  return (await box.innerText()).replace(/\s+/g, " ").trim();
}

async function pageText(page: Page) {
  return (await page.locator("article").innerText()).replace(/\s+/g, " ").trim();
}

test.describe("Rechtsseiten @t199", () => {
  test.beforeAll(() => {
    expect(baseURL, "PLAYWRIGHT_BASE_URL muss gesetzt sein").toMatch(/^https?:\/\//);
    expect(marketingURL, "PLAYWRIGHT_MARKETING_URL bzw. PLAYWRIGHT_BASE_URL muss gesetzt sein").toMatch(/^https?:\/\//);
  });

  test("K1: /lizenz nennt Testaccount, 30 Tage, Bestandskonten bis 14.01.2027, nur lesen und exportieren, Link auf AGB; kein „Beta“ @t199", async ({ page }) => {
    const heading = { de: "Zugang zu BloomMD Web und Cloud", en: "Access to BloomMD Web and Cloud" } as const;
    const expected = {
      de: [/kostenlosen Testaccount/, /30 Tage ab der Bestätigung/, /14\.01\.2027/, /nur noch lesbar/, /lesen und exportieren/],
      en: [/free trial account/, /30 days from confirmation/, /January 14, 2027/, /read-only/, /read and export/],
    } as const;
    for (const host of HOSTS) {
      for (const lang of LANGS) {
        await open(page, host.origin, "lizenz", lang);
        const text = await section(page, heading[lang]);
        for (const pattern of expected[lang]) expect(text, `${host.name} ${lang}`).toMatch(pattern);
        const link = page.locator("section").filter({ has: page.getByRole("heading", { level: 2, name: heading[lang], exact: true }) }).getByRole("link", { name: lang === "de" ? "AGB" : "terms and conditions" });
        await expect(link, `${host.name} ${lang}: Link auf die AGB`).toHaveAttribute("href", `/agb?lang=${lang}`);
        const all = await pageText(page);
        expect(all, `${host.name} ${lang}`).not.toMatch(/\bbeta\b/i);
        expect(all, `${host.name} ${lang}`).not.toMatch(/eingeladene|invited testers?/i);
      }
    }
  });

  test("K2: /lizenz nennt ELv2 ab Marketing 0.5.1, MIT für ältere Versionen und für das Obsidian-Plugin @t199", async ({ page }) => {
    const heading = { de: "Quellcode-Lizenz", en: "Source code license" } as const;
    const expected = {
      de: [/Marketing 0\.5\.1/, /Elastic License 2\.0 \(ELv2\)/, /Frühere veröffentlichte Versionen.*MIT-Lizenz/, /Obsidian-Plugin steht weiterhin unter der MIT-Lizenz/],
      en: [/Marketing 0\.5\.1/, /Elastic License 2\.0 \(ELv2\)/, /Earlier published versions.*MIT license/, /Obsidian plugin is and stays licensed under MIT/],
    } as const;
    for (const host of HOSTS) {
      for (const lang of LANGS) {
        await open(page, host.origin, "lizenz", lang);
        const text = await section(page, heading[lang]);
        for (const pattern of expected[lang]) expect(text, `${host.name} ${lang}`).toMatch(pattern);
      }
    }
  });

  test("K3: /agb zeigt die Abschnitte der Nutzungsbedingungen, ohne „M1“ und „Beta-Nutzung“ @t199", async ({ page }) => {
    const headings = {
      de: ["Vertragsgegenstand und Registrierung", "Ablauf des Testzeitraums", "Konto löschen", "Zulässige Nutzung und Missbrauch", "Verantwortung für eigene Inhalte", "Haftung", "Änderung der Bedingungen"],
      en: ["Subject matter and registration", "End of the trial period", "Deleting your account", "Acceptable use and misuse", "Responsibility for your own content", "Liability", "Changes to these terms"],
    } as const;
    for (const host of HOSTS) {
      for (const lang of LANGS) {
        await open(page, host.origin, "agb", lang);
        for (const heading of headings[lang]) await section(page, heading);
        const all = await pageText(page);
        expect(all, `${host.name} ${lang}`).not.toMatch(/\bM1\b/);
        expect(all, `${host.name} ${lang}`).not.toMatch(/Beta-Nutzung|beta (use|usage)/i);
      }
    }
  });

  test("K4: /datenschutz „Speicherdauer und Löschung“ nennt die Fristen und dass abgelaufene Testaccounts nicht automatisch gelöscht werden @t199", async ({ page }) => {
    const heading = { de: "Speicherdauer und Löschung", en: "Retention and deletion" } as const;
    const expected = {
      de: [
        /Konten, deren E-Mail-Adresse nie bestätigt wurde: 7 Tage/,
        /Einmal-Tokens \([^)]*\): 7 Tage/,
        /Sitzungen \([^)]*\): 7 Tage/,
        /Zugriffstoken \([^)]*\): 30 Tage/,
        /Gelöschte Dokumente: 30 Tage/,
        /Sicherheitsprotokoll \([^)]*\): 365 Tage/,
        /Wartelisten-Einträge: 90 Tage/,
        /abgelaufener Testaccount wird derzeit nicht automatisch gelöscht/,
      ],
      en: [
        /Accounts whose email address was never confirmed: 7 days/,
        /One-time tokens \([^)]*\): 7 days/,
        /Sessions \([^)]*\): 7 days/,
        /Access tokens \([^)]*\): 30 days/,
        /Deleted documents: permanently removed 30 days/,
        /Security log \([^)]*\): 365 days/,
        /waitlist entries: 90 days/,
        /expired trial account is currently not deleted automatically/,
      ],
    } as const;
    for (const host of HOSTS) {
      for (const lang of LANGS) {
        await open(page, host.origin, "datenschutz", lang);
        const text = await section(page, heading[lang]);
        for (const pattern of expected[lang]) expect(text, `${host.name} ${lang}`).toMatch(pattern);
      }
    }
  });

  test("K5: /datenschutz „Empfänger und Auftragsverarbeiter“ nennt Resend, Sentry und Plausible @t199", async ({ page }) => {
    const heading = { de: "Empfänger und Auftragsverarbeiter", en: "Recipients and processors" } as const;
    for (const host of HOSTS) {
      for (const lang of LANGS) {
        await open(page, host.origin, "datenschutz", lang);
        const text = await section(page, heading[lang]);
        for (const provider of ["Resend", "Sentry", "Plausible"]) expect(text, `${host.name} ${lang}`).toContain(provider);
      }
    }
  });

  test("K6: /datenschutz „Hinweis-E-Mails zum Testzeitraum“ nennt 15/23 Tage, Zweck, Rechtsgrundlage und die Termine der Bestandskonten, auf beiden Hosts gleich @t199", async ({ page }) => {
    const heading = { de: "Hinweis-E-Mails zum Testzeitraum", en: "Reminder emails during the trial period" } as const;
    const expected = {
      de: [/nach 15 Tagen/, /nach 23 Tagen/, /Zweck:/, /Rechtsgrundlage: Art\. 6 Abs\. 1 lit\. b DSGVO/, /15\.12\.2026/, /30\.11\.2026/, /08\.12\.2026/],
      en: [/after 15 days/, /after 23 days/, /Purpose:/, /Legal basis: Art\. 6\(1\)\(b\) GDPR/, /December 15, 2026/, /November 30, 2026/, /December 8, 2026/],
    } as const;
    for (const lang of LANGS) {
      const texts: string[] = [];
      for (const host of HOSTS) {
        await open(page, host.origin, "datenschutz", lang);
        const text = await section(page, heading[lang]);
        for (const pattern of expected[lang]) expect(text, `${host.name} ${lang}`).toMatch(pattern);
        texts.push(text);
      }
      expect(texts[0], `Abschnitt auf App und Marketing gleich (${lang})`).toBe(texts[1]);
    }
  });

  test("K7: /datenschutz „Warteliste (beendet)“ sagt, dass neue Einträge nicht mehr möglich sind @t199", async ({ page }) => {
    const heading = { de: "Warteliste (beendet)", en: "Waitlist (ended)" } as const;
    const expected = { de: /neue Einträge sind nicht mehr möglich/, en: /nobody can join it any more/ } as const;
    for (const host of HOSTS) {
      for (const lang of LANGS) {
        await open(page, host.origin, "datenschutz", lang);
        expect(await section(page, heading[lang]), `${host.name} ${lang}`).toMatch(expected[lang]);
      }
    }
  });

  test("K8: /widerruf ohne „M1“ und „Beta“; nennt die Widerrufsbelehrung zum Tarif Cloud, den kostenlosen Testaccount, Konto löschen und Widerruf der Wartelisten-Einwilligung über den Abmeldelink @t199", async ({ page }) => {
    const expected = {
      de: [/kostenlose Testaccount verursacht keine Kosten/, /binnen vierzehn Tagen ohne Angabe von Gründen/, /Konto jederzeit unter .* löschen/, /Einwilligung jederzeit über den Abmeldelink .* widerrufen/],
      en: [/free trial account costs nothing/, /within fourteen days without giving any reason/, /delete your account at any time/, /withdraw your consent at any time through the unsubscribe link/],
    } as const;
    for (const host of HOSTS) {
      for (const lang of LANGS) {
        await open(page, host.origin, "widerruf", lang);
        const all = await pageText(page);
        for (const pattern of expected[lang]) expect(all, `${host.name} ${lang}`).toMatch(pattern);
        expect(all, `${host.name} ${lang}`).not.toMatch(/\bM1\b/);
        expect(all, `${host.name} ${lang}`).not.toMatch(/\bbeta\b/i);
      }
    }
  });

  test("K9: /impressum hat keine Zeile „Telefon: -“ oder „Telefon: Nicht angegeben“; eine gesetzte Nummer steht in der Zeile „Telefon“ @t199", async ({ page }) => {
    const label = { de: "Telefon", en: "Phone" } as const;
    for (const host of HOSTS) {
      for (const lang of LANGS) {
        await open(page, host.origin, "impressum", lang);
        const lines = (await page.locator("article").innerText()).split("\n").map((line) => line.replace(/\s+/g, " ").trim());
        const phoneLines = lines.filter((line) => new RegExp(`^${label[lang]}\\s*:`, "i").test(line));
        for (const line of phoneLines) {
          expect(line, `${host.name} ${lang}`).not.toMatch(/:\s*-?\s*$/);
          expect(line, `${host.name} ${lang}`).not.toMatch(/Nicht angegeben|Not specified|Not provided/i);
          expect(line, `${host.name} ${lang}: Nummer in der Zeile`).toMatch(/\d{5,}|\+\d/);
        }
        // Ohne gesetzte Nummer entfällt die Zeile ganz; bei einer Nummer ist es genau eine Zeile.
        expect(phoneLines.length, `${host.name} ${lang}`).toBeLessThanOrEqual(1);
        expect(lines.join("\n"), `${host.name} ${lang}`).not.toMatch(/Telefon\s*:\s*(-|Nicht angegeben)/);
      }
    }
  });

  test("K10: Alle fünf Seiten beider Apps sind in DE und EN erreichbar, ohne Fehlerseite, mit aktualisiertem Stand @t199", async ({ page }) => {
    const asOf = { de: "Stand", en: "As of" } as const;
    for (const host of HOSTS) {
      for (const lang of LANGS) {
        for (const path of PAGES) {
          await open(page, host.origin, path, lang);
          await expect(page.getByRole("heading", { level: 1 }), `${host.name} /${path} ${lang}`).not.toHaveText(/404|not found|error|fehler/i);
          expect(await section(page, asOf[lang]), `${host.name} /${path} ${lang}`).toMatch(AS_OF);
        }
      }
    }
  });
});
