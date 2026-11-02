/**
 * Ticket #208 — Rate limit for the public `/api/link-preview` route (marker `@t208`).
 *
 * Covered here: app route, anonymous and signed-in (criteria 1, 3, 4, 5, 6 (app variant), 7 (app), 8, 9).
 * Not covered, with reason:
 * - Criterion 2 and the marketing half of 6 and 7: the marketing app is not part of the test system
 *   (`deploy hosts` knows only the app host), so its `/api/link-preview` cannot be reached from here.
 * - Criterion 6 for the app uses the same rule (last `X-Forwarded-For` entry is the client address); the test
 *   system is reached without a proxy, so the test sets the header itself. That proves the rule, not the
 *   production proxy chain.
 * - Criterion 9: outbound requests are not observable from the browser. The burst uses a private target
 *   (`127.0.0.1`), which the route refuses with 422 before any outbound request; the 429 must arrive at once.
 *
 * Clients are told apart by the last `X-Forwarded-For` entry. Every test uses its own unused address from
 * 198.18.0.0/15 (benchmark range, never a real client), so no test blocks a real user or another test.
 * The limit window is a fixed UTC minute: bursts start early in a window so they never straddle two.
 *
 * Test data: accounts are created over the API with a unique `e2e-lp-…@bloommd.local` address. On a test-mode
 * system (`BLOOMMD_E2E_AUTH_BYPASS=1`) such an account is session-only (no database user), so there is nothing to
 * delete and `/api/account/delete` answers 401; the editor case uses the browser-local start document, so no server-side map is created.
 *
 * Prerequisite: the rate limit itself is skipped when `BLOOMMD_E2E_AUTH_BYPASS` is on (`assertRateLimit` returns
 * early). The limit cases therefore need a system without the bypass; see the ticket report.
 */
import { expect, test, type APIRequestContext, type APIResponse, type Page } from "@playwright/test";

