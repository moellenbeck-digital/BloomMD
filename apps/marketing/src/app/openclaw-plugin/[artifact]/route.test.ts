import { afterEach, describe, expect, test } from "bun:test";
import { GET } from "./route";

const originalFetch = globalThis.fetch;
const originalReleaseToken = process.env.BLOOMMD_DESKTOP_RELEASE_GITHUB_TOKEN;

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalReleaseToken === undefined)
    delete process.env.BLOOMMD_DESKTOP_RELEASE_GITHUB_TOKEN;
  else process.env.BLOOMMD_DESKTOP_RELEASE_GITHUB_TOKEN = originalReleaseToken;
});

describe("OpenClaw plugin route", () => {
  test("resolves latest.tgz through the shared dynamic handler", async () => {
    process.env.BLOOMMD_DESKTOP_RELEASE_GITHUB_TOKEN = "server-only-token";
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/releases?per_page=100")) {
        return new Response(
          JSON.stringify([
            {
              draft: false,
              assets: [
                { id: 42, name: "bloommd-openclaw-plugin-0.4.1.tgz" },
              ],
            },
          ]),
          { status: 200 },
        );
      }
      return new Response("plugin", { status: 200 });
    }) as unknown as typeof fetch;

    const response = await GET(
      new Request("https://bloommd.io/openclaw-plugin/latest.tgz"),
      { params: Promise.resolve({ artifact: "latest.tgz" }) },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-bloommd-plugin-version")).toBe("0.4.1");
    expect(response.headers.get("cache-control")).toBe(
      "public, max-age=0, s-maxage=60, stale-while-revalidate=60",
    );
  });
});
