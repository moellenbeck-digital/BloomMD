import { afterEach, describe, expect, test } from "bun:test";
import { parseFile } from "@bloommd/core";
import { ApiFileStore } from "./api-file-store";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("ApiFileStore workspace context", () => {
  test("lists and selects workspaces without changing context on a denied selection", async () => {
    const requests: string[] = [];
    globalThis.fetch = (async (input: URL | RequestInfo) => {
      const url = String(input);
      requests.push(url);
      if (url.endsWith("/api/workspaces")) {
        return Response.json({
          workspace: {
            id: "11111111-1111-4111-8111-111111111111",
            name: "Personal",
            slug: "personal",
            kind: "personal",
            role: "owner",
          },
          workspaces: [
            {
              id: "11111111-1111-4111-8111-111111111111",
              name: "Personal",
              slug: "personal",
              kind: "personal",
              role: "owner",
            },
            {
              id: "22222222-2222-4222-8222-222222222222",
              name: "Research Team",
              slug: "research-team",
              kind: "team",
              role: "editor",
            },
          ],
        });
      }
      if (url.includes("workspaceId=22222222-2222-4222-8222-222222222222")) {
        return Response.json({
          workspace: {
            id: "22222222-2222-4222-8222-222222222222",
            name: "Research Team",
            slug: "research-team",
            kind: "team",
            role: "editor",
          },
          workspaces: [
            {
              id: "11111111-1111-4111-8111-111111111111",
              name: "Personal",
              slug: "personal",
              kind: "personal",
              role: "owner",
            },
            {
              id: "22222222-2222-4222-8222-222222222222",
              name: "Research Team",
              slug: "research-team",
              kind: "team",
              role: "editor",
            },
          ],
        });
      }
      return Response.json({ error: "forbidden" }, { status: 403 });
    }) as typeof fetch;

    const store = new ApiFileStore({ baseUrl: "https://bloommd.app", accessToken: "bloom_pat_test" });
    await expect(store.listWorkspaces()).resolves.toMatchObject({
      workspace: { id: "11111111-1111-4111-8111-111111111111" },
      workspaces: [{ name: "Personal" }, { name: "Research Team" }],
    });
    await expect(store.selectWorkspace("22222222-2222-4222-8222-222222222222")).resolves.toMatchObject({
      workspace: { name: "Research Team", role: "editor" },
    });
    await expect(store.selectWorkspace("33333333-3333-4333-8333-333333333333")).rejects.toThrow("API workspace selection failed");
    expect(store.getWorkspaceContext().workspace?.name).toBe("Research Team");
    expect(requests).toEqual([
      "https://bloommd.app/api/workspaces",
      "https://bloommd.app/api/workspaces?workspaceId=22222222-2222-4222-8222-222222222222",
      "https://bloommd.app/api/workspaces?workspaceId=33333333-3333-4333-8333-333333333333",
    ]);
  });

  test("refreshes the currently selected workspace instead of falling back to personal", async () => {
    const requests: string[] = [];
    globalThis.fetch = (async (input: URL | RequestInfo) => {
      const url = String(input);
      requests.push(url);
      return Response.json({
        workspace: {
          id: "22222222-2222-4222-8222-222222222222",
          name: "Research Team",
          slug: "research-team",
          kind: "team",
          role: "editor",
        },
        workspaces: [{
          id: "22222222-2222-4222-8222-222222222222",
          name: "Research Team",
          slug: "research-team",
          kind: "team",
          role: "editor",
        }],
      });
    }) as typeof fetch;

    const store = new ApiFileStore({ baseUrl: "https://bloommd.app", accessToken: "bloom_pat_test" });
    await store.selectWorkspace("22222222-2222-4222-8222-222222222222");
    await store.listWorkspaces();

    expect(requests).toEqual([
      "https://bloommd.app/api/workspaces?workspaceId=22222222-2222-4222-8222-222222222222",
      "https://bloommd.app/api/workspaces?workspaceId=22222222-2222-4222-8222-222222222222",
    ]);
    expect(store.getWorkspaceContext().workspace?.name).toBe("Research Team");
  });

  test("carries the listed cloud workspace into document and sync-ticket requests", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = (async (input: URL | RequestInfo, init?: RequestInit) => {
      const url = String(input);
      requests.push({ url, init });
      if (url.endsWith("/api/mindmaps") && !init?.method) {
        return Response.json({
          files: [{ filename: "shared.md", frontmatter: { title: "Shared" } }],
          workspace: {
            id: "11111111-1111-4111-8111-111111111111",
            name: "Research Team",
            slug: "research-team",
            kind: "team",
            role: "editor",
          },
        });
      }
      if (url.endsWith("/api/mindmaps/shared.md")) {
        return Response.json({
          filePath: "shared.md",
          frontmatter: { title: "Shared", id: "shared" },
          nodes: {
            root: { id: "root", title: "Shared", level: 1, children: [], content: "", references: [] },
          },
          rootId: "root",
          storage: {
            mode: "database",
            workspaceId: "11111111-1111-4111-8111-111111111111",
            documentId: "22222222-2222-4222-8222-222222222222",
            version: 1,
          },
        });
      }
      if (url.endsWith("/api/sync-ticket")) {
        return Response.json({ websocketUrl: "ws://localhost:4100/ws/doc?ticket=t", expiresAt: new Date().toISOString(), permission: "write" });
      }
      return Response.json({ error: "unexpected" }, { status: 500 });
    }) as typeof fetch;

    const store = new ApiFileStore({ baseUrl: "https://bloommd.app/", accessToken: "bloom_pat_test" });

    await expect(store.list()).resolves.toHaveLength(1);
    await expect(store.read("shared.md")).resolves.toMatchObject({ filePath: "shared.md" });
    await expect(store.fetchSyncTicket("shared.md")).resolves.toMatchObject({ permission: "write" });

    const readRequest = requests.find((request) => request.url.endsWith("/api/mindmaps/shared.md"));
    expect(new Headers(readRequest?.init?.headers).get("X-BloomMD-Workspace-ID")).toBe("11111111-1111-4111-8111-111111111111");

    const ticketRequest = requests.find((request) => request.url.endsWith("/api/sync-ticket"));
    expect(ticketRequest?.init?.body).toBe(JSON.stringify({
      filename: "shared.md",
      workspaceId: "11111111-1111-4111-8111-111111111111",
    }));
  });

  test("keeps the selected viewer workspace on subsequent file requests", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = (async (input: URL | RequestInfo, init?: RequestInit) => {
      const url = String(input);
      requests.push({ url, init });
      if (url.endsWith("/api/workspaces") && !url.includes("workspaceId=")) {
        return Response.json({
          workspace: {
            id: "11111111-1111-4111-8111-111111111111",
            name: "Personal",
            slug: "personal",
            kind: "personal",
            role: "owner",
          },
          workspaces: [
            { id: "11111111-1111-4111-8111-111111111111", name: "Personal", slug: "personal", kind: "personal", role: "owner" },
            { id: "44444444-4444-4444-8444-444444444444", name: "Review", slug: "review", kind: "team", role: "viewer" },
          ],
        });
      }
      if (url.includes("workspaceId=44444444-4444-4444-8444-444444444444")) {
        return Response.json({
          workspace: { id: "44444444-4444-4444-8444-444444444444", name: "Review", slug: "review", kind: "team", role: "viewer" },
          workspaces: [
            { id: "11111111-1111-4111-8111-111111111111", name: "Personal", slug: "personal", kind: "personal", role: "owner" },
            { id: "44444444-4444-4444-8444-444444444444", name: "Review", slug: "review", kind: "team", role: "viewer" },
          ],
        });
      }
      if (url.endsWith("/api/mindmaps")) {
        return Response.json({ files: [], workspace: { id: "44444444-4444-4444-8444-444444444444", name: "Review", slug: "review", kind: "team", role: "viewer" } });
      }
      return Response.json({ error: "unexpected" }, { status: 500 });
    }) as typeof fetch;

    const store = new ApiFileStore({ baseUrl: "https://bloommd.app", accessToken: "bloom_pat_test" });
    await store.listWorkspaces();
    await store.selectWorkspace("44444444-4444-4444-8444-444444444444");
    await store.list();

    expect(store.getWorkspaceContext().workspace).toMatchObject({ name: "Review", role: "viewer" });
    const listRequest = requests.find((request) => request.url.endsWith("/api/mindmaps"));
    expect(new Headers(listRequest?.init?.headers).get("X-BloomMD-Workspace-ID")).toBe("44444444-4444-4444-8444-444444444444");
  });

  test("applies storage metadata returned by sync-room saves", async () => {
    globalThis.fetch = (async (input: URL | RequestInfo, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/mindmaps/synced.md") && init?.method === "PUT") {
        return Response.json({
          storage: {
            mode: "database",
            documentId: "22222222-2222-4222-8222-222222222222",
            workspaceId: "11111111-1111-4111-8111-111111111111",
            version: 4,
          },
        });
      }
      return Response.json({ error: "unexpected" }, { status: 500 });
    }) as typeof fetch;

    const store = new ApiFileStore({ baseUrl: "https://bloommd.app/", accessToken: "bloom_pat_test" });
    const doc = parseFile("synced.md", "# Synced\n");
    await expect(store.write(doc)).resolves.toBeUndefined();
    expect(doc.storage?.version).toBe(4);
  });

  test("returns the database document id after creating a cloud document", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = (async (input: URL | RequestInfo, init?: RequestInit) => {
      const url = String(input);
      requests.push({ url, init });
      if (url.endsWith("/api/mindmaps") && init?.method === "POST") {
        return Response.json({ filePath: "shared-copy.md" });
      }
      if (url.endsWith("/api/mindmaps/shared-copy.md")) {
        return Response.json({
          filePath: "shared-copy.md",
          frontmatter: { title: "Shared copy", id: "local-markdown-id" },
          nodes: { root: { id: "root", title: "Shared copy", level: 1, children: [], content: "", references: [] } },
          rootId: "root",
          storage: {
            mode: "database",
            documentId: "22222222-2222-4222-8222-222222222222",
            workspaceId: "11111111-1111-4111-8111-111111111111",
            version: 1,
          },
        });
      }
      return Response.json({ error: "unexpected" }, { status: 500 });
    }) as typeof fetch;

    const store = new ApiFileStore({ baseUrl: "https://bloommd.app", accessToken: "bloom_pat_test" });
    const document = await store.create("shared-copy.md", "# Shared copy\n");

    expect(document.frontmatter.id).toBe("local-markdown-id");
    expect(document.storage?.documentId).toBe("22222222-2222-4222-8222-222222222222");
    expect(requests.map((request) => request.url)).toEqual([
      "https://bloommd.app/api/mindmaps",
      "https://bloommd.app/api/mindmaps/shared-copy.md",
    ]);
  });

  test("preserves sync-room save failures as a typed error", async () => {
    globalThis.fetch = (async (input: URL | RequestInfo, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/mindmaps/synced.md") && init?.method === "PUT") {
        return Response.json({
          code: "SYNC_ROOM_SAVE_FAILED",
          error: "Document could not be saved through the active sync room.",
        }, { status: 503 });
      }
      return Response.json({ error: "unexpected" }, { status: 500 });
    }) as typeof fetch;

    const store = new ApiFileStore({ baseUrl: "https://bloommd.app/", accessToken: "bloom_pat_test" });
    await expect(store.write(parseFile("synced.md", "# Synced\n"))).rejects.toThrow("SYNC_ROOM_SAVE_FAILED");
  });

  test("preserves remote rename conflicts as a typed error", async () => {
    globalThis.fetch = (async () => Response.json({
      code: "DOCUMENT_NAME_CONFLICT",
      error: "A mindmap with this filename already exists.",
    }, { status: 409 })) as unknown as typeof fetch;

    const store = new ApiFileStore({ baseUrl: "https://bloommd.app", accessToken: "bloom_pat_test" });
    await expect(store.rename("old.md", "new.md")).rejects.toThrow("DOCUMENT_NAME_CONFLICT");
  });

  test("preserves active sync-room delete failures as a typed error", async () => {
    globalThis.fetch = (async () => Response.json({
      code: "SYNC_ROOM_ACTIVE",
      error: "The document is still open in a sync room.",
    }, { status: 409 })) as unknown as typeof fetch;

    const store = new ApiFileStore({ baseUrl: "https://bloommd.app", accessToken: "bloom_pat_test" });
    await expect(store.delete("shared.md")).rejects.toThrow("SYNC_ROOM_ACTIVE");
  });
});
