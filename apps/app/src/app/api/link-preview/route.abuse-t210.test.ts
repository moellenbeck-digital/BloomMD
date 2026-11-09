/**
 * Ticket #210 — Missbrauchsfälle der Link-Vorschau (`GET /api/link-preview?url=…`) auf Ebene der echten Route.
 *
 * Ergänzt `apps/app/e2e/link-preview-abuse-t210.spec.ts` um alles, was der Playwright-Stack nicht kann:
 *  - Dort ist das Rate-Limit durch den E2E-Bypass (`BLOOMMD_E2E_AUTH_BYPASS=1`) abgeschaltet, ausgehende Verbindungen
 *    gibt es nicht, und fremde Websites/Dienste sind in der CI tabu. Rate-Limit (K3) sowie Weiterleitung auf eine
 *    interne Adresse und DNS-Rebinding (K4) sind daher nur hier abgedeckt.
 *  - Die Route läuft echt: Handler, Rate-Limit-Zähler (im Speicher, ohne Datenbank), Adressprüfung und Weiterleitungslogik.
 *    Ersetzt wird allein der Transport (`setLinkPreviewTransportForTests`: Namensauflösung und ausgehende Anfrage), damit
 *    nichts das Netz berührt und jede ausgehende Verbindung gezählt werden kann. Authentifizierung und Rate-Limit sind
 *    nicht gemockt.
 *
 * Kriterien (Testtitel tragen K-Nummer und @t210):
 *  K1  Private/reservierte IPv4- und IPv6-Adressen → 422, nur `error`, keine ausgehende Verbindung.
 *  K2  Ungültige/bösartige URLs → 400/422, nur `error`, keine ausgehende Verbindung.
 *  K3  Übermäßiges Volumen → 429 mit `Retry-After`, danach kein ausgehender Abruf (Zählung vor dem Abruf).
 *  K4  Weiterleitung auf interne Adresse, DNS-Rebinding, gemischte Antwort öffentlich+privat → abgelehnt, nichts Internes abgerufen.
 *  K5  Jede Ablehnung hat dieselbe Form: Status 400/422/429, Body nur `{ error }`, `no-store`, kein Seiteninhalt.
 */
import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import {
  setLinkPreviewTransportForTests,
  type LinkPreviewResponse,
  type PinnedTarget,
  type ResolvedAddress,
} from "../../../lib/link-preview";
import { LINK_PREVIEW_RATE_LIMIT } from "../../../lib/link-preview-rate-limit";
import { resetMemoryRateLimitsForTests } from "../../../lib/request-security";
import { GET } from "./route";

const mutableEnv = process.env as Record<string, string | undefined>;
const savedEnv = { ...mutableEnv };

const PUBLIC_ADDRESS: ResolvedAddress = { address: "93.184.216.34", family: 4 };
const SECRET_PAGE = "<html><head><title>GEHEIMER-INHALT</title><meta name=\"description\" content=\"GEHEIMER-INHALT\"></head></html>";

let client = "198.51.100.77";
let outbound: PinnedTarget[] = [];
let resolved: string[] = [];
let errorLog: ReturnType<typeof spyOn<Console, "error">>;
let warnLog: ReturnType<typeof spyOn<Console, "warn">>;

type Page = { status: number; headers?: Record<string, string>; body?: string };

/** Stub the network: `names` maps a host name to the answers of its successive resolutions; `pages` maps "host/path" to a response. */
function stubNetwork(options: { names?: Record<string, ResolvedAddress[][]>; pages?: Record<string, Page> } = {}) {
  setLinkPreviewTransportForTests({
    resolve: async (hostname) => {
      resolved.push(hostname);
      const answers = options.names?.[hostname];
      if (!answers) return [PUBLIC_ADDRESS];
      const seen = resolved.filter((entry) => entry === hostname).length;
      return answers[Math.min(seen, answers.length) - 1] ?? [];
    },
    request: async (target) => {
      outbound.push(target);
      const page = options.pages?.[`${target.url.hostname}${target.url.pathname}`] ?? { status: 200, headers: { "content-type": "text/html" }, body: SECRET_PAGE };
      const response: LinkPreviewResponse = {
        status: page.status,
        headers: page.headers ?? { "content-type": "text/html" },
        read: async () => new TextEncoder().encode(page.body ?? SECRET_PAGE),
        close: () => {},
      };
      return response;
    },
  });
}

const call = (url: string, address = client) =>
  GET(new Request(`https://app.bloommd.test/api/link-preview?url=${encodeURIComponent(url)}`, { headers: { "x-forwarded-for": address } }));

const callRaw = (query: string, address = client) =>
  GET(new Request(`https://app.bloommd.test/api/link-preview${query}`, { headers: { "x-forwarded-for": address } }));

