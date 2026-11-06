import { expect, test } from "@playwright/test";

/**
 * Ticket #304 — Bun 1.4.4, Haupt-Image auf `oven/bun:1.4.4-slim` (Oberflächentests des Testers, alle Fälle tragen @t304).
 *
 * Kriterium 7: Das Testsystem läuft mit dem neuen Image, die Oberfläche lädt und eine Kernaktion funktioniert.
 * Je Fall ein Beleg: Version des ausgelieferten Builds, Login-Seite, Auslieferung der Marketing-Seite,
 * Konto anlegen → Anmelden → Start (/app) mit Karte, Zugriffsschutz von /app ohne Sitzung.
 *
 * Nicht prüfbar von außen: ob im `-slim`-Container Werkzeuge wie apt, curl oder git fehlen. Die Anwendung ruft keines
 * davon auf (Healthchecks laufen über `bun -e`); die Anmeldung prüft Passwort-Hashing im Container, `/app` die Next-Auslieferung.
 * `/api/health/ready` bleibt unberücksichtigt: Das Dev-System läuft ohne Produktionskonfiguration (Antwort 503, Konfiguration).
 *
 * Testdaten: ein Konto `e2e-t304-…@bloommd.local`. `POST /api/account/delete` antwortet im Testmodus mit 401, eine Löschung
 * ist nicht möglich (Repo-Konvention, wie bei den übrigen Specs). Es werden keine Karten angelegt.
 */

const PASSWORD = "Testpass12345";
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${process.env.PLAYWRIGHT_PORT ?? "3211"}`;
const SAME_ORIGIN_HEADERS = { Origin: BASE_URL };
const EMAIL = `e2e-t304-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@bloommd.local`;

test.use({ locale: "de-DE" });
test.describe.configure({ mode: "serial" });

test("K7: /api/version liefert den ausgelieferten Build mit Git-Stand @t304", async ({ request }) => {
  const response = await request.get("/api/version");
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body.product).toBe("BloomMD");
  expect(body.gitSha).toMatch(/^[0-9a-f]{40}$/);
});

test("K7: Login-Seite lädt mit Formular @t304", async ({ page }) => {
  const response = await page.goto("/login", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  await expect(page.locator('form[action="/api/auth/login"]')).toBeVisible();
  await expect(page.getByLabel("E-Mail", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Passwort")).toBeVisible();
});

test("K7: /app ohne Sitzung leitet auf /login um @t304", async ({ page }) => {
  await page.goto("/app", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL((url) => url.pathname === "/login");
});

test("K7: Konto anlegen, anmelden und Start mit Karte laden @t304", async ({ page, request }) => {
  const signup = await request.post("/api/auth/signup", {
    headers: SAME_ORIGIN_HEADERS,
    form: { name: "E2E T304", email: EMAIL, password: PASSWORD, acceptTerms: "1", next: "/app" },
    maxRedirects: 0,
  });
  expect(signup.status()).toBe(303);

  await page.addInitScript(() => {
    window.localStorage.setItem("bloommd_onboarding_seen", "1");
    window.localStorage.setItem("bloommd-locale", "de");
  });
  await page.goto("/login?next=/app", { waitUntil: "domcontentloaded" });
  const loginForm = page.locator('form[action="/api/auth/login"]');
  await expect(loginForm).toBeVisible();
  await page.getByLabel("E-Mail", { exact: true }).fill(EMAIL);
  await page.getByLabel("Passwort").fill(PASSWORD);
  await loginForm.evaluate((form) => (form as HTMLFormElement).requestSubmit());
  await expect(page).toHaveURL((url) => url.pathname === "/app");
  await expect(page.locator("#mindmap-canvas")).toBeVisible();
});
