import { expect, test, type APIRequestContext, type APIResponse } from "@playwright/test";
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
    await expect(page.locator("#mindmap-canvas")).toBeVisible();

    await page.goto("/account");
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

    await loginForm.getByLabel("Passwort").fill(NEW_PASSWORD);
    await loginForm.getByRole("button", { name: "Anmelden" }).click();
    await expect(page).toHaveURL((url) => url.pathname === "/app");
    await expect(page.locator("#mindmap-canvas")).toBeVisible();
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