/** K5: the same shape for every refusal — no preview, no page content, no cache. */
async function expectRefusal(response: Response, statuses: number[], message?: RegExp) {
  expect(statuses).toContain(response.status);
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  const text = await response.text();
  const body = JSON.parse(text) as Record<string, unknown>;
  expect(Object.keys(body)).toEqual(["error"]);
  expect(typeof body.error).toBe("string");
  expect(text).not.toContain("GEHEIMER-INHALT");
  if (message) expect(body.error).toMatch(message);
}

beforeEach(() => {
  delete mutableEnv.DATABASE_URL;
  delete mutableEnv.BLOOMMD_TRUSTED_PROXY_HEADER;
  // The E2E bypass switches the rate limit off; this file tests the real one.
  mutableEnv.BLOOMMD_E2E_AUTH_BYPASS = "";
  // Every test gets its own client address, so the in-memory counter of one test never leaks into the next.
  client = `198.51.100.${Math.floor(Math.random() * 200) + 20}`;
  resetMemoryRateLimitsForTests();
  outbound = [];
  resolved = [];
  // Outside a request scope the session lookup logs and counts the caller as anonymous (see accountIdentifier).
  errorLog = spyOn(console, "error").mockImplementation(() => {});
  warnLog = spyOn(console, "warn").mockImplementation(() => {});
  stubNetwork();
});

afterEach(() => {
  errorLog.mockRestore();
  warnLog.mockRestore();
  setLinkPreviewTransportForTests(null);
  resetMemoryRateLimitsForTests();
  for (const key of ["DATABASE_URL", "BLOOMMD_TRUSTED_PROXY_HEADER", "BLOOMMD_E2E_AUTH_BYPASS"]) {
    if (savedEnv[key] === undefined) delete mutableEnv[key];
    else mutableEnv[key] = savedEnv[key];
  }
});

