import { expect, test, type APIRequestContext, type APIResponse } from "@playwright/test";
import { createSqlClient } from "../src/lib/sql-client";
import { purgeUnconfirmedAccounts } from "../src/lib/unconfirmed-accounts";
import { latestLink, readMails } from "./fixtures/mail-outbox";

/**
 * Open self-registration (#104): closed-beta gate off, real database and auth, no bypass.
 * Run with `bun run test:e2e:open-signup`; see playwright.open-signup.config.ts.
 */

const PASSWORD = "Testpass12345";
const NEW_PASSWORD = "AnotherPass67890";
const ORIGIN = process.env.PLAYWRIGHT_OPEN_SIGNUP_BASE_URL ?? `http://localhost:${process.env.PLAYWRIGHT_OPEN_SIGNUP_PORT ?? "3511"}`;

// Limits of SIGNUP_RATE_LIMIT in src/lib/request-security.ts; the E2E restates them on purpose so a
// silent change of the production values shows up here.
const SIGNUP_LIMIT_PER_ACCOUNT = 5;
const SIGNUP_LIMIT_PER_SOURCE = 20;

// MAIL_HOURLY_LIMIT of the server in playwright.open-signup.config.ts (#169). The earlier tests of
// this file send about 30 mails, so the budget is spent only by the cap test at the end.
const MAIL_HOURLY_LIMIT = 50;
const DATABASE_URL = process.env.PLAYWRIGHT_OPEN_SIGNUP_DATABASE_URL ?? process.env.DATABASE_URL;

const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
let counter = 0;

function uniqueEmail(label: string) {
  counter += 1;
  return `e2e-open-${label}-${runId}-${counter}@bloommd.local`;
}

/** A client address nobody else uses, so limits from earlier runs or other tests never interfere. */
function uniqueAddress() {
  const hextet = () => Math.floor(Math.random() * 0xffff).toString(16);
  return `2001:db8:${hextet()}:${hextet()}::${hextet()}`;
}

function signupRequest(request: APIRequestContext, input: { email: string; address: string; extra?: Record<string, string>; consent?: boolean }) {
  return request.post("/api/auth/signup", {
    headers: { Origin: ORIGIN, "X-Forwarded-For": input.address },
    form: {
      name: "Open Signup E2E",
      email: input.email,
      password: PASSWORD,
      next: "/app",
      website: "",
      formStartedAt: String(Date.now() - 2_000),
      ...(input.consent === false ? {} : { acceptTerms: "1" }),
      ...input.extra,
    },
    maxRedirects: 0,
  });
}

function loginRequest(request: APIRequestContext, input: { email: string; password: string; address: string }) {
  return request.post("/api/auth/login", {
    headers: { Origin: ORIGIN, "X-Forwarded-For": input.address },
    form: { email: input.email, password: input.password, next: "/app" },
    maxRedirects: 0,
  });
}

/** Runs `work` with a connection to the suite's own test database. */
async function withDatabase<T>(work: (sql: ReturnType<typeof createSqlClient>) => Promise<T>): Promise<T> {
  if (!DATABASE_URL) throw new Error("PLAYWRIGHT_OPEN_SIGNUP_DATABASE_URL (or DATABASE_URL) is required.");
  const sql = createSqlClient(DATABASE_URL);
  try {
    return await work(sql);
  } finally {
    await sql.end();
  }
}

// The global mail budget lives in the database and outlasts a run: start every run, and leave the
// database, with a fresh one so reruns within the hour neither fail nor block other suites.
const resetMailBudget = () => withDatabase(async (sql) => { await sql`delete from bloom_mail_budget`; });
test.beforeAll(resetMailBudget);

const location = (response: APIResponse) => decodeURIComponent(response.headers().location ?? "");

