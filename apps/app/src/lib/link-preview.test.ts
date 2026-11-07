import { afterEach, describe, expect, test } from "bun:test";
import { parseLinkPreviewHtml, assertPublicHttpUrl, fetchLinkPreview } from "./link-preview";

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
