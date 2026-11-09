/**
 * Ticket #210 — Missbrauchsfälle der Link-Vorschau (`GET /api/link-preview?url=…`) gegen den echten Endpunkt. Alle Fälle tragen @t210.
 * Ergänzt `link-preview-ssrf-t209.spec.ts` (localhost, privates IPv4, ::1, ::ffff:127.0.0.1, ftp/file, normale Nutzung) und doppelt davon nichts.
 *
 * Kriterien (je im Testtitel):
 *  K1  Private/reservierte IPv6- und IPv4-Adressen → 422.
 *  K2  Ungültige/bösartige URLs (leer, zu lang, `http://`, offene `[`, Zugangsdaten, javascript:/data:, Leer-/Steuerzeichen) → 400/422.
 *  K3  Übermäßiges Volumen → 429 mit `Retry-After`, danach kein ausgehender Abruf.            → NUR im Bun-Test, siehe unten.
 *  K4  Weiterleitung auf interne Adresse, DNS-Rebinding, gemischte Antwort öffentlich+privat. → NUR im Bun-Test, siehe unten.
 *  K5  Jede Ablehnung hat dieselbe Form: Status 400/422/429, Body nur `{ error }`, kein Seiteninhalt.
 *
 * Was dieser Spec NICHT abdeckt und warum (kein stilles Weglassen):
 *  - K3 (Rate-Limit) ist im Playwright-Stack nicht prüfbar: Der Stack läuft mit `BLOOMMD_E2E_AUTH_BYPASS=1`, und der Bypass
 *    schaltet das Rate-Limit ab (`assertRateLimit` kehrt bei `isE2EAuthBypassEnabled()` sofort zurück; siehe e2e/README.md).
 *    Ohne Bypass bräuchte der Stack Postgres für Anmeldung und Konto, den der Playwright-Job der CI nicht hat. Abgedeckt ist K3
 *    durch den Bun-Test `src/app/api/link-preview/route.abuse-t210.test.ts` (echter Handler, echter Zähler, 429 + Retry-After,
 *    kein ausgehender Abruf nach dem Limit); er läuft im CI-Job `verify` (`bun run test`).
 *  - K4 braucht eine kontrollierte Gegenstelle bzw. einen Resolver. Localhost ist per Design gesperrt, öffentliche Gegenstellen
 *    (example.com, httpbin.org) sind in der CI tabu, und ein Testmodus-Hook im Produktivcode ist nicht erwünscht. Die Fälle
 *    laufen deshalb im selben Bun-Test über `setLinkPreviewTransportForTests` gegen die echte Route; hier stehen sie als `test.fixme`.
 */