describe("link-preview abuse (route)", () => {
  test("sanity: a public page is previewed, so the refusals below are not an artefact of the stub @t210", async () => {
    const response = await call("https://public.example/page");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ preview: { title: "GEHEIMER-INHALT" } });
    expect(outbound).toHaveLength(1);
  });

  test("K1: private and reserved IPv6 literals are refused without an outbound request @t210", async () => {
    const literals = ["[fc00::1]", "[fe80::1]", "[2001:db8::1]", "[64:ff9b::7f00:1]", "[::]", "[::1]", "[::ffff:127.0.0.1]", "[::ffff:7f00:1]", "[2002:7f00:1::]", "[fec0::1]", "[ff02::1]"];
    for (const literal of literals) {
      await expectRefusal(await call(`http://${literal}/`), [422], /Private network preview URLs are not allowed\./);
    }
    expect(resolved).toEqual([]);
    expect(outbound).toEqual([]);
  });

  test("K1: private and reserved IPv4 literals are refused without an outbound request @t210", async () => {
    const literals = ["0.0.0.0", "127.0.0.1", "10.0.0.1", "172.16.0.1", "172.31.255.255", "192.168.1.1", "100.64.0.1", "169.254.169.254", "255.255.255.255"];
    for (const literal of literals) {
      await expectRefusal(await call(`http://${literal}/`), [422], /Private network preview URLs are not allowed\./);
    }
    // Spellings the URL parser normalizes to a private address.
    for (const url of ["http://2130706433/", "http://0x7f.1/", "http://127.1/", "http://0177.0.0.1/"]) {
      await expectRefusal(await call(url), [422], /Private network preview URLs are not allowed\./);
    }
    expect(resolved).toEqual([]);
    expect(outbound).toEqual([]);
  });

  test("K1: local host names are refused without an outbound request @t210", async () => {
    for (const host of ["localhost", "localhost.", "LOCALHOST", "app.localhost", "printer.local", "foo.internal", "Foo.Internal."]) {
      await expectRefusal(await call(`http://${host}/`), [422], /not allowed/);
    }
    expect(outbound).toEqual([]);
  });

  test("K2: empty, missing and over-long URLs answer 400 and cause no outbound request @t210", async () => {
    await expectRefusal(await callRaw(""), [400], /valid URL is required/);
    await expectRefusal(await callRaw("?url="), [400], /valid URL is required/);
    await expectRefusal(await callRaw("?url=%20%20"), [400], /valid URL is required/);
    const tooLong = `https://public.example/${"a".repeat(2048)}`;
    expect(tooLong.length).toBeGreaterThan(2048);
    await expectRefusal(await call(tooLong), [400], /valid URL is required/);
    expect(outbound).toEqual([]);
  });

  test("K2: a URL of exactly 2048 characters is still accepted as input, 2049 is not @t210", async () => {
    const prefix = "https://public.example/";
    const atLimit = prefix + "a".repeat(2048 - prefix.length);
    expect(atLimit.length).toBe(2048);
    expect((await call(atLimit)).status).toBe(200);
    await expectRefusal(await call(`${atLimit}a`), [400]);
  });

  test("K2: malformed and malicious URLs are refused and cause no outbound request @t210", async () => {
    const urls = [
      "http://",
      "https://",
      "http://[",
      "http://[::1",
      "http://[fc00::1",
      "http://user:pw@public.example/",
      "http://user@public.example/",
      "https://admin:secret@93.184.216.34/",
      "javascript:alert(1)",
      "JavaScript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
      "file:///etc/passwd",
      "ftp://public.example/file.txt",
      "gopher://public.example/",
      "not a url",
      "http://public example/",
      "http://pub\u0001lic.example/",
      "http://public.example\r\nHost: evil.example/",
      "//public.example/",
      "public.example",
    ];
    for (const url of urls) {
      const response = await call(url);
      await expectRefusal(response, [400, 422]);
    }
    expect(outbound).toEqual([]);
  });

  test("K2: control characters and spaces in the path never reach the outbound request raw @t210", async () => {
    // The URL parser drops or percent-encodes them, so the request stays on the named public host and cannot smuggle a header or a second request line.
    for (const url of ["https://public.example/a\u0000b", "https://public.example/a\r\nHost: evil.example", "https://public.example/a b?q=c d", "https://public.example/\u0001\u007f"]) {
      outbound = [];
      const response = await call(url);
      expect([200, 400, 422]).toContain(response.status);
      for (const target of outbound) {
        expect(target.url.hostname).toBe("public.example");
        expect(target.url.href).not.toMatch(/[\u0000-\u0020\u007f]/);
      }
    }
  });

  test("K2: refusals for credentials and schemes name the reason, not the input @t210", async () => {
    const withCredentials = await call("http://user:hunter2@public.example/");
    await expectRefusal(withCredentials, [422]);
    expect(JSON.stringify(await call("http://user:hunter2@public.example/").then((r) => r.json()))).not.toContain("hunter2");
    await expectRefusal(await call("javascript:alert(1)"), [422], /Only HTTP and HTTPS previews are supported\./);
    await expectRefusal(await call("data:text/html,x"), [422], /Only HTTP and HTTPS previews are supported\./);
  });

  test("K3: volume above the anonymous limit answers 429 with Retry-After and then makes no outbound request @t210", async () => {
    const limit = LINK_PREVIEW_RATE_LIMIT.anonymousPerSource;
    expect(limit).toBe(30);
    for (let i = 0; i < limit; i += 1) expect((await call(`https://public.example/page-${i}`)).status).toBe(200);
    expect(outbound).toHaveLength(limit);
    const resolvedBefore = resolved.length;

    for (let i = 0; i < 5; i += 1) {
      const blocked = await call(`https://public.example/over-${i}`);
      await expectRefusal(blocked, [429]);
      const retryAfter = Number(blocked.headers.get("Retry-After"));
      expect(Number.isInteger(retryAfter)).toBe(true);
      expect(retryAfter).toBeGreaterThan(0);
      expect(retryAfter).toBeLessThanOrEqual(LINK_PREVIEW_RATE_LIMIT.windowMs / 1000);
    }
    // The limit is checked first: no name resolution and no outbound connection happened for the refused calls.
    expect(outbound).toHaveLength(limit);
    expect(resolved).toHaveLength(resolvedBefore);
  });

  test("K3: invalid and malicious URLs use up the allowance too, so probing cannot be done for free @t210", async () => {
    const limit = LINK_PREVIEW_RATE_LIMIT.anonymousPerSource;
    for (let i = 0; i < limit; i += 1) expect((await call("http://169.254.169.254/latest/meta-data/")).status).toBe(422);
    const blocked = await call("http://169.254.169.254/latest/meta-data/");
    await expectRefusal(blocked, [429]);
    expect(blocked.headers.get("Retry-After")).not.toBeNull();
    expect(outbound).toEqual([]);
  });

  test("K3: a forged x-forwarded-for entry in front of the real address buys no new allowance @t210", async () => {
    const limit = LINK_PREVIEW_RATE_LIMIT.anonymousPerSource;
    for (let i = 0; i < limit; i += 1) {
      const response = await GET(new Request("https://app.bloommd.test/api/link-preview?url=https%3A%2F%2Fpublic.example%2F", { headers: { "x-forwarded-for": `10.9.8.${i}, ${client}` } }));
      expect(response.status).toBe(200);
    }
    const forged = await GET(new Request("https://app.bloommd.test/api/link-preview?url=https%3A%2F%2Fpublic.example%2F", { headers: { "x-forwarded-for": `10.9.9.9, ${client}` } }));
    await expectRefusal(forged, [429]);
    expect(outbound).toHaveLength(limit);
  });

  test("K3: another address is not affected by the exhausted one @t210", async () => {
    for (let i = 0; i < LINK_PREVIEW_RATE_LIMIT.anonymousPerSource; i += 1) await call("https://public.example/");
    await expectRefusal(await call("https://public.example/"), [429]);
    expect((await call("https://public.example/", "203.0.113.200")).status).toBe(200);
  });

  test("K4: a redirect from a public page to an internal address is not followed @t210", async () => {
    for (const target of ["http://127.0.0.1/admin", "http://169.254.169.254/latest/meta-data/", "http://[::1]/", "http://[fc00::1]/", "http://localhost/", "http://10.0.0.5:8080/", "http://intranet.internal/"]) {
      outbound = [];
      resolved = [];
      stubNetwork({ pages: { "public.example/start": { status: 302, headers: { location: target } } } });
      // http, not https: an https start page would be saved by the downgrade rule alone and hide a missing address check.
      await expectRefusal(await call("http://public.example/start"), [422]);
      // Only the public first hop was requested; the internal target never was.
      expect(outbound.map((entry) => entry.url.hostname)).toEqual(["public.example"]);
    }
  });

  test("K4: a redirect to an internal name that only resolves privately is not followed @t210", async () => {
    stubNetwork({
      names: { "innocent.example": [[{ address: "10.1.2.3", family: 4 }]] },
      pages: { "public.example/start": { status: 301, headers: { location: "https://innocent.example/" } } },
    });
    await expectRefusal(await call("https://public.example/start"), [422], /private network/i);
    expect(outbound.map((entry) => entry.url.hostname)).toEqual(["public.example"]);
  });

  test("K4: DNS rebinding — a name that resolved publicly and now resolves privately is refused on the next hop @t210", async () => {
    stubNetwork({
      names: {
        "rebind.example": [[PUBLIC_ADDRESS], [{ address: "127.0.0.1", family: 4 }]],
      },
      pages: { "rebind.example/start": { status: 302, headers: { location: "https://rebind.example/second" } } },
    });
    await expectRefusal(await call("https://rebind.example/start"), [422], /private network/i);
    // Exactly the first, public connection happened; the second resolution answered privately and nothing was fetched from it.
    expect(outbound).toHaveLength(1);
    expect(outbound[0]!.addresses.map((entry) => entry.address)).toEqual([PUBLIC_ADDRESS.address]);
  });

  test("K4: DNS rebinding — the connection goes to the validated address and the name is resolved only once per hop @t210", async () => {
    stubNetwork({ names: { "rebind.example": [[PUBLIC_ADDRESS], [{ address: "127.0.0.1", family: 4 }]] } });
    const response = await call("https://rebind.example/page");
    expect(response.status).toBe(200);
    expect(resolved.filter((entry) => entry === "rebind.example")).toHaveLength(1);
    expect(outbound).toHaveLength(1);
    expect(outbound[0]!.addresses.map((entry) => entry.address)).toEqual([PUBLIC_ADDRESS.address]);
  });

  test("K4: a mixed answer (public and private) is refused as a whole, whatever the order @t210", async () => {
    const privateAddress: ResolvedAddress = { address: "192.168.0.10", family: 4 };
    for (const answer of [[PUBLIC_ADDRESS, privateAddress], [privateAddress, PUBLIC_ADDRESS], [PUBLIC_ADDRESS, { address: "::1", family: 6 as const }]]) {
      stubNetwork({ names: { "mixed.example": [answer] } });
      await expectRefusal(await call("https://mixed.example/"), [422], /resolves to a private network/);
    }
    expect(outbound).toEqual([]);
  });

  test("K4: a name without any address is refused @t210", async () => {
    stubNetwork({ names: { "empty.example": [[]] } });
    await expectRefusal(await call("https://empty.example/"), [422]);
    expect(outbound).toEqual([]);
  });

  test("K4: a redirect to another scheme or from https to http is refused @t210", async () => {
    for (const target of ["file:///etc/passwd", "ftp://public.example/x", "javascript:alert(1)", "http://public.example/downgrade"]) {
      outbound = [];
      stubNetwork({ pages: { "public.example/start": { status: 302, headers: { location: target } } } });
      await expectRefusal(await call("https://public.example/start"), [422]);
      expect(outbound).toHaveLength(1);
    }
  });

  test("K5: no refusal carries content of the page behind it @t210", async () => {
    // Every internal target would answer with the secret page if it were fetched.
    for (const url of ["http://127.0.0.1/", "http://[fc00::1]/", "http://localhost/", "http://user:pw@public.example/"]) {
      const response = await call(url);
      expect(response.status).toBe(422);
      expect(await response.text()).not.toContain("GEHEIMER-INHALT");
    }
    expect(outbound).toEqual([]);
  });
});
