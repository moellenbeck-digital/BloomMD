import { afterEach, describe, expect, test } from "bun:test";
import { fetchCommandTool } from "./command-tool-proxy";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("command tool proxy", () => {
  test("streams the latest command-tool binary from a cli release", async () => {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/releases?per_page=100")) {
        return new Response(JSON.stringify([
          { draft: false, tag_name: "v0.4.6", assets: [{ id: 1, name: "bloommd-wiki-0.4.3-linux-x64" }] },
          { draft: false, tag_name: "cli-v0.4.3", assets: [{ id: 42, name: "bloommd-wiki-0.4.3-linux-x64" }] },
        ]));
      }
      expect(url).toEndWith("/releases/assets/42");
      return new Response("binary", { status: 200, headers: { "Content-Type": "application/octet-stream" } });
    }) as unknown as typeof fetch;

    const response = await fetchCommandTool(
      new Request("https://bloommd.io/command-tools/bloommd-wiki-linux-x64"),
      "bloommd-wiki-linux-x64",
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-bloommd-command-tools-version")).toBe("0.4.3");
    expect(response.headers.get("content-disposition")).toContain("bloommd-wiki-0.4.3-linux-x64");
    expect(await response.text()).toBe("binary");
  });

  test("uses the private archive when the new repository has no CLI release", async () => {
    const urls: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      urls.push(url);
      if (url === "https://api.github.com/repos/moellenbeck-digital/BloomMD/releases?per_page=100") {
        return new Response(null, { status: 404 });
      }
      if (url === "https://api.github.com/repos/moellenbeck-digital/BloomMD-archiv/releases?per_page=100") {
        return Response.json([{ draft: false, tag_name: "cli-v0.4.4", assets: [{ id: 45, name: "bloommd-agent-0.4.4-linux-x64" }] }]);
      }
      if (url === "https://api.github.com/repos/moellenbeck-digital/BloomMD-archiv/releases/assets/45") {
        return new Response("agent-binary", { status: 200 });
      }
      return new Response(null, { status: 404 });
    }) as unknown as typeof fetch;

    const response = await fetchCommandTool(new Request("https://bloommd.io/command-tools/bloommd-agent-linux-x64"), "bloommd-agent-linux-x64");
    expect(response.status).toBe(200);
    expect(response.headers.get("x-bloommd-command-tools-version")).toBe("0.4.4");
    expect(await response.text()).toBe("agent-binary");
    expect(urls).toEqual([
      "https://api.github.com/repos/moellenbeck-digital/BloomMD/releases?per_page=100",
      "https://api.github.com/repos/moellenbeck-digital/BloomMD-archiv/releases?per_page=100",
      "https://api.github.com/repos/moellenbeck-digital/BloomMD-archiv/releases/assets/45",
    ]);
  });

  test("rejects unknown artifact names without contacting GitHub", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return new Response("unexpected");
    }) as unknown as typeof fetch;
    const response = await fetchCommandTool(new Request("https://bloommd.io/command-tools/nope"), "nope");
    expect(response.status).toBe(404);
    expect(calls).toBe(0);
  });

  test("resolves the agent runtime from the same versioned release contract", async () => {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/releases?per_page=100")) {
        return new Response(JSON.stringify([
          { draft: false, tag_name: "cli-v0.4.3", assets: [{ id: 99, name: "bloommd-agent-0.4.3-darwin-arm64" }] },
        ]));
      }
      expect(url).toEndWith("/releases/assets/99");
      return new Response("agent-binary", { status: 200, headers: { "Content-Type": "application/octet-stream" } });
    }) as unknown as typeof fetch;

    const response = await fetchCommandTool(
      new Request("https://bloommd.io/command-tools/bloommd-agent-darwin-arm64"),
      "bloommd-agent-darwin-arm64",
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toContain("bloommd-agent-0.4.3-darwin-arm64");
    expect(await response.text()).toBe("agent-binary");
  });
});
