/**
 * Ticket #299 — Plausible-Tracking der App, positive Kriterien gegen den Produktions-Build.
 *
 * Läuft nur mit `playwright.plausible.config.ts` (`bun run test:e2e:plausible`, `PLAYWRIGHT_SERVER_MODE=production`,
 * nach `bun run build`). Die Spec startet selbst, ohne Neubau und ohne Testmodus (`BLOOMMD_E2E_TEST_MODE` schaltet
 * das Tracking ab, deshalb ist es hier leer):
 *   - eine lokale Gegenstelle (nimmt `GET /js/script.js` und `POST /api/event` an und schreibt mit),
 *   - die App zweimal aus demselben Build: erst mit Tracking (`BLOOMMD_PLAUSIBLE_DOMAIN=localhost`,
 *     `BLOOMMD_PLAUSIBLE_TARGET_URL=<Gegenstelle>`, `BLOOMMD_REQUIRE_AUTH=1`), dann mit `BLOOMMD_PLAUSIBLE_DISABLED=true`.
 * Jeder Start nennt das Ziel ausdrücklich, damit nie etwas an ein echtes Ziel geht (auch kein Server-Signal).
 *
 * Kriterien (Ticket #299, Prüfauftrag):
 *   3. Script: 200, JavaScript, ohne Login, auch mit REQUIRE_AUTH; Script-Tag im HTML.
 *   4. Event-Requests beim Seitenaufbau und Navigieren: Routenmuster ohne ID/Token/Query/Hash/Titel, Antwort 202.
 *      Dazu: unbekannte Route `/wiki/privater-titel` → `/other`; feindlicher Request wird bereinigt.
 *   (fremder Host) Script-Tag fehlt, Routen 404.
 *   5. Ziel nicht erreichbar (Gegenstelle gestoppt): Seiten laden unverändert, keine Konsolenfehler, nichts blockiert.
 *   6. Gleicher Build mit `BLOOMMD_PLAUSIBLE_DISABLED=true`: kein Script-Tag, `/_plausible/*` 404, keine Anfrage an
 *      `/_plausible`, Startzeile im Log nennt `BLOOMMD_PLAUSIBLE_DISABLED` (AUS).
 *
 * Nicht prüfbar über die Oberfläche: das anonyme Server-Signal beim Start (hier nie ausgelöst: Ziel ist explizit).
 * Nicht beobachtbar: die Antwort auf den Beacon des Scripts (`sendBeacon`); die 202 wird mit einem gleichartigen
 * `fetch` aus der Seite und mit dem Request-Client belegt.
 *
 * Keine Testdaten: es wird nicht eingeloggt, nichts angelegt, keine Datenbank gebraucht.
 */
import { spawn, type ChildProcess } from "node:child_process";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { expect, test, type Page } from "@playwright/test";

const APP_PORT = Number(process.env.PLAYWRIGHT_PLAUSIBLE_PORT ?? 3611);
const COUNTERPART_PORT = Number(process.env.PLAYWRIGHT_PLAUSIBLE_COUNTERPART_PORT ?? 3612);
const DISABLED_APP_PORT = Number(process.env.PLAYWRIGHT_PLAUSIBLE_DISABLED_PORT ?? 3613);
const SCRIPT_PATH = "/_plausible/js/script.js";
const EVENT_PATH = "/_plausible/api/event";
const TOKEN = "geheimer-Token_0123456789abcdef";

type Recorded = { method: string; url: string; headers: http.IncomingHttpHeaders; body: string };
type Counterpart = { requests: Recorded[]; events: Array<Record<string, unknown>>; stop: () => Promise<void> };
type App = { base: string; log: () => string; stop: () => Promise<void> };