import { expect, test, type APIRequestContext } from "@playwright/test";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${process.env.PLAYWRIGHT_PORT ?? "3211"}`;

type Reply = { status: number; cacheControl: string | null; text: string; body: Record<string, unknown> };

let api: APIRequestContext;

async function getRaw(path: string): Promise<Reply> {
  const response = await api.get(path);
  const text = await response.text();
  let body: Record<string, unknown> = {};
  try {
    body = JSON.parse(text) as Record<string, unknown>;
  } catch {
    // Not JSON: the shape check in expectRefusal fails with the status and text below.
  }
  return { status: response.status(), cacheControl: response.headers()["cache-control"] ?? null, text, body };
}

const preview = (url: string) => getRaw(`/api/link-preview?url=${encodeURIComponent(url)}`);

/** K5: refusal shape — no preview, only `error`, not cacheable, no page content. */
function expectRefusal(reply: Reply, statuses: number[], message?: RegExp) {
  expect(statuses, `Antwort ${reply.status}: ${reply.text.slice(0, 200)}`).toContain(reply.status);
  expect(Object.keys(reply.body)).toEqual(["error"]);
  expect(typeof reply.body.error).toBe("string");
  expect(reply.cacheControl).toBe("private, no-store");
  if (message) expect(reply.body.error).toMatch(message);
}

test.describe("Link-Vorschau Missbrauchsfälle @t210", () => {
  test.beforeAll(async ({ playwright }) => {
    // Anonym: der Endpunkt braucht kein Konto, und der Bypass-Stack zählt hier nicht.
    api = await playwright.request.newContext({ baseURL: BASE_URL });
  });

  test.afterAll(async () => {
    await api?.dispose();
  });

  test("K1: private und reservierte IPv6-Adressen werden abgelehnt @t210", async () => {
    for (const literal of ["[fc00::1]", "[fe80::1]", "[2001:db8::1]", "[64:ff9b::7f00:1]", "[::]", "[fec0::1]", "[ff02::1]", "[::ffff:7f00:1]"]) {
      expectRefusal(await preview(`http://${literal}/`), [422], /Private network preview URLs are not allowed\./);
    }
  });

  test("K1: weitere private und reservierte IPv4-Adressen werden abgelehnt @t210", async () => {
    for (const literal of ["0.0.0.0", "172.16.0.1", "172.31.255.255", "192.168.1.1", "100.64.0.1", "255.255.255.255"]) {
      expectRefusal(await preview(`http://${literal}/`), [422], /Private network preview URLs are not allowed\./);
    }
    // Schreibweisen, die der URL-Parser zu einer privaten Adresse normalisiert.
    for (const url of ["http://2130706433/", "http://0x7f.1/", "http://127.1/"]) {
      expectRefusal(await preview(url), [422], /Private network preview URLs are not allowed\./);
    }
  });

  test("K2: leere, fehlende und überlange URL → 400 @t210", async () => {
    expectRefusal(await getRaw("/api/link-preview"), [400], /valid URL is required/);
    expectRefusal(await getRaw("/api/link-preview?url="), [400], /valid URL is required/);
    expectRefusal(await getRaw("/api/link-preview?url=%20%20"), [400], /valid URL is required/);
    const tooLong = `https://example.invalid/${"a".repeat(2048)}`;
    expect(tooLong.length).toBeGreaterThan(2048);
    expectRefusal(await preview(tooLong), [400], /valid URL is required/);
  });

  test("K2: ungültige und bösartige URLs werden abgelehnt @t210", async () => {
    const urls = [
      "http://",
      "https://",
      "http://[",
      "http://[::1",
      "http://[fc00::1",
      "http://user:pw@example.invalid/",
      "http://user@example.invalid/",
      "https://admin:secret@93.184.216.34/",
      "javascript:alert(1)",
      "JavaScript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
      "gopher://example.invalid/",
      "not a url",
      "http://example invalid/",
      "http://exa\u0001mple.invalid/",
      "http://example.invalid\r\nHost: evil.invalid/",
      "//example.invalid/",
      "example.invalid",
    ];
    for (const url of urls) expectRefusal(await preview(url), [400, 422]);
  });

  test("K2: Zugangsdaten und Schemata werden benannt, die Eingabe nicht wiederholt @t210", async () => {
    const reply = await preview("http://user:hunter2@example.invalid/");
    expectRefusal(reply, [422]);
    expect(reply.text).not.toContain("hunter2");
    expectRefusal(await preview("javascript:alert(1)"), [422], /Only HTTP and HTTPS previews are supported\./);
    expectRefusal(await preview("data:text/html,x"), [422], /Only HTTP and HTTPS previews are supported\./);
  });

  test("K5: eine Ablehnung enthält keinen Seiteninhalt und keine Vorschau @t210", async () => {
    for (const url of ["http://[fc00::1]/", "http://192.168.1.1/", "http://0.0.0.0/", "data:text/html,<title>GEHEIMER-INHALT</title>"]) {
      const reply = await preview(url);
      expectRefusal(reply, [422]);
      expect(reply.body.preview).toBeUndefined();
      expect(reply.text).not.toContain("GEHEIMER-INHALT");
    }
  });

  test.fixme("K3: Volumen über 30/min je Adresse → 429 mit Retry-After, danach kein ausgehender Abruf @t210", async () => {
    // Nicht im Playwright-Stack prüfbar: `BLOOMMD_E2E_AUTH_BYPASS=1` schaltet das Rate-Limit ab (siehe Kopfkommentar).
    // Abgedeckt: apps/app/src/app/api/link-preview/route.abuse-t210.test.ts, Fälle „K3: …“ (Job `verify`).
  });

  test.fixme("K4: Weiterleitung auf interne Adresse, DNS-Rebinding und gemischte Antwort ohne Internet @t210", async () => {
    // Braucht eine kontrollierte Gegenstelle/einen Resolver; localhost ist gesperrt, öffentliche Dienste sind in der CI tabu,
    // und ein Testmodus-Hook im Produktivcode ist nicht erwünscht.
    // Abgedeckt: apps/app/src/app/api/link-preview/route.abuse-t210.test.ts, Fälle „K4: …“ (Job `verify`).
  });
});
