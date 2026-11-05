import { describe, expect, test } from "bun:test";
import {
  DEFAULT_PLAUSIBLE_PROXY_TARGET,
  MAX_PLAUSIBLE_EVENT_BYTES,
  plausibleEventRequestHeaders,
  plausibleProxyTarget,
  proxyPlausibleEvent,
  proxyPlausibleScript,
} from "./plausible-proxy";

type Call = { url: string; init?: RequestInit };

function recordingFetch(response: () => Response) {
  const calls: Call[] = [];
  const fetchImpl = async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return response();
  };
  return { calls, fetchImpl };
}

const eventBody = JSON.stringify({ n: "pageview", u: "https://bloommd.io/", d: "bloommd.io" });

function eventRequest(headers: Record<string, string> = {}, body: BodyInit = eventBody) {
  return new Request("https://bloommd.io/_plausible/api/event", { method: "POST", headers, body });
}

describe("Plausible proxy target", () => {
  test("defaults to the Ops instance", () => {
    expect(DEFAULT_PLAUSIBLE_PROXY_TARGET).toBe("https://plausible.ops.moellenbeck-digital.io");
    expect(plausibleProxyTarget({})).toBe(DEFAULT_PLAUSIBLE_PROXY_TARGET);
  });

  test("accepts an http(s) override and keeps only its origin", () => {
    expect(plausibleProxyTarget({ PLAUSIBLE_PROXY_TARGET: "http://127.0.0.1:4399/some/path" })).toBe("http://127.0.0.1:4399");
  });

  test("falls back to the default for anything else", () => {
    for (const value of ["", "  ", "not a url", "file:///etc/passwd", "javascript:alert(1)"]) {
      expect(plausibleProxyTarget({ PLAUSIBLE_PROXY_TARGET: value })).toBe(DEFAULT_PLAUSIBLE_PROXY_TARGET);
    }
  });
});

describe("Plausible event proxy", () => {
  test("forwards User-Agent and X-Forwarded-For to the instance", async () => {
    const { calls, fetchImpl } = recordingFetch(() => new Response("ok", { status: 202 }));
    const response = await proxyPlausibleEvent(
      eventRequest({ "user-agent": "Mozilla/5.0 Test", "x-forwarded-for": "203.0.113.7", "content-type": "text/plain" }),
      {},
      fetchImpl,
    );

    expect(response.status).toBe(202);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://plausible.ops.moellenbeck-digital.io/api/event");
    expect(calls[0].init?.method).toBe("POST");
    const headers = new Headers(calls[0].init?.headers);
    expect(headers.get("user-agent")).toBe("Mozilla/5.0 Test");
    expect(headers.get("x-forwarded-for")).toBe("203.0.113.7");
    expect(new TextDecoder().decode(calls[0].init?.body as ArrayBuffer)).toBe(eventBody);
  });

  test("never forwards cookies, authorization or internal headers", () => {
    const headers = plausibleEventRequestHeaders(eventRequest({
      cookie: "session=secret",
      authorization: "Bearer secret",
      "x-bloommd-plausible-proxy": "1",
      "x-bloommd-pathname": "/_plausible/api/event",
      "user-agent": "UA",
    }));
    expect([...headers.keys()].sort()).toEqual(["content-type", "user-agent"]);
  });

  test("omits headers the browser did not send and defaults the content type", () => {
    const headers = plausibleEventRequestHeaders(new Request("https://bloommd.io/_plausible/api/event", { method: "POST" }));
    expect(headers.get("content-type")).toBe("text/plain");
    expect(headers.has("x-forwarded-for")).toBe(false);
  });

  test("is never cacheable and returns the status of the instance", async () => {
    for (const status of [202, 400, 401]) {
      const { fetchImpl } = recordingFetch(() => new Response("x", { status, headers: { "cache-control": "public, max-age=86400" } }));
      const response = await proxyPlausibleEvent(eventRequest(), {}, fetchImpl);
      expect(response.status).toBe(status);
      expect(response.headers.get("cache-control")).toBe("no-store, max-age=0");
    }
  });

  test("uses the configured target", async () => {
    const { calls, fetchImpl } = recordingFetch(() => new Response("ok", { status: 202 }));
    await proxyPlausibleEvent(eventRequest(), { PLAUSIBLE_PROXY_TARGET: "http://127.0.0.1:4399" }, fetchImpl);
    expect(calls[0].url).toBe("http://127.0.0.1:4399/api/event");
  });

  test("rejects oversized bodies without calling the instance", async () => {
    const { calls, fetchImpl } = recordingFetch(() => new Response("ok", { status: 202 }));
    const response = await proxyPlausibleEvent(eventRequest({}, "x".repeat(MAX_PLAUSIBLE_EVENT_BYTES + 1)), {}, fetchImpl);
    expect(response.status).toBe(413);
    expect(calls).toHaveLength(0);
  });

  test("answers 502 when the instance is unreachable or redirects", async () => {
    const unreachable = await proxyPlausibleEvent(eventRequest(), {}, async () => { throw new Error("ECONNREFUSED"); });
    expect(unreachable.status).toBe(502);
    expect(unreachable.headers.get("cache-control")).toBe("no-store, max-age=0");

    const redirect = await proxyPlausibleEvent(eventRequest(), {}, async () => new Response(null, { status: 302, headers: { location: "https://elsewhere.example/" } }));
    expect(redirect.status).toBe(502);
    expect(redirect.headers.get("location")).toBeNull();
  });
});

describe("Plausible script proxy", () => {
  test("serves the script of the instance with a short cache", async () => {
    const { calls, fetchImpl } = recordingFetch(() => new Response("/* plausible */", { status: 200, headers: { "content-type": "application/javascript", "set-cookie": "x=1" } }));
    const response = await proxyPlausibleScript({}, fetchImpl);

    expect(calls[0].url).toBe("https://plausible.ops.moellenbeck-digital.io/js/script.js");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/javascript");
    expect(response.headers.get("cache-control")).toBe("public, max-age=3600");
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(await response.text()).toBe("/* plausible */");
  });

  test("answers 502 without caching when the instance fails", async () => {
    for (const fetchImpl of [
      async () => new Response("nope", { status: 500 }),
      async () => { throw new Error("ENOTFOUND"); },
    ]) {
      const response = await proxyPlausibleScript({}, fetchImpl);
      expect(response.status).toBe(502);
      expect(response.headers.get("cache-control")).toBe("no-store, max-age=0");
    }
  });
});
