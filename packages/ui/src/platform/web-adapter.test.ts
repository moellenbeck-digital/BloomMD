import { afterEach, describe, expect, test } from "bun:test";
import { PlatformError } from "./platform-adapter";
import { createWebPlatformAdapter } from "./web-adapter";

interface Call {
  url: string;
  method: string;
  body: unknown;
}

function fakeFetch(respond: (call: Call) => Response) {
  const calls: Call[] = [];
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const call: Call = {
      url: String(input),
      method: init?.method ?? "GET",
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    };
    calls.push(call);
    return respond(call);
  }) as typeof fetch;
  return { calls, impl };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const DOC = {
  filePath: "plan.md",
  frontmatter: { title: "Plan", id: "p1", created: "", updated: "" },
  nodes: { root: { id: "root", title: "Plan", content: "", children: [], parentId: null } },
  rootId: "root",
};

describe("web platform adapter", () => {
  test("@t79 list, read, create, write, rename and remove hit the expected URLs and methods", async () => {
    const { calls, impl } = fakeFetch((call) => {
      if (call.method === "GET" && call.url === "/api/mindmaps") return json({ files: [{ filename: "plan.md" }] });
      if (call.method === "GET") return json(DOC);
      if (call.method === "PUT") return json({ storage: { mode: "database", documentId: "d", workspaceId: "w", version: 4 } });
      if (call.method === "PATCH") return json({ success: true, newFilename: "renamed.md", version: 5 });
      return json({ success: true });
    });
    const adapter = createWebPlatformAdapter({ fetch: impl });

    expect((await adapter.files.list()).map((entry) => entry.filename)).toEqual(["plan.md"]);
    const doc = await adapter.files.read("my plan.md");
    expect(doc.nodes.get("root")?.title).toBe("Plan");
    await adapter.files.create("new.md", "# New");
    const written = await adapter.files.write("plan.md", "# Plan", { storage: { mode: "database", documentId: "d", workspaceId: "w", version: 3 } });
    expect(written.storage?.version).toBe(4);
    expect(await adapter.files.rename("plan.md", "renamed.md")).toEqual({ filename: "renamed.md", version: 5 });
    await adapter.files.remove("plan.md");

    expect(calls).toEqual([
      { url: "/api/mindmaps", method: "GET", body: undefined },
      { url: "/api/mindmaps/my%20plan.md", method: "GET", body: undefined },
      { url: "/api/mindmaps", method: "POST", body: { filename: "new.md", markdown: "# New" } },
      { url: "/api/mindmaps/plan.md", method: "PUT", body: { markdown: "# Plan", expectedVersion: 3 } },
      { url: "/api/mindmaps/plan.md", method: "PATCH", body: { newFilename: "renamed.md" } },
      { url: "/api/mindmaps/plan.md", method: "DELETE", body: undefined },
    ]);
  });

  test("@t79 the link preview goes through /api/link-preview", async () => {
    const { calls, impl } = fakeFetch(() => json({ preview: { title: "Example" } }));
    const preview = await createWebPlatformAdapter({ fetch: impl }).api.linkPreview("https://example.com/a?b=1&c=2");
    expect(preview).toEqual({ title: "Example" });
    expect(calls[0]?.url).toBe("/api/link-preview?url=https%3A%2F%2Fexample.com%2Fa%3Fb%3D1%26c%3D2");
  });

  test("@t79 an explicit workspace is sent as query parameter on every file call and re-read each time", async () => {
    let workspace: string | null = "ws 1";
    const { calls, impl } = fakeFetch((call) => (call.method === "GET" && call.url.startsWith("/api/mindmaps?") ? json({ files: [] }) : json(DOC)));
    const adapter = createWebPlatformAdapter({ fetch: impl, workspaceId: () => workspace });
    await adapter.files.list();
    await adapter.files.read("a.md");
    workspace = null;
    await adapter.files.list();
    expect(calls.map((call) => call.url)).toEqual(["/api/mindmaps?workspace=ws%201", "/api/mindmaps/a.md?workspace=ws%201", "/api/mindmaps"]);
  });

  test("@t79 HTTP failures become PlatformErrors with a code and the server message", async () => {
    const status = new Map<string, number>([["/api/mindmaps/a.md", 404], ["/api/mindmaps", 401]]);
    const { impl } = fakeFetch((call) => json({ error: `no ${call.url}` }, status.get(call.url) ?? 500));
    const adapter = createWebPlatformAdapter({ fetch: impl });

    const notFound = await adapter.files.read("a.md").catch((error: unknown) => error);
    expect(notFound).toBeInstanceOf(PlatformError);
    expect(notFound).toMatchObject({ code: "not-found", status: 404, message: "no /api/mindmaps/a.md" });
    expect(await adapter.files.list().catch((error: unknown) => error)).toMatchObject({ code: "unauthorized", status: 401 });
    expect(await adapter.files.remove("b.md").catch((error: unknown) => error)).toMatchObject({ code: "unavailable", status: 500 });
  });

  test("@t79 a version conflict on write is reported as conflict", async () => {
    const { impl } = fakeFetch(() => json({ error: "Document changed on the server." }, 409));
    expect(await createWebPlatformAdapter({ fetch: impl }).files.write("a.md", "# A").catch((error: unknown) => error)).toMatchObject({ code: "conflict" });
  });

  test("@t79 a non-JSON error page does not leak into the message", async () => {
    const { impl } = fakeFetch(() => new Response("<html>Bad gateway</html>", { status: 502 }));
    const error = await createWebPlatformAdapter({ fetch: impl }).api.linkPreview("https://example.com").catch((reason: unknown) => reason);
    expect(error).toMatchObject({ code: "unavailable", status: 502, message: "Link preview unavailable (HTTP 502)." });
  });

  test("@t79 a network failure is an unavailable PlatformError", async () => {
    const impl = (async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;
    expect(await createWebPlatformAdapter({ fetch: impl }).files.list().catch((error: unknown) => error)).toMatchObject({ code: "unavailable", message: "Failed to fetch" });
  });

  describe("global fetch", () => {
    const originalFetch = globalThis.fetch;
    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    test("@t79 is looked up at call time, so a later replacement is honoured", async () => {
      const adapter = createWebPlatformAdapter();
      const { calls, impl } = fakeFetch(() => json({ files: [] }));
      globalThis.fetch = impl;
      await adapter.files.list();
      expect(calls).toHaveLength(1);
    });

    test("@t79 a missing fetch is reported as unsupported instead of throwing a TypeError", async () => {
      globalThis.fetch = undefined as unknown as typeof fetch;
      expect(await createWebPlatformAdapter().files.list().catch((error: unknown) => error)).toMatchObject({ code: "unsupported" });
    });
  });
});
