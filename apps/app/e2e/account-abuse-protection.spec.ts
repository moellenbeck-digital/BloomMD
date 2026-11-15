/**
 * Ticket #277 — Missbrauchsschutz Mehrfach-Testkonten beim kostenlosen Testaccount.
 *
 * Geprüft wird an der Oberfläche des Testsystems (`PLAYWRIGHT_BASE_URL`). Je Kriterium ein Fall mit eigenem `expect`.
 *
 * Postfach: Die Fälle K1–K5 folgen Bestätigungs- und Reset-Links aus Mails. Das Testsystem schreibt Mails nur dann in
 * eine Datei, wenn `BLOOMMD_E2E_MAIL_OUTBOX` an der App gesetzt ist (`apps/app/src/lib/email.ts`); der Test liest diese
 * Datei über `PLAYWRIGHT_MAIL_OUTBOX` (JSON-Zeilen `{to, subject, text}`). Ist die Variable nicht gesetzt, werden K1–K5
 * übersprungen (mit Hinweis im Bericht), K6 läuft trotzdem. Als Domain dient `bloommd.local`; es geht keine Mail
 * nach außen.
 *
 * Nicht prüfbar an der Oberfläche:
 * - Gmail-Punkte-Regeln und `googlemail.com`: Es werden keine echten Gmail-Adressen verwendet; abgedeckt durch
 *   `src/lib/email-canonical.test.ts` und `src/app/api/auth/open-signup.test.ts`.
 * - Signup-Limit je Mailbox (6 Versuche/Stunde): abgedeckt durch `open-signup.test.ts`; das Mail-Budget des
 *   Testsystems (60/h) ist geteilt und wird hier nicht ausgereizt.
 *
 * Aufräumen: Bestätigte Testkonten werden über /account gelöscht. Unbestätigte Konten (b, d) können sich nicht
 * anmelden und daher nicht selbst löschen; die App entfernt sie nach 7 Tagen (`purgeUnconfirmedAccounts`).
 */
import { existsSync, readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

const PASSWORD = "Testpass12345";
const NEW_PASSWORD = "AnotherPass67890";
const DOMAIN = "bloommd.local";
const MAIL_OUTBOX = process.env.PLAYWRIGHT_MAIL_OUTBOX?.trim() ?? "";

const baseURL = process.env.PLAYWRIGHT_BASE_URL?.trim() ?? "";
const marketingURL = (process.env.PLAYWRIGHT_MARKETING_URL?.trim() || baseURL.replace("//app.", "//marketing.")).replace(/\/$/, "");

const runId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

interface OutboxMail { to: string; subject: string; text: string }

function mailsTo(to: string): OutboxMail[] {
  if (!MAIL_OUTBOX || !existsSync(MAIL_OUTBOX)) return [];
  return readFileSync(MAIL_OUTBOX, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as OutboxMail)
    .filter((mail) => mail.to.toLowerCase() === to.toLowerCase());
}

/** Pfad und Query des neuesten Links in einer Mail an `to`, dessen URL `pathPart` enthält; sonst null. */
function latestLink(to: string, pathPart: string): string | null {
  for (const mail of mailsTo(to).reverse()) {
    const link = mail.text.split(/\s+/).find((word) => /^https?:\/\//.test(word) && word.includes(pathPart));
    if (link) {
      const url = new URL(link);
      return `${url.pathname}${url.search}`;
    }
  }
  return null;
}

async function signup(page: Page, email: string) {
  await page.goto("/signup?next=/app");
  await page.getByLabel("Name").fill("Missbrauchsschutz E2E");
  await page.getByLabel("E-Mail").fill(email);
  await page.getByLabel("Passwort").fill(PASSWORD);
  await page.getByTestId("signup-consent").check();
  // Das Formular weist Absendungen unter 800 ms als Spam-Signal ab.
  await page.waitForTimeout(1_000);
  await page.getByTestId("signup-submit").click();
}

async function expectSentNotice(page: Page) {
  await expect(page).toHaveURL((url) => url.pathname === "/login" && url.searchParams.get("verification") === "sent");
  await expect(page.getByRole("status").filter({ hasText: "Bestätigungs" })).toBeVisible();
}

async function login(page: Page, email: string, password = PASSWORD) {
  await page.goto("/login");
  const form = page.locator('form[action="/api/auth/login"]');
  await form.getByLabel("E-Mail", { exact: true }).fill(email);
  await form.getByLabel("Passwort").fill(password);
  await form.getByRole("button", { name: "Anmelden" }).click();
}

async function confirm(page: Page, email: string) {
  await expect.poll(() => latestLink(email, "/api/auth/verify-email"), { message: `Bestätigungsmail an ${email}`, timeout: 15_000 }).not.toBeNull();
  await page.goto(latestLink(email, "/api/auth/verify-email")!);
}

/** Löscht das (bestätigte) Konto über /account; der Test legt es selbst an. */
async function deleteAccount(page: Page, email: string, password = PASSWORD) {
  await login(page, email, password);
  await expect(page).toHaveURL((url) => url.pathname === "/app");
  await page.goto("/account");
  await page.getByText("Löschung vorbereiten").click();
  await page.locator('form[action="/api/account/delete"]').getByLabel("E-Mail").fill(email);
  await page.locator('form[action="/api/account/delete"]').getByLabel("Passwort").fill(password);
  await page.getByRole("button", { name: "Account und Cloud-Daten löschen" }).click();
  await expect(page).toHaveURL((url) => url.searchParams.get("account") === "deleted");
}

/** Testende nach der Bestätigung heute: heute + 30 Tage, Datum wie die Kontoseite (de-DE, UTC). */
function trialEndToday(): string {
  const end = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }).format(end);
}

