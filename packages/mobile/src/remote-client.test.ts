import { describe, expect, test } from "bun:test";
import { MobileRemoteClient } from "./remote-client";

describe("MobileRemoteClient", () => {
  test("normalizes the server URL and sends a bearer token", async () => {
    const client = new MobileRemoteClient({ baseUrl: "https://bloommd.app///", accessToken: "token" });
    const originalFetch = globalThis.fetch;
    let requestedUrl = "";
    let requestedHeaders: HeadersInit | undefined;
    globalThis.fetch = (async (input, init) => {
      requestedUrl = String(input);
      requestedHeaders = init?.headers;
      return new Response(JSON.stringify({ files: [] }), { status: 200, headers: { "Content-Type": "application/json" } });
    }) as typeof fetch;
    try {
      await expect(client.list()).resolves.toEqual([]);
      expect(requestedUrl).toBe("https://bloommd.app/api/mindmaps");
      expect(new Headers(requestedHeaders).get("Authorization")).toBe("Bearer token");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