test.describe("open self-registration, closed-beta gate off", () => {
  const address = uniqueAddress();
  test.use({ extraHTTPHeaders: { "X-Forwarded-For": address } });

  test("registers without an invitation, confirms the email, signs in and resets the password", async ({ page }) => {
    const email = uniqueEmail("flow");

    await page.goto("/signup?next=/app");
    await expect(page.getByTestId("beta-access-gate")).toHaveCount(0);
    await expect(page.getByLabel("Beta-Code (optional)")).toHaveCount(0);
    await expect(page.getByTestId("signup-form")).toBeVisible();

    const consent = page.getByTestId("signup-consent");
    await expect(consent).toHaveAttribute("required", "");
    await expect(page.getByRole("link", { name: "Datenschutzerklärung" })).toHaveAttribute("href", "/datenschutz?lang=de");
    await expect(page.getByRole("link", { name: "AGB" })).toHaveAttribute("href", "/agb?lang=de");

    await page.getByLabel("Name").fill("Open Signup");
    await page.getByLabel("E-Mail").fill(email);
    await page.getByLabel("Passwort").fill(PASSWORD);
    // The form rejects submissions younger than 800 ms (spam signal); typing alone can be faster.
    await page.waitForTimeout(1_000);
    await page.getByTestId("signup-submit").click();
    // Without the consent checkbox the browser blocks the submit and nothing is sent.
    await expect(page).toHaveURL((url) => url.pathname === "/signup");
    expect(await consent.evaluate((input) => (input as HTMLInputElement).validity.valueMissing)).toBe(true);
    expect(readMails(email)).toHaveLength(0);

    await consent.check();
    await page.getByTestId("signup-submit").click();
    await expect(page).toHaveURL((url) => url.pathname === "/login" && url.searchParams.get("verification") === "sent");
    await expect(page.getByRole("status").filter({ hasText: "Bestätigungs" })).toBeVisible();

    // Unconfirmed accounts cannot sign in, even with the right password.
    const loginForm = page.locator('form[action="/api/auth/login"]');
    await loginForm.getByLabel("Passwort").fill(PASSWORD);
    await loginForm.getByRole("button", { name: "Anmelden" }).click();
    await expect(page.getByTestId("login-error")).toContainText("Bitte bestätige zuerst deine E-Mail-Adresse.");
    await expect(page).toHaveURL((url) => url.pathname === "/login");

    await expect.poll(() => latestLink(email, "/api/auth/verify-email")).not.toBeNull();
    await page.goto(latestLink(email, "/api/auth/verify-email")!);
    await expect(page).toHaveURL((url) => url.pathname === "/login" && url.searchParams.get("verified") === "1");

    await loginForm.getByLabel("E-Mail", { exact: true }).fill(email);
    await loginForm.getByLabel("Passwort").fill(PASSWORD);
    await loginForm.getByRole("button", { name: "Anmelden" }).click();
    await expect(page).toHaveURL((url) => url.pathname === "/app");

    // The signed-in session belongs to the confirmed account. (The editor itself is not asserted:
    // with a real database it also needs the sync server, which this suite does not start.)
    await page.goto("/account");
    await expect(page.getByText(email)).toBeVisible();
    await expect(page.getByText("E-Mail-Adresse bestätigt")).toBeVisible();
    await page.getByRole("button", { name: "Abmelden" }).click();

    await page.goto("/forgot-password");
    await page.getByLabel("E-Mail", { exact: true }).fill(email);
    await page.getByRole("button", { name: "Reset-Link senden" }).click();
    await expect(page).toHaveURL((url) => url.pathname === "/login" && url.searchParams.get("reset") === "requested");

    await expect.poll(() => latestLink(email, "/reset-password")).not.toBeNull();
    await page.goto(latestLink(email, "/reset-password")!);
    await page.getByLabel("Neues Passwort").fill(NEW_PASSWORD);
    await page.getByRole("button", { name: "Passwort speichern" }).click();
    await expect(page).toHaveURL((url) => url.pathname === "/login" && url.searchParams.get("reset") === "complete");

    await loginForm.getByLabel("E-Mail", { exact: true }).fill(email);
    await loginForm.getByLabel("Passwort").fill(PASSWORD);
    await loginForm.getByRole("button", { name: "Anmelden" }).click();
    await expect(page.getByTestId("login-error")).toContainText("E-Mail oder Passwort ist falsch.");

    // A failed login does not carry the address back into the form.
    await loginForm.getByLabel("E-Mail", { exact: true }).fill(email);
    await loginForm.getByLabel("Passwort").fill(NEW_PASSWORD);
    await loginForm.getByRole("button", { name: "Anmelden" }).click();
    await expect(page).toHaveURL((url) => url.pathname === "/app");
    await page.goto("/account");
    await expect(page.getByText("E-Mail-Adresse bestätigt")).toBeVisible();
  });

  test("enforces the consent on the server and sends no mail without it", async ({ request }) => {
    const email = uniqueEmail("consent");

    for (const extra of [{}, { acceptTerms: "" }, { acceptTerms: "on" }]) {
      const response = await signupRequest(request, { email, address, consent: false, extra });
      expect(response.status()).toBe(303);
      expect(location(response)).toContain("/signup");
      expect(location(response)).toContain("Bitte stimme der Datenschutzerklärung und den AGB zu.");
    }
    expect(readMails(email)).toHaveLength(0);

    const login = await loginRequest(request, { email, password: PASSWORD, address });
    expect(login.headers()["set-cookie"]).toBeUndefined();
  });

  test("keeps unconfirmed accounts out: no session at signup, no login before confirmation", async ({ request }) => {
    const email = uniqueEmail("unconfirmed");

    const signup = await signupRequest(request, { email, address });
    expect(signup.status()).toBe(303);
    expect(location(signup)).toContain("/login");
    expect(location(signup)).toContain("verification=sent");
    expect(signup.headers()["set-cookie"]).toBeUndefined();

    const login = await loginRequest(request, { email, password: PASSWORD, address });
    expect(login.status()).toBe(303);
    expect(location(login)).toContain("Bitte bestätige zuerst deine E-Mail-Adresse.");
    expect(login.headers()["set-cookie"]).toBeUndefined();

    const protectedApi = await request.get("/api/mindmaps");
    expect(protectedApi.status()).toBe(401);
  });
});

