/**
 * Ticket #209 — Link-Vorschau gegen SSRF und DNS-Rebinding gehärtet (`GET /api/link-preview?url=…`). Alle Fälle tragen @t209.
 *
 * Kriterien K1–K7 stehen je im Testtitel:
 *  K1  Öffentliche https-URL → Titel/Beschreibung (echter Endpunkt; die Darstellung im Knoten-Panel deckt `website-preview-t91.spec.ts`).
 *  K2  Private Adresse (127.0.0.1, 10.0.0.1, [::1], 169.254.169.254) → abgelehnt, kein Seiteninhalt.
 *  K3  `localhost`, `localhost.`, `foo.internal` → abgelehnt.
 *  K4  IPv4-mapped `[::ffff:127.0.0.1]` → abgelehnt.
 *  K5  Weiterleitung einer öffentlichen URL auf eine private Adresse → nicht gefolgt.
 *  K6  Schema außer http/https (`ftp://`, `file:///etc/passwd`) → abgelehnt.
 *  K7  Rate-Limit unverändert: normale Nutzung (angemeldet wie anonym) bekommt kein 429.
 *
 * Die Fälle gehen gegen den echten Endpunkt (Antwort 422 mit `error`, nie mit `preview`). Das Testkonto wird einmal
 * angelegt, damit das großzügigere Konto-Limit (120/min) gilt statt des anonymen (30/min je Adresse).
 *
 * Nicht an der Oberfläche prüfbar:
 *  - DNS-Rebinding selbst (Name löst erst öffentlich, dann privat auf): Das deckt `route.test.ts` / `link-preview.test.ts`.
 *  - K1 und K5 brauchen ausgehenden Internetzugang des Systems (öffentliche Gegenstelle bzw. öffentlicher Weiterleiter).
 *    Das Dev-System hat keinen (Verbindungen zu öffentlichen Adressen scheitern sofort mit ECONNREFUSED). Ohne Zugang werden
 *    K1 und K5 mit Begründung übersprungen; „Schutz greift nicht“ lässt sie dagegen fehlschlagen. Als Ersatz läuft die
 *    Gegenprobe K1b: Eine öffentliche Adresse wird nicht als privat abgelehnt, die Anfrage kommt bis zum Verbindungsaufbau
 *    zur geprüften Adresse. Die Weiterleitungsfälle decken `route.test.ts` und `link-preview.test.ts` ab.
 */
import { expect, test, type APIRequestContext } from "@playwright/test";

const PASSWORD = "Testpass12345";
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${process.env.PLAYWRIGHT_PORT ?? "3211"}`;
const SAME_ORIGIN_HEADERS = { Origin: BASE_URL };

const PUBLIC_PAGE = "https://example.com/";
// Öffentlicher Weiterleiter auf eine private Adresse (httpbin leitet per 302 auf `url` weiter).
const REDIRECT_TO_PRIVATE = `https://httpbin.org/redirect-to?url=${encodeURIComponent("http://127.0.0.1/")}&status_code=302`;

type PreviewReply = { status: number; body: { preview?: Record<string, unknown>; error?: string } };

let account: APIRequestContext;
let anonymous: APIRequestContext;
const seenStatuses: number[] = [];

async function preview(api: APIRequestContext, url: string): Promise<PreviewReply> {
  const response = await api.get(`/api/link-preview?url=${encodeURIComponent(url)}`);
  const body = await response.json().catch(() => ({}));
  seenStatuses.push(response.status());
  return { status: response.status(), body };
}

/** Kein ausgehender Internetzugang: Verbindung zu einer öffentlichen Adresse scheitert (oder mehrere Adressen scheitern ohne Text). */
function noEgress(reply: PreviewReply) {
  return reply.status === 422 && /^$|ECONNREFUSED|ENETUNREACH|EHOSTUNREACH|ETIMEDOUT|timed out|ENOTFOUND|EAI_AGAIN|fetch failed/i.test(reply.body.error ?? "");
}

function expectRefused(reply: PreviewReply, message?: RegExp) {
  expect(reply.status).toBe(422);
  expect(reply.body.preview).toBeUndefined();
  expect(typeof reply.body.error).toBe("string");
  // Kein Seiteninhalt: die Antwort besteht nur aus der Fehlermeldung.
  expect(Object.keys(reply.body)).toEqual(["error"]);
  if (message) expect(reply.body.error).toMatch(message);
}

