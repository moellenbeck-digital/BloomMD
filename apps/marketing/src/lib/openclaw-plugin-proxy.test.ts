import { afterEach, describe, expect, test } from "bun:test";
import { fetchOpenClawPlugin } from "./openclaw-plugin-proxy";

const originalFetch = globalThis.fetch;
const originalReleaseToken = process.env.BLOOMMD_DESKTOP_RELEASE_GITHUB_TOKEN;

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalReleaseToken === undefined)
    delete process.env.BLOOMMD_DESKTOP_RELEASE_GITHUB_TOKEN;
  else process.env.BLOOMMD_DESKTOP_RELEASE_GITHUB_TOKEN = originalReleaseToken;
});

describe("OpenClaw plugin proxy", () => {
  test("resolves the newest non-draft release asset and keeps GitHub hidden", async () => {
    process.env.BLOOMMD_DESKTOP_RELEASE_GITHUB_TOKEN = "server-only-token";
    const urls: string[] = [];
    let range = "";
    globalThis.fetch = (async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      const url = String(input);
      urls.push(url);
      range = new Headers(init?.headers).get("range") ?? "";
      if (url.endsWith("/releases?per_page=100")) {
        return new Response(
          JSON.stringify([
            {
              draft: true,
              assets: [{ id: 1, name: "bloommd-openclaw-plugin-0.9.0.tgz" }],
            },
            {
              draft: false,
              assets: [{ id: 42, name: "bloommd-openclaw-plugin-0.4.0.tgz" }],
            },
          ]),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response("plugin", {
        status: 206,
        headers: {
          "Content-Type": "application/gzip",
          "Content-Length": "6",
          "Content-Range": "bytes 0-5/10",
        },
      });
    }) as unknown as typeof fetch;

    const response = await fetchOpenClawPlugin(
      new Request("https://bloommd.io/openclaw-plugin/latest.tgz", {
        headers: { Range: "bytes=0-5" },
      }),
    );

    expect(response.status).toBe(206);
    expect(urls).toEqual([
      "https://api.github.com/repos/moellenbeck-digital/BloomMD/releases?per_page=100",
      "https://api.github.com/repos/moellenbeck-digital/BloomMD/releases/assets/42",
    ]);
    expect(range).toBe("bytes=0-5");
    expect(response.headers.get("content-disposition")).toContain(
      "bloommd-openclaw-plugin-0.4.0.tgz",
    );
    expect(response.headers.get("x-bloommd-plugin-version")).toBe("0.4.0");
    expect(response.headers.get("cache-control")).toBe(
      "public, max-age=0, s-maxage=60, stale-while-revalidate=60",
    );
    expect(await response.text()).toBe("plugin");
  });

  test("resolves an immutable versioned release asset", async () => {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/releases?per_page=100")) {
        return new Response(
          JSON.stringify([
            {
              draft: false,
              assets: [{ id: 43, name: "bloommd-openclaw-plugin-0.4.1.tgz" }],
            },
            {
              draft: false,
              assets: [{ id: 42, name: "bloommd-openclaw-plugin-0.4.0.tgz" }],
            },
          ]),
          { status: 200 },
        );
      }
      expect(url).toEndWith("/releases/assets/42");
      return new Response("plugin", { status: 200 });
    }) as unknown as typeof fetch;

    const response = await fetchOpenClawPlugin(
      new Request("https://bloommd.io/openclaw-plugin/0.4.0.tgz"),
      "0.4.0",
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-bloommd-plugin-version")).toBe("0.4.0");
    expect(response.headers.get("cache-control")).toBe(
      "public, max-age=31536000, s-maxage=31536000, immutable",
    );
  });

  test("uses the private archive when the new repository has no plugin release", async () => {
    const urls: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      urls.push(url);
      if (url === "https://api.github.com/repos/moellenbeck-digital/BloomMD/releases?per_page=100") {
        return new Response(null, { status: 404 });
      }
      if (url === "https://api.github.com/repos/moellenbeck-digital/BloomMD-archiv/releases?per_page=100") {
        return Response.json([{ draft: false, assets: [{ id: 46, name: "bloommd-openclaw-plugin-0.4.4.tgz" }] }]);
      }
      if (url === "https://api.github.com/repos/moellenbeck-digital/BloomMD-archiv/releases/assets/46") {
        return new Response("plugin", { status: 200 });
      }
      return new Response(null, { status: 404 });
    }) as unknown as typeof fetch;

    const response = await fetchOpenClawPlugin(new Request("https://bloommd.io/openclaw-plugin/latest.tgz"));
    expect(response.status).toBe(200);
    expect(response.headers.get("x-bloommd-plugin-version")).toBe("0.4.4");
    expect(await response.text()).toBe("plugin");
    expect(urls).toEqual([
      "https://api.github.com/repos/moellenbeck-digital/BloomMD/releases?per_page=100",
      "https://api.github.com/repos/moellenbeck-digital/BloomMD-archiv/releases?per_page=100",
      "https://api.github.com/repos/moellenbeck-digital/BloomMD-archiv/releases/assets/46",
    ]);
  });

  test("returns a cache-safe 404 when no released plugin exists", async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify([]), {
        status: 200,
      })) as unknown as typeof fetch;
    const response = await fetchOpenClawPlugin(
      new Request("https://bloommd.io/openclaw-plugin/latest.tgz"),
    );
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
