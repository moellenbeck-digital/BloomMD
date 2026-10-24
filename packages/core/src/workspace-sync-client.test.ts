import { describe, expect, test } from "bun:test";
import { WorkspaceSyncClient } from "./workspace-sync-client";

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("WorkspaceSyncClient", () => {
  test("uses only workspace and cloud filename when creating a shared document", async () => {
    const requests: Array<{ url: string; body?: unknown; headers: Headers }> = [];
    const client = new WorkspaceSyncClient({
      baseUrl: "https://bloommd.app/",
      accessToken: "bloom_pat_test",
      fetchImpl: async (input, init) => {
        const url = String(input);
        const headers = new Headers(init?.headers);
        requests.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined, headers });
        if (url.includes("/api/workspaces")) return response({ workspace: { id: "workspace-1", name: "Team", slug: "team", kind: "team", role: "editor" }, workspaces: [] });
        if (url.endsWith("/api/mindmaps")) return response({ filePath: "shared-sync-check.md" });
        return response({ frontmatter: { id: "markdown-id" }, storage: { documentId: "document-1", version: 7 } });
      },
    });

    await client.selectWorkspace("workspace-1");
    await expect(client.createDocument("shared-sync-check.md", "# Sync check")).resolves.toEqual({ documentId: "document-1", cloudVersion: 7 });
    expect(requests[1]?.body).toEqual({ filename: "shared-sync-check.md", markdown: "# Sync check" });
    expect(JSON.stringify(requests)).not.toContain("/Users/");
    expect(requests[1]?.headers.get("X-BloomMD-Workspace-ID")).toBe("workspace-1");
  });

  test("returns an authorized short-lived sync ticket", async () => {
    const client = new WorkspaceSyncClient({
      baseUrl: "https://bloommd.app",
      accessToken: "bloom_pat_test",
      fetchImpl: async () => response({ websocketUrl: "wss://sync.example/ws/shared.md?ticket=test", expiresAt: "2026-09-13T10:00:00.000Z", permission: "write" }),
    });
    await expect(client.fetchSyncTicket("shared.md")).resolves.toMatchObject({ permission: "write", websocketUrl: "wss://sync.example/ws/shared.md?ticket=test" });
  });

  test("lists and resolves an existing cloud document without a local path", async () => {
    const requests: Array<{ url: string; headers: Headers }> = [];
    const client = new WorkspaceSyncClient({
      baseUrl: "https://bloommd.app",
      accessToken: "bloom_pat_test",
      fetchImpl: async (input, init) => {
        const url = String(input);
        requests.push({ url, headers: new Headers(init?.headers) });
        if (url.includes("/api/workspaces")) return response({ workspace: { id: "workspace-1", name: "Team", slug: "team", kind: "team", role: "editor" }, workspaces: [] });
        if (url.endsWith("/api/mindmaps")) return response({ files: [{ filename: "shared-sync-check.md" }] });
        return response({ frontmatter: { id: "markdown-id" }, storage: { documentId: "document-1", version: 7 } });
      },
    });

    await client.selectWorkspace("workspace-1");
    await expect(client.listDocuments()).resolves.toEqual([{ filename: "shared-sync-check.md" }]);
    await expect(client.getExistingDocument("shared-sync-check.md")).resolves.toEqual({
      filename: "shared-sync-check.md",
      documentId: "document-1",
      cloudVersion: 7,
    });
    expect(requests.at(-1)?.headers.get("X-BloomMD-Workspace-ID")).toBe("workspace-1");
    expect(JSON.stringify(requests)).not.toContain("/Users/");
  });

  test("audits a binding with cloud identifiers only", async () => {
    const requests: Array<{ url: string; body?: unknown }> = [];
    const client = new WorkspaceSyncClient({
      baseUrl: "https://bloommd.app",
      accessToken: "bloom_pat_test",
      fetchImpl: async (input, init) => {
        const url = String(input);
        requests.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
        if (url.includes("/api/workspaces")) return response({ workspace: { id: "workspace-1", name: "Team", slug: "team", kind: "team", role: "editor" }, workspaces: [] });
        return response({ recorded: true });
      },
    });

    await client.selectWorkspace("workspace-1");
    await expect(client.recordSharedDocumentBinding("bound", "document-1")).resolves.toBeUndefined();
    expect(requests.at(-1)).toEqual({
      url: "https://bloommd.app/api/shared-documents/audit",
      body: { action: "bound", documentId: "document-1", workspaceId: "workspace-1" },
    });
    expect(JSON.stringify(requests)).not.toContain("/Users/");
  });
});
