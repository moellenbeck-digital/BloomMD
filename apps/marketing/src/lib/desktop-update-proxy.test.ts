import { afterEach, describe, expect, test } from "bun:test";
import { fetchDesktopArtifact, isAllowedDesktopArtifact } from "./desktop-update-proxy";

const originalFetch = globalThis.fetch;
const originalDesktopReleaseToken = process.env.BLOOMMD_DESKTOP_RELEASE_GITHUB_TOKEN;

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalDesktopReleaseToken === undefined) delete process.env.BLOOMMD_DESKTOP_RELEASE_GITHUB_TOKEN;
  else process.env.BLOOMMD_DESKTOP_RELEASE_GITHUB_TOKEN = originalDesktopReleaseToken;
});

describe("desktop update proxy", () => {
  test("allows only the versioned Linux Pacman artifacts and stable architecture aliases", () => {
    expect(isAllowedDesktopArtifact("stable-linux-x86_64.pacman")).toBe(true);
    expect(isAllowedDesktopArtifact("stable-linux-aarch64.pacman")).toBe(true);
    expect(isAllowedDesktopArtifact("bloommd-desktop-0.5.3-x86_64.pacman")).toBe(true);
    expect(isAllowedDesktopArtifact("bloommd-desktop-0.5.3-aarch64.pacman")).toBe(true);
    expect(isAllowedDesktopArtifact("bloommd-desktop-0.5.3-x86_64.tar.zst")).toBe(false);
    expect(isAllowedDesktopArtifact("bloommd-desktop-0.5.3-armv7.pacman")).toBe(false);
    expect(isAllowedDesktopArtifact("stable-linux-../../secret.pacman")).toBe(false);
  });

  test("rejects unknown artifacts without contacting GitHub", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return new Response("unexpected");
    }) as unknown as typeof fetch;

    const response = await fetchDesktopArtifact(new Request("https://bloommd.io/_desktop-updates/secret.txt"), "secret.txt");

    expect(response.status).toBe(404);
    expect(calls).toBe(0);
  });

  test("forwards range requests and keeps GitHub out of the client response", async () => {
    process.env.BLOOMMD_DESKTOP_RELEASE_GITHUB_TOKEN = "server-only-token";
    const receivedUrls: string[] = [];
    let receivedRange = "";
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      receivedUrls.push(url);
      receivedRange = new Headers(init?.headers).get("range") ?? "";
      if (url === "https://api.github.com/repos/moellenbeck-digital/BloomMD/releases/latest") {
        return new Response(JSON.stringify({ assets: [{ id: 42, name: "stable-macos-arm64-BloomMD.app.tar.zst" }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response("bundle", {
        status: 206,
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Length": "6",
          "Content-Range": "bytes 0-5/10",
          ETag: "artifact-etag",
        },
      });
    }) as unknown as typeof fetch;

    const response = await fetchDesktopArtifact(
      new Request("https://bloommd.io/_desktop-updates/stable-macos-arm64-BloomMD.app.tar.zst", { headers: { Range: "bytes=0-5" } }),
      "stable-macos-arm64-BloomMD.app.tar.zst",
    );

    expect(response.status).toBe(206);
    expect(receivedUrls).toEqual([
      "https://api.github.com/repos/moellenbeck-digital/BloomMD/releases/latest",
      "https://api.github.com/repos/moellenbeck-digital/BloomMD/releases/assets/42",
    ]);
    expect(receivedRange).toBe("bytes=0-5");
    expect(response.headers.get("content-range")).toBe("bytes 0-5/10");
    expect(response.headers.get("cache-control")).toContain("s-maxage=3600");
    expect(await response.text()).toBe("bundle");
  });

  test("uses the private archive when the new repository has no desktop release", async () => {
    process.env.BLOOMMD_DESKTOP_RELEASE_GITHUB_TOKEN = "server-only-token";
    const receivedUrls: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      receivedUrls.push(url);
      if (url === "https://api.github.com/repos/moellenbeck-digital/BloomMD/releases/latest") {
        return new Response(null, { status: 404 });
      }
      if (url === "https://api.github.com/repos/moellenbeck-digital/BloomMD-archiv/releases/latest") {
        return Response.json({ assets: [{ id: 46, name: "stable-macos-arm64-update.json" }] });
      }
      if (url === "https://api.github.com/repos/moellenbeck-digital/BloomMD-archiv/releases/assets/46") {
        return Response.json({ version: "0.5.15", hash: "9j948c9kwswb", platform: "macos", arch: "arm64" });
      }
      return new Response(null, { status: 404 });
    }) as unknown as typeof fetch;

    const response = await fetchDesktopArtifact(
      new Request("https://bloommd.io/_desktop-updates/stable-macos-arm64-update.json"),
      "stable-macos-arm64-update.json",
    );

    expect(response.status).toBe(200);
    expect(receivedUrls).toEqual([
      "https://api.github.com/repos/moellenbeck-digital/BloomMD/releases/latest",
      "https://api.github.com/repos/moellenbeck-digital/BloomMD-archiv/releases/latest",
      "https://api.github.com/repos/moellenbeck-digital/BloomMD-archiv/releases/assets/46",
    ]);
    expect(await response.json()).toEqual({ version: "0.5.15", hash: "9j948c9kwswb", platform: "macos", arch: "arm64" });
  });

  test("uses short revalidation for update metadata and supports HEAD", async () => {
    process.env.BLOOMMD_DESKTOP_RELEASE_GITHUB_TOKEN = "server-only-token";
    let method = "";
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      method = init?.method ?? "";
      if (String(input) === "https://api.github.com/repos/moellenbeck-digital/BloomMD/releases/latest") {
        return new Response(JSON.stringify({ assets: [{ id: 43, name: "stable-macos-arm64-update.json" }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(null, { status: 200, headers: { "Content-Type": "application/json" } });
    }) as unknown as typeof fetch;

    const response = await fetchDesktopArtifact(
      new Request("https://bloommd.io/_desktop-updates/stable-macos-arm64-update.json", { method: "HEAD" }),
      "stable-macos-arm64-update.json",
    );

    expect(response.status).toBe(200);
    expect(method).toBe("HEAD");
    expect(response.headers.get("cache-control")).toContain("s-maxage=60");
  });

  test("resolves a stable Linux alias to the matching architecture in the latest release", async () => {
    process.env.BLOOMMD_DESKTOP_RELEASE_GITHUB_TOKEN = "server-only-token";
    const receivedUrls: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      receivedUrls.push(url);
      if (url === "https://api.github.com/repos/moellenbeck-digital/BloomMD/releases/latest") {
        return new Response(JSON.stringify({ assets: [
          { id: 44, name: "bloommd-desktop-0.5.3-aarch64.pacman" },
          { id: 45, name: "bloommd-desktop-0.5.3-x86_64.pacman" },
        ] }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return new Response("pacman-package", { status: 200, headers: { "Content-Type": "application/octet-stream" } });
    }) as unknown as typeof fetch;

    const response = await fetchDesktopArtifact(
      new Request("https://bloommd.io/_desktop-updates/stable-linux-aarch64.pacman"),
      "stable-linux-aarch64.pacman",
    );

    expect(response.status).toBe(200);
    expect(receivedUrls).toEqual([
      "https://api.github.com/repos/moellenbeck-digital/BloomMD/releases/latest",
      "https://api.github.com/repos/moellenbeck-digital/BloomMD/releases/assets/44",
    ]);
    expect(await response.text()).toBe("pacman-package");
  });
});