test.describe("signup rate limits against mass registration", () => {
  test("stops repeated signups for one address, even from different sources", async ({ request }) => {
    const email = uniqueEmail("repeat");

    for (let attempt = 0; attempt < SIGNUP_LIMIT_PER_ACCOUNT; attempt += 1) {
      const response = await signupRequest(request, { email, address: uniqueAddress() });
      expect(location(response)).toContain("verification=sent");
    }

    const blocked = await signupRequest(request, { email, address: uniqueAddress() });
    expect(blocked.status()).toBe(303);
    expect(location(blocked)).toContain("/signup");
    expect(location(blocked)).toContain("Zu viele Versuche");
    expect(Number(blocked.headers()["retry-after"])).toBeGreaterThan(0);
  });

  test("stops many different addresses from one source and leaves other sources alone", async ({ request }) => {
    const address = uniqueAddress();

    for (let attempt = 0; attempt < SIGNUP_LIMIT_PER_SOURCE; attempt += 1) {
      const response = await signupRequest(request, { email: uniqueEmail(`bulk${attempt}`), address });
      expect(location(response), `signup ${attempt + 1}`).toContain("verification=sent");
    }

    const extraEmail = uniqueEmail("bulk-extra");
    const blocked = await signupRequest(request, { email: extraEmail, address });
    expect(blocked.status()).toBe(303);
    expect(location(blocked)).toContain("Zu viele Versuche");
    expect(Number(blocked.headers()["retry-after"])).toBeGreaterThan(0);
    expect(readMails(extraEmail)).toHaveLength(0);

    const otherSource = await signupRequest(request, { email: uniqueEmail("bulk-other"), address: uniqueAddress() });
    expect(location(otherSource)).toContain("verification=sent");
  });
});