test.describe("Link-Vorschau SSRF-Schutz @t209", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async ({ playwright }) => {
    account = await playwright.request.newContext({ baseURL: BASE_URL });
    anonymous = await playwright.request.newContext({ baseURL: BASE_URL });
    const email = `e2e-t209-${Date.now()}-${Math.random().toString(36).slice(2)}@bloommd.local`;
    const signup = await account.post("/api/auth/signup", {
      headers: SAME_ORIGIN_HEADERS,
      form: { name: "E2E T209", email, password: PASSWORD, acceptTerms: "1", next: "/app" },
      maxRedirects: 0,
    });
    expect(signup.status()).toBe(303);
  });

  test.afterAll(async () => {
    await account?.dispose();
    await anonymous?.dispose();
  });

  test("K1: öffentliche https-URL liefert Titel oder Beschreibung @t209", async () => {
    const reply = await preview(account, PUBLIC_PAGE);
    test.skip(noEgress(reply), `Dev-System hat keinen Internetzugang (Antwort: 422 "${reply.body.error}"); Gegenprobe siehe K1b`);
    expect(reply.status).toBe(200);
    const result = reply.body.preview as { title?: string; description?: string; url?: string };
    expect(result.url).toBe(PUBLIC_PAGE);
    expect(`${result.title ?? ""} ${result.description ?? ""}`).toContain("Example Domain");
  });

  test("K1b: Gegenprobe — eine öffentliche Adresse wird nicht als privat abgelehnt @t209", async () => {
    // 1.1.1.1 ist öffentlich: erlaubt ist 200 oder ein Fehler beim Verbindungsaufbau/Abruf, nie die Ablehnung als privates Ziel.
    const reply = await preview(account, "http://1.1.1.1/");
    expect([200, 422]).toContain(reply.status);
    expect(reply.body.error ?? "").not.toMatch(/private network|not allowed|resolves to a private/i);
  });

  test("K2: private Adressen werden abgelehnt (IPv4 und IPv6, Loopback, privat, Link-Local/Metadaten) @t209", async () => {
    for (const url of ["http://127.0.0.1/", "http://10.0.0.1/", "http://[::1]/", "http://169.254.169.254/"]) {
      expectRefused(await preview(account, url), /Private network preview URLs are not allowed\./);
    }
  });

  test("K3: localhost, localhost. und foo.internal werden abgelehnt @t209", async () => {
    for (const url of ["http://localhost/", "http://localhost./", "http://foo.internal/"]) {
      expectRefused(await preview(account, url), /This preview URL is not allowed\./);
    }
  });

  test("K4: IPv4-mapped IPv6 (::ffff:127.0.0.1) wird abgelehnt @t209", async () => {
    expectRefused(await preview(account, "http://[::ffff:127.0.0.1]/"), /Private network preview URLs are not allowed\./);
  });

  test("K5: Weiterleitung einer öffentlichen URL auf eine private Adresse wird nicht gefolgt @t209", async () => {
    const reply = await preview(account, REDIRECT_TO_PRIVATE);
    test.skip(noEgress(reply), `Dev-System hat keinen Internetzugang (Antwort: 422 "${reply.body.error}"); Ersatz: route.test.ts`);
    // Wäre die Weiterleitung gefolgt worden, käme 200 oder ein Fehler des internen Ziels („Website returned…“, „did not return an HTML page“).
    expectRefused(reply, /not allowed|private network/i);
  });

  test("K6: andere Schemata als http/https werden abgelehnt @t209", async () => {
    for (const url of ["ftp://example.com/datei.txt", "file:///etc/passwd"]) {
      const reply = await preview(account, url);
      expectRefused(reply, /Only HTTP and HTTPS previews are supported\./);
      expect(JSON.stringify(reply.body)).not.toContain("root:");
    }
  });

  test("K7: normale Nutzung läuft nicht ins Rate-Limit (angemeldet und anonym) @t209", async () => {
    for (let i = 0; i < 8; i += 1) {
      const reply = await preview(account, "http://10.0.0.1/");
      expect(reply.status).not.toBe(429);
      expect(reply.status).not.toBe(503);
    }
    for (let i = 0; i < 3; i += 1) {
      const reply = await preview(anonymous, "http://10.0.0.1/");
      expect(reply.status).toBe(422);
    }
    expect(seenStatuses).not.toContain(429);
  });
});