test.describe("Missbrauchsschutz Testaccount @t277", () => {
  test.beforeAll(() => {
    expect(baseURL, "PLAYWRIGHT_BASE_URL muss gesetzt sein").toMatch(/^https?:\/\//);
  });

  test.describe("Mehrfach-Testkonten je Postfach", () => {
    test.skip(!MAIL_OUTBOX, "PLAYWRIGHT_MAIL_OUTBOX nicht gesetzt: kein lesbares Postfach auf dem Testsystem");

    const person = `e2e277-${runId}`;
    const a = `${person}+a@${DOMAIN}`;
    const b = `${person}+b@${DOMAIN}`;

    test("K1: person+a registrieren, per Link bestätigen, anmelden; Kontoseite zeigt 30 Tage Testzeitraum @t277", async ({ page }) => {
      await signup(page, a);
      await expectSentNotice(page);
      await confirm(page, a);
      await expect(page).toHaveURL((url) => url.pathname === "/login" && url.searchParams.get("verified") === "1");
      const confirmedOn = trialEndToday();

      await login(page, a);
      await expect(page).toHaveURL((url) => url.pathname === "/app");
      await page.goto("/account");
      await expect(page.getByTestId("account-trial-end")).toContainText(confirmedOn);
    });

    test("K2: person+b nach bestätigtem person+a: gleiche Meldung, keine Mail, Anmeldung scheitert @t277", async ({ page }) => {
      const before = mailsTo(b).length;
      await signup(page, b);
      await expectSentNotice(page);
      // Eine Mail würde unmittelbar nach der Antwort geschrieben; kurz warten, damit eine verspätete nicht durchrutscht.
      await page.waitForTimeout(3_000);
      expect(mailsTo(b).length, "Mails an person+b").toBe(before);

      await login(page, b);
      await expect(page).toHaveURL((url) => url.pathname === "/login");
      await expect(page.getByTestId("login-error")).toBeVisible();
    });

    test("K4: Großschreibung (Person+A@…) verhält sich wie Kleinschreibung @t277", async ({ page }) => {
      const upper = `${person[0].toUpperCase()}${person.slice(1)}+A@${DOMAIN}`;
      const before = mailsTo(upper).length;
      await signup(page, upper);
      await expectSentNotice(page);
      await page.waitForTimeout(3_000);
      expect(mailsTo(upper).length, "Mails an Person+A (bestätigtes Konto, keine neue Mail)").toBe(before);

      // Dasselbe Konto wie in Kleinschreibung: Anmeldung mit dem Passwort aus K1 klappt.
      await login(page, upper);
      await expect(page).toHaveURL((url) => url.pathname === "/app");
      await deleteAccount(page, a);
    });

    test("K3: c und d unbestätigt; c bestätigt starten Testzeitraum, d zeigt die Meldung und bleibt unbestätigt @t277", async ({ page }) => {
      const mailbox = `e2e277c-${runId}`;
      const c = `${mailbox}+c@${DOMAIN}`;
      const d = `${mailbox}+d@${DOMAIN}`;

      await signup(page, c);
      await expectSentNotice(page);
      await signup(page, d);
      await expectSentNotice(page);

      await confirm(page, c);
      await expect(page).toHaveURL((url) => url.pathname === "/login" && url.searchParams.get("verified") === "1");
      const confirmedOn = trialEndToday();

      await confirm(page, d);
      await expect(page).toHaveURL((url) => url.pathname === "/login");
      await expect(page.getByTestId("login-error")).toContainText("Für dieses Postfach gibt es bereits einen bestätigten Testaccount");
      await expect(page).not.toHaveURL((url) => url.searchParams.get("verified") === "1");

      // d ist nicht bestätigt und hat keinen Testzeitraum: Anmeldung scheitert.
      await login(page, d);
      await expect(page).toHaveURL((url) => url.pathname === "/login");
      await expect(page.getByTestId("login-error")).toContainText("Bitte bestätige zuerst deine E-Mail-Adresse.");

      // c läuft: Testzeitraum 30 Tage.
      await login(page, c);
      await expect(page).toHaveURL((url) => url.pathname === "/app");
      await page.goto("/account");
      await expect(page.getByTestId("account-trial-end")).toContainText(confirmedOn);
      await deleteAccount(page, c);
    });

    test("K5: andere Adresse: Registrierung, Bestätigung, Anmeldung, Bestätigung erneut senden, Passwort-Reset @t277", async ({ page }) => {
      const other = `e2e277-andere-${runId}@${DOMAIN}`;

      await signup(page, other);
      await expectSentNotice(page);

      // Vor der Bestätigung: erneut senden liefert eine zweite Mail.
      const mailsBefore = mailsTo(other).length;
      await page.goto("/login");
      await page.getByText("Bestätigung erneut senden").first().click();
      await page.getByLabel("Bestätigungs-E-Mail").fill(other);
      await page.getByRole("button", { name: "Bestätigung erneut senden" }).click();
      await expect.poll(() => mailsTo(other).length, { message: "zweite Bestätigungsmail" }).toBeGreaterThan(mailsBefore);

      await confirm(page, other);
      await expect(page).toHaveURL((url) => url.pathname === "/login" && url.searchParams.get("verified") === "1");
      await login(page, other);
      await expect(page).toHaveURL((url) => url.pathname === "/app");

      await page.goto("/account");
      await page.getByRole("button", { name: "Abmelden" }).click();
      await page.goto("/forgot-password");
      await page.getByLabel("E-Mail", { exact: true }).fill(other);
      await page.getByRole("button", { name: "Reset-Link senden" }).click();
      await expect.poll(() => latestLink(other, "/reset-password"), { message: "Reset-Mail" }).not.toBeNull();
      await page.goto(latestLink(other, "/reset-password")!);
      await page.getByLabel("Neues Passwort").fill(NEW_PASSWORD);
      await page.getByRole("button", { name: "Passwort speichern" }).click();

      await login(page, other, NEW_PASSWORD);
      await expect(page).toHaveURL((url) => url.pathname === "/app");
      await deleteAccount(page, other, NEW_PASSWORD);
    });
  });

  test("K6: Datenschutzerklärung enthält „Missbrauchsschutz Testaccount“ (DE) bzw. „Abuse protection for the trial account“ (EN), in App und Marketing @t277", async ({ page }) => {
    const hosts = [
      { name: "App", origin: baseURL.replace(/\/$/, "") },
      { name: "Marketing", origin: marketingURL },
    ];
    const expected = {
      de: { heading: "Missbrauchsschutz Testaccount", text: /kanonische Form/i },
      en: { heading: "Abuse protection for the trial account", text: /canonical form/i },
    } as const;
    for (const host of hosts) {
      for (const lang of ["de", "en"] as const) {
        const response = await page.goto(`${host.origin}/datenschutz${lang === "en" ? "?lang=en" : ""}`);
        expect(response?.status(), `${host.name} ${lang}`).toBe(200);
        const section = page.locator("section").filter({ has: page.getByRole("heading", { level: 2, name: expected[lang].heading, exact: true }) });
        await expect(section, `${host.name} ${lang}: Abschnitt „${expected[lang].heading}“`).toHaveCount(1);
        await expect(section).toBeVisible();
        expect((await section.innerText()).replace(/\s+/g, " "), `${host.name} ${lang}`).toMatch(expected[lang].text);
      }
    }
  });
});