test.describe("cleanup of unconfirmed accounts (#169)", () => {
  test("deletes old unconfirmed accounts with their tokens and leaves confirmed and young ones alone", async ({ request }) => {
    const oldUnconfirmed = uniqueEmail("purge-old");
    const youngUnconfirmed = uniqueEmail("purge-young");
    const oldConfirmed = uniqueEmail("purge-confirmed");
    for (const email of [oldUnconfirmed, youngUnconfirmed, oldConfirmed]) {
      const response = await signupRequest(request, { email, address: uniqueAddress() });
      expect(location(response), email).toContain("verification=sent");
    }
    const confirmation = await request.get(latestLink(oldConfirmed, "/api/auth/verify-email")!, { maxRedirects: 0 });
    expect(location(confirmation)).toContain("verified=1");

    const count = (sql: ReturnType<typeof createSqlClient>, table: "bloom_users" | "bloom_auth_tokens", email: string) =>
      table === "bloom_users"
        ? sql`select count(*)::int as n from bloom_users where lower(email) = ${email}`.then((rows) => Number(rows[0]?.n))
        : sql`select count(*)::int as n from bloom_auth_tokens where lower(email) = ${email}`.then((rows) => Number(rows[0]?.n));

    await withDatabase(async (sql) => {
      // Age two of the three accounts past the 7 days; the third stays young.
      await sql`update bloom_users set created_at = now() - interval '8 days' where lower(email) = ${oldUnconfirmed} or lower(email) = ${oldConfirmed}`;
      expect(await count(sql, "bloom_auth_tokens", oldUnconfirmed)).toBeGreaterThan(0);

      const dryRun = await purgeUnconfirmedAccounts(sql, { dryRun: true });
      expect(dryRun).toMatchObject({ dryRun: true, days: 7 });
      expect(dryRun.accounts).toBeGreaterThanOrEqual(1);
      expect(await count(sql, "bloom_users", oldUnconfirmed)).toBe(1);

      const applied = await purgeUnconfirmedAccounts(sql, { dryRun: false });
      expect(applied.dryRun).toBe(false);
      expect(applied.accounts).toBeGreaterThanOrEqual(1);

      expect(await count(sql, "bloom_users", oldUnconfirmed)).toBe(0);
      expect(await count(sql, "bloom_auth_tokens", oldUnconfirmed)).toBe(0);
      expect(await count(sql, "bloom_users", youngUnconfirmed)).toBe(1);
      expect(await count(sql, "bloom_auth_tokens", youngUnconfirmed)).toBeGreaterThan(0);
      expect(await count(sql, "bloom_users", oldConfirmed)).toBe(1);
    });

    // The confirmed account still signs in, the deleted address can register again.
    const login = await loginRequest(request, { email: oldConfirmed, password: PASSWORD, address: uniqueAddress() });
    expect(login.headers()["set-cookie"]).toContain("bloommd_session=");
    const again = await signupRequest(request, { email: oldUnconfirmed, address: uniqueAddress() });
    expect(location(again)).toContain("verification=sent");
  });
});

test.describe("global cap for account mails (#169)", () => {
  test.afterAll(resetMailBudget);

  test("refuses the registration at the hourly cap, sends no mail and counts in the database", async ({ request }) => {
    test.setTimeout(240_000);
    let accepted = 0;
    let refused: { email: string; response: APIResponse } | null = null;

    for (let attempt = 0; attempt <= MAIL_HOURLY_LIMIT && !refused; attempt += 1) {
      const email = uniqueEmail(`cap${attempt}`);
      const response = await signupRequest(request, { email, address: uniqueAddress() });
      if (location(response).includes("vorübergehend nicht verfügbar")) refused = { email, response };
      else {
        expect(location(response), `signup ${attempt + 1}`).toContain("verification=sent");
        expect(readMails(email), `mail ${attempt + 1}`).toHaveLength(1);
        accepted += 1;
      }
    }

    expect(refused, "the cap was never reached").not.toBeNull();
    const { email, response } = refused!;
    expect(accepted).toBeGreaterThan(0);
    expect(response.status()).toBe(303);
    expect(location(response)).toContain("/signup");
    expect(location(response)).toContain("Die Registrierung ist vorübergehend nicht verfügbar.");
    expect(Number(response.headers()["retry-after"])).toBeGreaterThan(0);
    expect(response.headers()["set-cookie"]).toBeUndefined();

    // No mail and no account for the refused address: the outbox is empty and it cannot sign in.
    expect(readMails(email)).toHaveLength(0);
    const login = await loginRequest(request, { email, password: PASSWORD, address: uniqueAddress() });
    expect(login.headers()["set-cookie"]).toBeUndefined();
    expect(location(login)).toContain("E-Mail oder Passwort ist falsch.");

    // The counter in the database is the evidence: both windows stand exactly at their limit.
    await withDatabase(async (sql) => {
      const rows = await sql`select scope, max(sent)::int as sent from bloom_mail_budget group by scope`;
      const sent = Object.fromEntries(rows.map((row) => [String(row.scope), Number(row.sent)]));
      expect(sent.hour).toBe(MAIL_HOURLY_LIMIT);
      expect(sent.day).toBe(MAIL_HOURLY_LIMIT);
    });
  });
});