/** Lokale Gegenstelle: nimmt an, was Plausible annimmt, und schreibt alles mit. */
async function startCounterpart(port: number): Promise<Counterpart> {
  const requests: Recorded[] = [];
  const events: Array<Record<string, unknown>> = [];
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf8");
      requests.push({ method: req.method ?? "", url: req.url ?? "", headers: req.headers, body });
      if (req.method === "GET" && req.url === "/js/script.js") {
        res.writeHead(200, { "Content-Type": "application/javascript" }).end("/* gegenstelle */");
      } else if (req.method === "POST" && req.url === "/api/event") {
        try {
          events.push(JSON.parse(body) as Record<string, unknown>);
        } catch {
          // Ungültiges JSON wird mitgeschrieben (requests), aber kein Ereignis.
        }
        res.writeHead(202).end("ok");
      } else {
        res.writeHead(404).end();
      }
    });
  });
  const sockets = new Set<import("node:net").Socket>();
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  expect((server.address() as AddressInfo).port).toBe(port);
  return {
    requests,
    events,
    stop: () =>
      new Promise<void>((resolve) => {
        for (const socket of sockets) socket.destroy();
        server.close(() => resolve());
      }),
  };
}

async function waitUntilReady(base: string, child: ChildProcess, log: () => string) {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`next start beendet (${child.exitCode}):\n${log().slice(-2000)}`);
    try {
      const response = await fetch(`${base}/login`, { redirect: "manual" });
      await response.arrayBuffer();
      if (response.status === 200) return;
    } catch {
      // noch nicht bereit
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`App unter ${base} nicht bereit:\n${log().slice(-2000)}`);
}

