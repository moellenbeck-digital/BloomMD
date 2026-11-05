import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { MAX_PLAUSIBLE_EVENT_BYTES } from "./plausible";
import { proxyPlausibleEvent, proxyPlausibleScript, resetPlausibleFailureLog } from "./plausible-proxy";

type Received = { url: string; method: string; headers: Record<string, string>; body: string };
let received: Received[] = [];
let stub: ReturnType<typeof Bun.serve> | null = null;
let stubStatus = 202;

function startStub() {
  stub = Bun.serve({
    port: 0,
    async fetch(request) {
      received.push({
        url: new URL(request.url).pathname,
        method: request.method,
        headers: Object.fromEntries(request.headers.entries()),
        body: await request.text(),
      });
      return new Response("ok", { status: stubStatus });
    },
  });
  return `http://127.0.0.1:${stub.port}`;
}

let warn: ReturnType<typeof spyOn<Console, "warn">>;
beforeEach(() => {
  received = [];
  stubStatus = 202;
  resetPlausibleFailureLog();
  warn = spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(() => {
  void stub?.stop(true);
  stub = null;
  warn.mockRestore();
});

function eventRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request("https://bloommd.app/_plausible/api/event", {
    method: "POST",
    headers: { host: "bloommd.app", "content-type": "text/plain", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const pageview = { n: "pageview", u: "https://bloommd.app/", d: "bloommd.app" };

describe("event proxy towards a reachable target", () => {
  test("answers 202 no-store and forwards only User-Agent, X-Forwarded-For and the content type", async () => {
    const target = startStub();
    const env = { BLOOMMD_PLAUSIBLE_TARGET_URL: target };
    const response = await proxyPlausibleEvent(
      eventRequest(pageview, {
        "user-agent": "Mozilla/5.0 Test",
        "x-forwarded-for": "203.0.113.7",
        cookie: "bloommd_session=secret",
        authorization: "Bearer bloom_pat_secret",
        referer: "https://bloommd.app/app?file=private.md",
        "x-bloommd-locale": "de",
      }),
      env,
    );
    expect(response.status).toBe(202);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(received).toHaveLength(1);
    const [call] = received;
    expect(call?.method).toBe("POST");
    expect(call?.url).toBe("/api/event");
    expect(call?.headers["user-agent"]).toBe("Mozilla/5.0 Test");
    expect(call?.headers["x-forwarded-for"]).toBe("203.0.113.7");
    expect(call?.headers["content-type"]).toBe("text/plain");
    for (const name of ["cookie", "authorization", "referer", "x-bloommd-locale"]) expect(call?.headers[name]).toBeUndefined();
    expect(JSON.parse(call?.body ?? "")).toEqual(pageview);
  });

  test("scrubs on the way: normalized URL, no properties, no referrer, unknown fields dropped", async () => {
    const target = startStub();
    const env = { BLOOMMD_PLAUSIBLE_TARGET_URL: target };
    await proxyPlausibleEvent(
      eventRequest({
        n: "pageview",
        u: "https://bloommd.app/app?file=Gehaltsliste.md&workspace=11111111-1111-4111-8111-111111111111#node-7",
        d: "bloommd.app",
        r: "https://bloommd.app/share/bloom_share_secret",
        p: { userId: "u-1", workspaceId: "w-1", fileName: "Gehaltsliste.md" },
        m: "{\"email\":\"a@example.test\"}",
      }),
      env,
    );
    expect(JSON.parse(received[0]?.body ?? "")).toEqual({ n: "pageview", u: "https://bloommd.app/app", d: "bloommd.app" });
    const wire = received[0]?.body ?? "";
    for (const leak of ["Gehaltsliste", "11111111", "secret", "node-7", "userId", "a@example.test"]) expect(wire).not.toContain(leak);
  });

  test("an unknown event is accepted with 202 but never forwarded", async () => {
    const target = startStub();
    const env = { BLOOMMD_PLAUSIBLE_TARGET_URL: target };
    const response = await proxyPlausibleEvent(eventRequest({ n: "search", u: "https://bloommd.app/app", p: { q: "steuer" } }), env);
    expect(response.status).toBe(202);
    expect(received).toHaveLength(0);
  });

  test("our own host without a configured target goes to the default target, not to a custom one", async () => {
    const calls: string[] = [];
    const response = await proxyPlausibleEvent(eventRequest(pageview), {}, async (url) => {
      calls.push(url);
      return new Response(null, { status: 202 });
    });
    expect(response.status).toBe(202);
    expect(calls).toEqual(["https://ping.bloommd.app/api/event"]);
  });

  test("oversized bodies are refused with 413, declared or streamed, and never forwarded", async () => {
    const target = startStub();
    const env = { BLOOMMD_PLAUSIBLE_TARGET_URL: target };
    const big = JSON.stringify({ n: "pageview", u: "https://bloommd.app/", pad: "x".repeat(MAX_PLAUSIBLE_EVENT_BYTES) });
    expect((await proxyPlausibleEvent(eventRequest(big), env)).status).toBe(413);
    expect((await proxyPlausibleEvent(eventRequest(pageview, { "content-length": String(MAX_PLAUSIBLE_EVENT_BYTES + 1) }), env)).status).toBe(413);
    expect(received).toHaveLength(0);
  });

  test("a body that is not JSON is a 400", async () => {
    const target = startStub();
    expect((await proxyPlausibleEvent(eventRequest("not json"), { BLOOMMD_PLAUSIBLE_TARGET_URL: target })).status).toBe(400);
    expect(received).toHaveLength(0);
  });
});

describe("hosts and switch: the proxy answers 404 where tracking does not apply", () => {
  const foreign = (path: string, method: string) =>
    new Request(`https://notes.customer.example${path}`, { method, headers: { host: "notes.customer.example" }, body: method === "POST" ? JSON.stringify(pageview) : undefined });

  test("foreign host: script 404, event 404, nothing sent to the default target", async () => {
    const calls: string[] = [];
    const fetchImpl = async (url: string) => {
      calls.push(url);
      return new Response(null, { status: 202 });
    };
    expect(proxyPlausibleScript(foreign("/_plausible/js/script.js", "GET"), {}).status).toBe(404);
    const event = await proxyPlausibleEvent(foreign("/_plausible/api/event", "POST"), {}, fetchImpl);
    expect(event.status).toBe(404);
    expect(event.headers.get("cache-control")).toContain("no-store");
    expect(calls).toEqual([]);
  });

  test("foreign domain with the default target (no explicit target): 404, nothing sent", async () => {
    const calls: string[] = [];
    const env = { BLOOMMD_PLAUSIBLE_DOMAIN: "notes.customer.example" };
    const event = await proxyPlausibleEvent(foreign("/_plausible/api/event", "POST"), env, async (url) => {
      calls.push(url);
      return new Response(null, { status: 202 });
    });
    expect(event.status).toBe(404);
    expect(proxyPlausibleScript(foreign("/_plausible/js/script.js", "GET"), env).status).toBe(404);
    expect(calls).toEqual([]);
  });

  test("switched off: 404 on our own host, nothing sent", async () => {
    const calls: string[] = [];
    const env = { BLOOMMD_PLAUSIBLE_DISABLED: "true" };
    const event = await proxyPlausibleEvent(eventRequest(pageview), env, async (url) => {
      calls.push(url);
      return new Response(null, { status: 202 });
    });
    expect(event.status).toBe(404);
    expect(proxyPlausibleScript(new Request("https://bloommd.app/_plausible/js/script.js", { headers: { host: "bloommd.app" } }), env).status).toBe(404);
    expect(calls).toEqual([]);
  });
});

describe("script", () => {
  test("on our own host: 200, JavaScript, short cache, no upstream request", () => {
    const response = proxyPlausibleScript(new Request("https://bloommd.app/_plausible/js/script.js", { headers: { host: "bloommd.app" } }), {});
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("javascript");
    expect(response.headers.get("cache-control")).toBe("public, max-age=3600");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });
});

describe("fail-safe: the target is not reachable, slow or broken", () => {
  test("connection refused: 202, no error for the browser, one log line", async () => {
    const response = await proxyPlausibleEvent(eventRequest(pageview), { BLOOMMD_PLAUSIBLE_TARGET_URL: "http://127.0.0.1:1" });
    expect(response.status).toBe(202);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(warn).toHaveBeenCalledTimes(1);
  });

  test("timeout and DNS failure: 202, and the log stays at one line over many failures", async () => {
    const failing = async () => {
      throw new DOMException("The operation timed out.", "TimeoutError");
    };
    for (let i = 0; i < 5; i++) {
      expect((await proxyPlausibleEvent(eventRequest(pageview), {}, failing)).status).toBe(202);
    }
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain("TimeoutError");
  });

  test("a hanging target ends after the short timeout, not after the browser gave up", async () => {
    const hanging = Bun.serve({ port: 0, fetch: () => new Promise<Response>(() => undefined) });
    const started = Date.now();
    try {
      const response = await proxyPlausibleEvent(eventRequest(pageview), { BLOOMMD_PLAUSIBLE_TARGET_URL: `http://127.0.0.1:${hanging.port}` });
      expect(response.status).toBe(202);
      expect(Date.now() - started).toBeLessThan(4_500);
    } finally {
      void hanging.stop(true);
    }
  }, 8_000);

  test("the target answers 500: still 202 for the browser, one log line", async () => {
    stubStatus = 500;
    const target = startStub();
    const env = { BLOOMMD_PLAUSIBLE_TARGET_URL: target };
    expect((await proxyPlausibleEvent(eventRequest(pageview), env)).status).toBe(202);
    expect((await proxyPlausibleEvent(eventRequest(pageview), env)).status).toBe(202);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  test("a redirect from the target is not followed", async () => {
    const calls: string[] = [];
    const response = await proxyPlausibleEvent(eventRequest(pageview), {}, async (url, init) => {
      calls.push(url);
      expect(init?.redirect).toBe("manual");
      return new Response(null, { status: 302, headers: { location: "https://evil.example/" } });
    });
    expect(response.status).toBe(202);
    expect(calls).toHaveLength(1);
  });

  test("the script does not depend on the target at all", () => {
    const response = proxyPlausibleScript(new Request("https://bloommd.app/_plausible/js/script.js", { headers: { host: "bloommd.app" } }), {
      BLOOMMD_PLAUSIBLE_TARGET_URL: "http://127.0.0.1:1",
    });
    expect(response.status).toBe(200);
    expect(warn).not.toHaveBeenCalled();
  });
});