const PASSWORD = "Testpass12345";
const API_ORIGIN = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${process.env.PLAYWRIGHT_PORT ?? "3211"}`;
const SAME_ORIGIN_HEADERS = { Origin: API_ORIGIN };
const ANONYMOUS_LIMIT = 30;
const ACCOUNT_LIMIT = 120;
const PRIVATE_TARGET = "http://127.0.0.1:3000/app";
const PUBLIC_TARGET = "https://example.com/";

function randomAddress() {
  return `198.${18 + Math.floor(Math.random() * 2)}.${Math.floor(Math.random() * 256)}.${1 + Math.floor(Math.random() * 254)}`;
}

function uniqueEmail(label: string) {
  return `e2e-lp-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@bloommd.local`;
}

function preview(request: APIRequestContext, address: string, target = PRIVATE_TARGET, extraForwarded = "", cookie = "") {
  return request.get(`/api/link-preview?url=${encodeURIComponent(target)}`, {
    headers: { "X-Forwarded-For": extraForwarded ? `${extraForwarded}, ${address}` : address, ...(cookie ? { Cookie: cookie } : {}) },
  });
}

/** Burst start early in a fixed UTC minute so that all requests count in one window. */
async function startInFreshWindow() {
  const elapsed = Date.now() % 60_000;
  if (elapsed > 15_000) await new Promise((resolve) => setTimeout(resolve, 60_000 - elapsed + 500));
}

async function burst(request: APIRequestContext, address: string, count: number, extraForwarded?: () => string, cookie = "") {
  const responses: APIResponse[] = [];
  for (let i = 0; i < count; i += 1) responses.push(await preview(request, address, PRIVATE_TARGET, extraForwarded?.() ?? "", cookie));
  return responses;
}

async function createAccount(request: APIRequestContext, email: string) {
  const response = await request.post("/api/auth/signup", {
    headers: { ...SAME_ORIGIN_HEADERS, "X-Forwarded-For": randomAddress() },
    form: { name: "E2E Test", email, password: PASSWORD, acceptTerms: "1", next: "/app" },
    maxRedirects: 0,
  });
  expect(response.status()).toBe(303);
}

/** Logs in over the API and returns the session as a `Cookie` header value (a `Secure` cookie is not replayed over http by the context). */
async function loginViaApi(request: APIRequestContext, email: string) {
  const response = await request.post("/api/auth/login", {
    headers: { ...SAME_ORIGIN_HEADERS, "X-Forwarded-For": randomAddress() },
    form: { email, password: PASSWORD, next: "/app" },
    maxRedirects: 0,
  });
  expect(response.status()).toBe(303);
  expect(response.headers().location).toContain("/app");
  const cookie = response.headersArray().filter((header) => header.name.toLowerCase() === "set-cookie").map((header) => header.value.split(";")[0]).join("; ");
  expect(cookie).toContain("=");
  return cookie;
}

async function openLoginPage(page: Page, email: string) {
  await page.goto("/login?next=/app", { waitUntil: "domcontentloaded" });
  const loginForm = page.locator('form[action="/api/auth/login"]');
  await expect(loginForm).toBeVisible();
  await page.getByLabel("E-Mail", { exact: true }).fill(email);
  await page.getByLabel("Passwort").fill(PASSWORD);
  await loginForm.evaluate((form) => (form as HTMLFormElement).requestSubmit());
  await expect(page).toHaveURL((url) => url.pathname === "/app");
  await expect(page.locator("#mindmap-canvas")).toBeVisible();
}

test.describe("link-preview rate limit (app) @t208", () => {
  test.describe.configure({ mode: "serial" });

  test("anonymous: 30 requests pass, the 31st is 429 with Retry-After, no-store and a body without address or URL @t208", async ({ request }) => {
    await startInFreshWindow();
    const address = randomAddress();
    const responses = await burst(request, address, ANONYMOUS_LIMIT + 1);

    // Criterion 1: first 30 are served (200 valid public URL, 422 invalid/refused URL), the 31st is limited.
    for (const response of responses.slice(0, ANONYMOUS_LIMIT)) expect([200, 422]).toContain(response.status());
    const limited = responses[ANONYMOUS_LIMIT]!;
    expect(limited.status()).toBe(429);
    const retryAfter = Number(limited.headers()["retry-after"]);
    expect(Number.isInteger(retryAfter)).toBe(true);
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(60);
    expect(limited.headers()["cache-control"]).toBe("private, no-store");

    // Criterion 3: JSON body with `error`, neither address nor requested URL.
    expect(limited.headers()["content-type"]).toContain("application/json");
    const text = await limited.text();
    const body = JSON.parse(text) as { error?: unknown };
    expect(typeof body.error).toBe("string");
    expect((body.error as string).length).toBeGreaterThan(0);
    expect(text).not.toContain(address);
    expect(text).not.toContain("127.0.0.1");
    expect(text).not.toContain(encodeURIComponent(PRIVATE_TARGET));
    expect(text).not.toContain("/app");
  });

  test("anonymous: a limited client is served again after Retry-After @t208", async ({ request }) => {
    test.setTimeout(150_000);
    await startInFreshWindow();
    const address = randomAddress();
    const responses = await burst(request, address, ANONYMOUS_LIMIT + 1);
    const limited = responses[ANONYMOUS_LIMIT]!;
    expect(limited.status()).toBe(429);
    const retryAfter = Number(limited.headers()["retry-after"]);
    expect(retryAfter).toBeLessThanOrEqual(60);

    // Still blocked right before the end of the window...
    expect((await preview(request, address)).status()).toBe(429);
    await new Promise((resolve) => setTimeout(resolve, (retryAfter + 1) * 1000));
    // Criterion 4: ...and served again afterwards (422: the private target is refused, but not limited).
    expect([200, 422]).toContain((await preview(request, address)).status());
  });

  test("two clients do not affect each other @t208", async ({ request }) => {
    await startInFreshWindow();
    const clientA = randomAddress();
    const clientB = randomAddress();
    const responsesA = await burst(request, clientA, ANONYMOUS_LIMIT + 1);
    expect(responsesA[ANONYMOUS_LIMIT]!.status()).toBe(429);

    // Criterion 5: A is limited, B still has its full allowance.
    for (const response of await burst(request, clientB, ANONYMOUS_LIMIT)) expect([200, 422]).toContain(response.status());
    expect((await preview(request, clientB)).status()).toBe(429);
    expect((await preview(request, clientA)).status()).toBe(429);
  });

  test("a forged first X-Forwarded-For entry does not bypass the limit (app variant of criterion 6) @t208", async ({ request }) => {
    await startInFreshWindow();
    const address = randomAddress();
    let counter = 0;
    const forged = () => `203.0.113.${(counter += 1) % 250 + 1}`;
    const responses = await burst(request, address, ANONYMOUS_LIMIT + 1, forged);
    expect(responses[ANONYMOUS_LIMIT]!.status()).toBe(429);
    // Further requests with yet another forged first entry stay limited.
    expect((await preview(request, address, PRIVATE_TARGET, "203.0.113.250")).status()).toBe(429);
  });

  test("signed in: own higher account limit, anonymous counter of the same address untouched @t208", async ({ request, playwright }) => {
    test.setTimeout(150_000);
    const email = uniqueEmail("account");
    const anonymousContext = await playwright.request.newContext({ baseURL: API_ORIGIN });
    try {
      await createAccount(request, email);
      const cookie = await loginViaApi(request, email);
      await startInFreshWindow();
      const sharedAddress = randomAddress();

      // Anonymous allowance of the shared address is used up completely.
      const anonymous = await burst(anonymousContext, sharedAddress, ANONYMOUS_LIMIT + 1);
      expect(anonymous[ANONYMOUS_LIMIT]!.status()).toBe(429);

      // Criterion 8: the account on the same address is not affected and reaches its own, higher limit.
      const accountResponses = await burst(request, sharedAddress, ACCOUNT_LIMIT + 1, undefined, cookie);
      for (const response of accountResponses.slice(0, ACCOUNT_LIMIT)) expect([200, 422]).toContain(response.status());
      const limited = accountResponses[ACCOUNT_LIMIT]!;
      expect(limited.status()).toBe(429);
      expect(limited.headers()["cache-control"]).toBe("private, no-store");
      expect(Number(limited.headers()["retry-after"])).toBeLessThanOrEqual(60);
      expect(await limited.text()).not.toContain(email);

      // The anonymous counter did not move because of the account traffic: still limited, not more.
      expect((await preview(anonymousContext, sharedAddress)).status()).toBe(429);
    } finally {
      await anonymousContext.dispose();
    }
  });

  test("normal use: pasting a link in the editor still shows the preview, also signed in @t208", async ({ page, request }) => {
    const email = uniqueEmail("editor");
    await createAccount(request, email);
    await page.context().setExtraHTTPHeaders({ "X-Forwarded-For": randomAddress() });
    await page.addInitScript(() => window.localStorage.setItem("bloommd_onboarding_seen", "1"));
    await openLoginPage(page, email);

    // The start document is local to the browser: no server-side map is needed and nothing is left behind.
    const node = page.locator('[data-testid="mindmap-node"]').first();
    await expect(node).toBeVisible();
    await node.click();
    await page.getByTestId("node-action-open-editor").click();
    await expect(page.getByTestId("node-editor")).toBeVisible();
    await page.getByTestId("node-kind-select").selectOption("web");
    await page.getByTestId("node-url-input").fill(PUBLIC_TARGET);
    await page.getByTestId("node-url-input").blur();

    const previewResponse = page.waitForResponse((response) => response.url().includes("/api/link-preview"));
    await page.getByRole("button", { name: "Website-Vorschau laden" }).click();
    const response = await previewResponse;
    // Criterion 7 (app): the request is answered and not limited. The test system has no outbound access, so a
    // real preview (200) is only possible elsewhere; here the route answers 422 "Unable to connect" and the editor
    // shows that message instead of a limit error.
    expect([200, 422]).toContain(response.status());
    expect(response.status()).not.toBe(429);
    const payload = (await response.json()) as { preview?: { title?: string }; error?: string };
    if (response.status() === 200) {
      expect(payload.preview?.title).toBeTruthy();
      await expect(page.getByTestId("node-metadata-editor")).toContainText(payload.preview!.title!);
    } else {
      expect(payload.error).not.toMatch(/zu viele versuche/i);
    }
  });
});