/** Der Produktions-Build wird ohne Neubau mit anderem Env gestartet; nur das Env unterscheidet die Starts. */
async function startApp(port: number, plausibleEnv: Record<string, string | undefined>): Promise<App> {
  const base = `http://localhost:${port}`;
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    BLOOMMD_REQUIRE_AUTH: "1",
    BLOOMMD_AUTH_SECRET: "ci-only-auth-secret-that-is-long-and-random",
    BLOOMMD_LOCAL_DEPLOYMENT: "1",
    // Der Testmodus schaltet das Tracking ab, der Bypass wäre ein anderes System als das echte.
    BLOOMMD_E2E_TEST_MODE: "",
    BLOOMMD_E2E_AUTH_BYPASS: "",
    BLOOMMD_PLAUSIBLE_DISABLED: undefined,
    BLOOMMD_PLAUSIBLE_DOMAIN: undefined,
    BLOOMMD_PLAUSIBLE_TARGET_URL: undefined,
    ...plausibleEnv,
  };
  for (const key of Object.keys(env)) if (env[key] === undefined) delete env[key];

  let output = "";
  const child = spawn("bunx", ["next", "start", "-p", String(port)], { cwd: process.cwd(), env, detached: true, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout?.on("data", (chunk: Buffer) => (output += chunk.toString("utf8")));
  child.stderr?.on("data", (chunk: Buffer) => (output += chunk.toString("utf8")));
  const log = () => output;
  await waitUntilReady(base, child, log);

  return {
    base,
    log,
    stop: async () => {
      if (child.exitCode !== null || child.pid === undefined) return;
      const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch {
        // schon beendet
      }
      const timer = setTimeout(() => {
        try {
          if (child.pid !== undefined) process.kill(-child.pid, "SIGKILL");
        } catch {
          // schon beendet
        }
      }, 10_000);
      await exited;
      clearTimeout(timer);
    },
  };
}

type Observed = { consoleErrors: string[]; failedRequests: string[]; plausibleRequests: Array<{ method: string; url: string; postData: string | null }> };

function observe(page: Page): Observed {
  const seen: Observed = { consoleErrors: [], failedRequests: [], plausibleRequests: [] };
  page.on("console", (message) => {
    if (message.type() === "error") seen.consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => seen.consoleErrors.push(`pageerror: ${error.message}`));
  page.on("requestfailed", (request) => seen.failedRequests.push(`${request.method()} ${request.url()} ${request.failure()?.errorText ?? ""}`));
  page.on("request", (request) => {
    if (request.url().includes("/_plausible")) seen.plausibleRequests.push({ method: request.method(), url: request.url(), postData: request.postData() });
  });
  return seen;
}

// Browserhinweis, weil die Seite über http auf einem Host ohne localhost-Ausnahme laufen kann; unabhängig von #299.
function relevantConsoleErrors(errors: string[]) {
  return errors.filter((text) => !/Cross-Origin-Opener-Policy header has been ignored, because the URL's origin was untrustworthy/.test(text));
}

/** Ein Ereignis darf nur n, u und d tragen, und u nur das Routenmuster. */
function expectScrubbedEvent(event: Record<string, unknown>, expectedPath: string) {
  expect(Object.keys(event).sort()).toEqual(["d", "n", "u"]);
  expect(event.n).toBe("pageview");
  expect(event.d).toBe("localhost");
  expect(event.u).toBe(`https://localhost${expectedPath}`);
  const text = JSON.stringify(event);
  for (const secret of [TOKEN, "geheim", "privater", "?", "#", "BloomMD"]) expect(text, `Ereignis enthält "${secret}"`).not.toContain(secret);
}

test.describe.serial("Plausible-Tracking gegen den Produktions-Build @t299", () => {
  let counterpart: Counterpart;
  let app: App;

  test.beforeAll(async () => {
    expect(process.env.PLAYWRIGHT_SERVER_MODE, "Diese Spec braucht den Produktions-Build (PLAYWRIGHT_SERVER_MODE=production)").toBe("production");
    counterpart = await startCounterpart(COUNTERPART_PORT);
    app = await startApp(APP_PORT, {
      BLOOMMD_PLAUSIBLE_DOMAIN: "localhost",
      BLOOMMD_PLAUSIBLE_TARGET_URL: `http://127.0.0.1:${COUNTERPART_PORT}`,
    });
  });

  test.afterAll(async () => {
    await app?.stop();
    await counterpart?.stop();
  });

  test("K3: Script antwortet 200 als JavaScript ohne Login (auch mit REQUIRE_AUTH), Script-Tag steht im HTML @t299", async ({ page, request }) => {
    const script = await request.get(`${app.base}${SCRIPT_PATH}`, { maxRedirects: 0 });
    expect(script.status()).toBe(200);
    expect(script.headers()["content-type"]).toMatch(/javascript/);
    expect(script.headers()["location"]).toBeUndefined();
    expect(script.headers()["set-cookie"]).toBeUndefined();
    expect(await script.text()).toContain("window.plausible");

    // Zum Vergleich: eine geschützte Route verlangt hier wirklich einen Login (REQUIRE_AUTH wirkt).
    const protectedApi = await request.get(`${app.base}/api/mindmaps`, { maxRedirects: 0 });
    expect([301, 302, 303, 307, 308, 401, 403]).toContain(protectedApi.status());

    const html = await (await request.get(`${app.base}/login`)).text();
    expect(html).toMatch(/<script[^>]*src="\/_plausible\/js\/script\.js"[^>]*>/);
    expect(html).toMatch(/data-domain="localhost"/);
    expect(html).toMatch(/data-api="\/_plausible\/api\/event"/);

    await page.goto(`${app.base}/login`);
    const tag = page.locator(`script[src="${SCRIPT_PATH}"]`);
    await expect(tag).toHaveCount(1);
    await expect(tag).toHaveAttribute("data-domain", "localhost");
    await expect(tag).toHaveAttribute("data-api", EVENT_PATH);

    // Startzeile im Server-Log: an, nur auf dem Host localhost, Ziel ist das explizite.
    expect(app.log()).toContain("Plausible-Statistik: AN");
    expect(app.log()).toContain("Browser: AN, nur auf dem Host localhost");
    expect(app.log()).toContain(`Ziel http://127.0.0.1:${COUNTERPART_PORT}`);
    expect(app.log()).toContain("Server-Signal: AUS");

    // Der Seitenaufbau oben ist ein Ereignis; abwarten, damit es nicht in den nächsten Test hineinläuft.
    await expect.poll(() => counterpart.events.length, { timeout: 15_000 }).toBe(1);
  });

  test("K4: Seitenaufbau und Navigation senden Routenmuster ohne ID, Token, Query, Hash und Titel, Antwort 202 @t299", async ({ page, request }) => {
    const seen = observe(page);

    // Jede Navigation ergibt genau ein Ereignis (das Script meldet einen Pfad nur beim Wechsel des Musters). Die
    // Gegenstelle bekommt die Ereignisse asynchron; deshalb zählt der Test kumulativ und wartet auf die genaue Zahl,
    // statt Neues seit einem Zeitpunkt zu vergleichen (ein spätes Ereignis der vorigen Seite verschöbe sonst alles).
    const baseline = counterpart.events.length;
    const expectedPaths: string[] = [];
    async function expectPageview(go: () => Promise<unknown>, expectedPath: string) {
      expectedPaths.push(expectedPath);
      await go();
      await expect.poll(() => counterpart.events.length, { timeout: 15_000, message: `Ereignis für ${expectedPath}` }).toBe(baseline + expectedPaths.length);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(300);
      expect(counterpart.events.length, `genau ein Ereignis je Navigation (nach ${expectedPath})`).toBe(baseline + expectedPaths.length);
      expectScrubbedEvent(counterpart.events[counterpart.events.length - 1], expectedPath);
    }

    // Seitenaufbau (Hartes Laden). `/` und `/app` führen ohne Login auf `/login`.
    await expectPageview(() => page.goto(`${app.base}/`), "/login");
    await expectPageview(() => page.goto(`${app.base}/app`), "/login");
    await expectPageview(() => page.goto(`${app.base}/login?lang=en&next=/app#anker`), "/login");
    await expectPageview(() => page.goto(`${app.base}/signup`), "/signup");
    await expectPageview(() => page.goto(`${app.base}/share/${TOKEN}?x=1#y`), "/share/:token");

    // Navigation ohne Neuladen (History-API wie der Next-Router): Token, Query, Hash und unbekannte Route.
    await expectPageview(() => page.evaluate((token) => history.pushState({}, "Geheimer Titel", `/invite/${token}?lang=en#h`), TOKEN), "/invite/:token");
    await expectPageview(() => page.evaluate(() => history.pushState({}, "", "/wiki/privater-titel?q=geheim#abschnitt")), "/other");
    await expectPageview(() => page.evaluate(() => history.pushState({}, "", "/impressum")), "/impressum");

    // Was der Browser an die eigene Herkunft schickt, ist schon sauber und geht nur an /_plausible/api/event.
    const posts = seen.plausibleRequests.filter((entry) => entry.method === "POST");
    expect(posts.length).toBeGreaterThanOrEqual(8);
    for (const entry of posts) {
      expect(entry.url).toBe(`${app.base}${EVENT_PATH}`);
      const body = JSON.parse(entry.postData ?? "{}") as Record<string, unknown>;
      expect(Object.keys(body).sort()).toEqual(["d", "n", "u"]);
      expect(String(body.u)).toMatch(/^https:\/\/localhost\/[a-z:/-]*$/);
      expect(entry.postData ?? "").not.toContain(TOKEN);
    }
    // Das Script selbst kommt von der eigenen Herkunft, nicht von der Gegenstelle.
    expect(seen.plausibleRequests.some((entry) => entry.method === "GET" && entry.url === `${app.base}${SCRIPT_PATH}`)).toBe(true);
    expect(counterpart.requests.filter((entry) => entry.method === "GET")).toEqual([]);

    // Antwort 202: gleichartiger Request aus der Seite (der Beacon des Scripts liefert keine beobachtbare Antwort).
    const fromPage = await page.evaluate(async (path) => {
      const response = await fetch(path, { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify({ n: "pageview", u: "https://localhost/login", d: "localhost" }) });
      return { status: response.status, setCookie: response.headers.get("set-cookie") };
    }, EVENT_PATH);
    expect(fromPage.status).toBe(202);
    expect(fromPage.setCookie).toBeNull();
    // Ein gültiges Ereignis wird weitergegeben; abwarten, damit der Stand für die nächsten Prüfungen feststeht.
    await expect.poll(() => counterpart.events.length, { timeout: 15_000 }).toBe(baseline + expectedPaths.length + 1);

    // Feindlicher Request: Query, Token, Titel, Properties, Referrer werden verworfen; fremde Ereignisnamen gar nicht erst weitergegeben.
    const beforeHostile = counterpart.events.length;
    const hostile = await request.post(`${app.base}${EVENT_PATH}`, {
      headers: { "Content-Type": "text/plain", Cookie: "session=GEHEIM", Authorization: "Bearer GEHEIM" },
      data: JSON.stringify({ n: "pageview", u: `https://localhost/share/${TOKEN}?x=1#y`, d: "fremd.example", p: { titel: "Geheim" }, r: "https://referrer.example/", $: 5 }),
      maxRedirects: 0,
    });
    expect(hostile.status()).toBe(202);
    expect(hostile.headers()["set-cookie"]).toBeUndefined();
    await expect.poll(() => counterpart.events.length, { timeout: 15_000 }).toBe(beforeHostile + 1);
    expectScrubbedEvent(counterpart.events[counterpart.events.length - 1], "/share/:token");
    const forwarded = counterpart.requests[counterpart.requests.length - 1];
    expect(forwarded.headers["cookie"]).toBeUndefined();
    expect(forwarded.headers["authorization"]).toBeUndefined();

    const beforeUnknown = counterpart.requests.length;
    const unknown = await request.post(`${app.base}${EVENT_PATH}`, { data: JSON.stringify({ n: "custom-event", u: "https://localhost/login", d: "localhost" }), maxRedirects: 0 });
    expect(unknown.status()).toBe(202);
    await page.waitForTimeout(500);
    expect(counterpart.requests.length).toBe(beforeUnknown);

    expect(relevantConsoleErrors(seen.consoleErrors)).toEqual([]);
    const cookies = await page.context().cookies();
    expect(cookies.map((cookie) => cookie.name).filter((name) => /plausible/i.test(name))).toEqual([]);
  });

  test("Fremder Host (127.0.0.1 statt localhost): kein Script-Tag, Routen 404, keine Anfrage an /_plausible @t299", async ({ page, request }) => {
    const foreign = `http://127.0.0.1:${APP_PORT}`;
    const html = await (await request.get(`${foreign}/login`)).text();
    expect(html).not.toContain("data-domain");
    expect(html).not.toContain("/_plausible");

    const script = await request.get(`${foreign}${SCRIPT_PATH}`, { maxRedirects: 0 });
    expect(script.status()).toBe(404);
    expect(script.headers()["location"]).toBeUndefined();
    const event = await request.post(`${foreign}${EVENT_PATH}`, { data: JSON.stringify({ n: "pageview", u: "https://localhost/", d: "localhost" }), maxRedirects: 0 });
    expect(event.status()).toBe(404);

    const before = counterpart.requests.length;
    const seen = observe(page);
    for (const path of ["/login", "/signup"]) await page.goto(`${foreign}${path}`, { waitUntil: "networkidle" });
    expect(seen.plausibleRequests).toEqual([]);
    expect(counterpart.requests.length).toBe(before);
    expect(relevantConsoleErrors(seen.consoleErrors)).toEqual([]);
  });

  test("K5: Ziel nicht erreichbar (Gegenstelle gestoppt): Seiten laden unverändert, keine Konsolenfehler, nichts blockiert @t299", async ({ page, request }) => {
    await counterpart.stop();
    const seen = observe(page);

    for (const path of ["/", "/app", "/login", "/signup"]) {
      const response = await page.goto(`${app.base}${path}`, { waitUntil: "networkidle" });
      expect(response?.status(), `Status von ${path}`).toBe(200);
      await expect(page.locator("body")).toBeVisible();
    }
    await page.goto(`${app.base}/login`, { waitUntil: "networkidle" });
    await expect(page.locator('form[action="/api/auth/login"]')).toBeVisible();
    await page.evaluate(() => history.pushState({}, "", "/signup"));
    await page.waitForTimeout(500);

    // Das Script ist lokal und wird geladen; der Event-POST antwortet trotz totem Ziel mit 202 und blockiert nicht lange.
    const started = Date.now();
    const status = await page.evaluate(async (path) => {
      const response = await fetch(path, { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify({ n: "pageview", u: "https://localhost/login", d: "localhost" }) });
      return response.status;
    }, EVENT_PATH);
    expect(status).toBe(202);
    expect(Date.now() - started, "Antwortzeit bei totem Ziel").toBeLessThan(8_000);
    expect((await request.get(`${app.base}${SCRIPT_PATH}`)).status()).toBe(200);

    expect(seen.plausibleRequests.some((entry) => entry.method === "POST")).toBe(true);
    expect(relevantConsoleErrors(seen.consoleErrors)).toEqual([]);
    expect(seen.failedRequests.filter((entry) => entry.includes("/_plausible"))).toEqual([]);
    // Höchstens eine Logzeile über den Ausfall (einmal je Prozess).
    expect(app.log().match(/Plausible-Ziel .* nicht erreichbar/g)?.length ?? 0).toBeLessThanOrEqual(1);
  });

  test("K6: gleicher Build mit BLOOMMD_PLAUSIBLE_DISABLED=true: kein Script-Tag, /_plausible/* 404, keine Anfrage, Startzeile AUS @t299", async ({ page, request }) => {
    await app.stop();
    const quiet = await startCounterpart(COUNTERPART_PORT);
    const disabled = await startApp(DISABLED_APP_PORT, {
      BLOOMMD_PLAUSIBLE_DISABLED: "true",
      BLOOMMD_PLAUSIBLE_DOMAIN: "localhost",
      BLOOMMD_PLAUSIBLE_TARGET_URL: `http://127.0.0.1:${COUNTERPART_PORT}`,
    });
    try {
      const html = await (await request.get(`${disabled.base}/login`)).text();
      expect(html).not.toContain("data-domain");
      expect(html).not.toContain("/_plausible");

      const script = await request.get(`${disabled.base}${SCRIPT_PATH}`, { maxRedirects: 0 });
      expect(script.status()).toBe(404);
      expect(script.headers()["location"]).toBeUndefined();
      const event = await request.post(`${disabled.base}${EVENT_PATH}`, { data: JSON.stringify({ n: "pageview", u: "https://localhost/", d: "localhost" }), maxRedirects: 0 });
      expect(event.status()).toBe(404);
      expect(event.headers()["location"]).toBeUndefined();

      const seen = observe(page);
      for (const path of ["/", "/app", "/login", "/signup"]) await page.goto(`${disabled.base}${path}`, { waitUntil: "networkidle" });
      await page.evaluate(() => history.pushState({}, "", "/impressum"));
      await page.waitForTimeout(500);
      expect(await page.locator(`script[src*="plausible"], script[data-domain]`).count()).toBe(0);
      expect(seen.plausibleRequests).toEqual([]);
      expect(relevantConsoleErrors(seen.consoleErrors)).toEqual([]);
      expect(quiet.requests, "Anfragen an die Gegenstelle bei abgeschaltetem Tracking").toEqual([]);

      expect(disabled.log()).toContain("BLOOMMD_PLAUSIBLE_DISABLED");
      expect(disabled.log()).toMatch(/Plausible-Statistik: AUS \(BLOOMMD_PLAUSIBLE_DISABLED/);
    } finally {
      await disabled.stop();
      await quiet.stop();
    }
  });
});
