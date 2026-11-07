/**
 * Ticket #299 — Plausible-Tracking der App (First-Party-Proxy /_plausible).
 *
 * Läuft gegen ein laufendes System (`playwright.testsystem.config.ts`, PLAYWRIGHT_BASE_URL). Das Dev-System
 * hat einen Host ungleich `bloommd.app`; dort gelten die negativen Kriterien:
 *   1. Seiten laden ohne Konsolenfehler/CSP-Verletzung, kein Plausible-Script-Tag, keine Anfrage an /_plausible.
 *   2. GET /_plausible/js/script.js und POST /_plausible/api/event ohne Login: 404, keine Weiterleitung.
 *
 * Nicht auf dem Dev-System prüfbar (Host/Ziel nicht passend konfiguriert), siehe `plausible-tracking-local.spec.ts`
 * bzw. den lokalen Lauf: positive Kriterien (Script, Event mit Routenmuster, Ausfall des Ziels, DISABLED).
 * Nicht prüfbar über die Oberfläche: das anonyme Server-Signal beim Start.
 *
 * Keine Testdaten: es wird nicht eingeloggt, nichts angelegt.
 */
import { expect, test, type Page } from "@playwright/test";

const PAGES = ["/", "/app", "/login", "/signup"];

type Observed = { consoleErrors: string[]; cspViolations: string[]; plausibleRequests: string[] };

async function observe(page: Page): Promise<Observed> {
  const seen: Observed = { consoleErrors: [], cspViolations: [], plausibleRequests: [] };
  page.on("console", (message) => {
    const text = message.text();
    // Browserhinweis, weil das Dev-System über http auf einem Cluster-Host (nicht https/localhost) läuft; die
    // Antwort-Header sind unabhängig von #299. Alles andere zählt weiter als Fehler.
    const isCoopHttpNotice = /Cross-Origin-Opener-Policy header has been ignored, because the URL's origin was untrustworthy/.test(text);
    if (message.type() === "error" && !isCoopHttpNotice) seen.consoleErrors.push(text);
    if (/content security policy|violates the following/i.test(text)) seen.cspViolations.push(text);
  });
  page.on("pageerror", (error) => seen.consoleErrors.push(`pageerror: ${error.message}`));
  page.on("request", (request) => {
    if (request.url().includes("/_plausible")) seen.plausibleRequests.push(`${request.method()} ${request.url()}`);
  });
  await page.addInitScript(() => {
    (window as unknown as { __csp: string[] }).__csp = [];
    document.addEventListener("securitypolicyviolation", (event) => {
      (window as unknown as { __csp: string[] }).__csp.push(`${event.violatedDirective} ${event.blockedURI}`);
    });
  });
  return seen;
}

test.describe("Plausible auf dem Dev-System (fremder Host) @t299", () => {
  test("K1: Seiten laden ohne Konsolenfehler/CSP-Verletzung, kein Script-Tag, keine Anfrage an /_plausible @t299", async ({ page, request }) => {
    for (const path of PAGES) {
      // HTML-Quelltext, wie ihn der Server ausliefert (ohne Browser, ohne Weiterleitung abzuschneiden).
      const html = await (await request.get(path)).text();
      expect(html, `Quelltext von ${path}: kein data-domain-Script`).not.toContain("data-domain");
      expect(html, `Quelltext von ${path}: kein /_plausible`).not.toContain("/_plausible");
      expect(html.toLowerCase(), `Quelltext von ${path}: kein plausible`).not.toContain("plausible");
    }

    const seen = await observe(page);
    for (const path of PAGES) {
      await page.goto(path, { waitUntil: "networkidle" });
      await expect(page.locator("body")).toBeVisible();
      expect(await page.locator('script[src*="plausible"], script[data-domain]').count(), `DOM von ${path}: kein Plausible-Script`).toBe(0);
      const csp = await page.evaluate(() => (window as unknown as { __csp?: string[] }).__csp ?? []);
      expect(csp, `CSP-Verletzungen auf ${path}`).toEqual([]);
    }
    expect(seen.cspViolations, "CSP-Meldungen in der Konsole").toEqual([]);
    expect(seen.consoleErrors, "Konsolenfehler").toEqual([]);
    expect(seen.plausibleRequests, "Anfragen an /_plausible").toEqual([]);
  });

  test("K2: /_plausible/* ohne Login antwortet 404 ohne Weiterleitung auf /login @t299", async ({ request }) => {
    const script = await request.get("/_plausible/js/script.js", { maxRedirects: 0 });
    expect(script.status()).toBe(404);
    expect(script.headers()["location"]).toBeUndefined();

    const event = await request.post("/_plausible/api/event", {
      maxRedirects: 0,
      headers: { "Content-Type": "text/plain" },
      data: JSON.stringify({ n: "pageview", u: "https://bloommd.app/", d: "bloommd.app" }),
    });
    expect(event.status()).toBe(404);
    expect(event.headers()["location"]).toBeUndefined();

    // Die interne Route ist von außen nicht erreichbar.
    const internal = await request.get("/plausible-proxy/script", { maxRedirects: 0 });
    expect(internal.status()).toBe(404);
  });
});
