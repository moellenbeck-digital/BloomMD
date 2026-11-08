import { afterEach, describe, expect, mock, test } from "bun:test";

// No real DNS: one name resolves to a public address, one to a private one (DNS rebinding style).
const HOSTS: Record<string, string> = { "public.example": "93.184.216.34", "rebind.example": "10.0.0.5" };
mock.module("node:dns/promises", () => ({
  lookup: async (host: string) => {
    const address = HOSTS[host];
    if (!address) throw new Error(`ENOTFOUND ${host}`);
    return [{ address, family: 4 }];
  },
}));

const { parseLinkPreviewHtml, assertPublicHttpUrl, fetchLinkPreview } = await import("./link-preview");

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("link preview outbound request", () => {
  test("@t91 sends only accept and user-agent, on the first request and after a redirect", async () => {
    const seen: Array<{ url: string; init: RequestInit }> = [];
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      seen.push({ url: String(input), init: init ?? {} });
      if (seen.length === 1) return new Response(null, { status: 302, headers: { location: "https://93.184.216.35/final" } });
      return new Response('<html><head><meta property="og:title" content="T"></head></html>', { status: 200, headers: { "content-type": "text/html" } });
    }) as unknown as typeof fetch;

    const preview = await fetchLinkPreview("https://93.184.216.34/start");
    expect(preview.title).toBe("T");
    expect(seen).toHaveLength(2);
    for (const { init } of seen) {
      const headers = new Headers(init.headers);
      expect([...headers.keys()].sort()).toEqual(["accept", "user-agent"]);
      for (const forbidden of ["cookie", "authorization", "referer", "origin"]) expect(headers.has(forbidden)).toBe(false);
      expect(init.credentials).toBeUndefined();
      expect(init.referrer).toBeUndefined();
      expect(init.body).toBeUndefined();
      expect(init.method ?? "GET").toBe("GET");
    }
  });
});

function stubFetch(respond: (url: string, call: number) => Response) {
  const urls: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    urls.push(String(input));
    return respond(String(input), urls.length);
  }) as unknown as typeof fetch;
  return urls;
}

const html = (body: string, init: ResponseInit = {}) => new Response(body, { status: 200, headers: { "content-type": "text/html; charset=utf-8" }, ...init });

describe("link preview fetching", () => {
  test("@t91 returns title, description and image of a public page with one request", async () => {
    const urls = stubFetch(() => html('<html><head><title>Fallback</title><meta property="og:title" content="BloomMD"><meta name="description" content="Visual maps"><meta property="og:image" content="/social.png"></head></html>'));
    const preview = await fetchLinkPreview("https://public.example/docs");
    expect(preview).toEqual({ url: "https://public.example/docs", finalUrl: "https://public.example/docs", title: "BloomMD", description: "Visual maps", image: "https://public.example/social.png" });
    expect(urls).toEqual(["https://public.example/docs"]);
  });

  test("@t91 a page without metadata is a valid, empty result", async () => {
    stubFetch(() => html("<html><body>Hi</body></html>"));
    expect(await fetchLinkPreview("https://public.example/")).toEqual({ url: "https://public.example/", finalUrl: "https://public.example/" });
  });

  test("@t91 rejects non-HTML, HTTP errors and oversized pages", async () => {
    stubFetch(() => new Response("{}", { status: 200, headers: { "content-type": "application/json" } }));
    await expect(fetchLinkPreview("https://public.example/api")).rejects.toThrow("did not return an HTML page");
    stubFetch(() => new Response("nope", { status: 503, headers: { "content-type": "text/html" } }));
    await expect(fetchLinkPreview("https://public.example/down")).rejects.toThrow("Website returned HTTP 503.");
    stubFetch(() => html("x".repeat(1_000_001)));
    await expect(fetchLinkPreview("https://public.example/big")).rejects.toThrow("too large");
  });

  test("@t91 a host that resolves to a private address is rejected before any request", async () => {
    const urls = stubFetch(() => html("<html></html>"));
    await expect(fetchLinkPreview("https://rebind.example/")).rejects.toThrow("resolves to a private network");
    expect(urls).toEqual([]);
  });

  test("@t91 a redirect to a private address is rejected and not followed", async () => {
    for (const target of ["http://127.0.0.1/admin", "https://rebind.example/internal", "http://localhost/x"]) {
      const urls = stubFetch(() => new Response(null, { status: 302, headers: { location: target } }));
      await expect(fetchLinkPreview("https://public.example/start")).rejects.toThrow();
      expect(urls).toEqual(["https://public.example/start"]);
    }
  });
});

describe("link previews", () => {
  test("extracts Open Graph metadata and resolves relative images", () => {
    const result = parseLinkPreviewHtml(
      '<html><head><title>Fallback</title><meta property="og:title" content="BloomMD"><meta property="og:description" content="Visual maps"><meta property="og:image" content="/social.png"></head></html>',
      new URL("https://example.com/docs/page"),
    );
    expect(result).toEqual({
      title: "BloomMD",
      description: "Visual maps",
      image: "https://example.com/social.png",
    });
  });

  test("rejects local and non-web preview targets", async () => {
    await expect(assertPublicHttpUrl("javascript:alert(1)")).rejects.toThrow();
    await expect(assertPublicHttpUrl("http://127.0.0.1:3000/demo")).rejects.toThrow("Private network");
    await expect(assertPublicHttpUrl("http://localhost:3000/demo")).rejects.toThrow("not allowed");
  });
});
