import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

const originalError = console.error;
let storageError: Error | null = null;
let syncCreateCalls = 0;

mock.module("../../../lib/auth", () => ({
  getApiRequestIdentity: async () => ({
    authKind: "session",
    userId: "11111111-1111-4111-8111-111111111111",
    email: "tester@example.test",
  }),
}));

mock.module("../../../lib/mindmap-storage", () => ({
  getMindmapStorage: async () => {
    if (storageError) throw storageError;
    return {
      mode: "database",
      workspace: {
        id: "22222222-2222-4222-8222-222222222222",
        name: "Personal",
        slug: "personal",
        kind: "personal",
        role: "owner",
      },
      list: async () => [],
      read: async () => { throw new Error("Document not found."); },
      write: async (document: never) => document,
      rename: async () => "mindmap.md",
      delete: async () => undefined,
    };
  },
}));

mock.module("../../../lib/sync-room-status", () => ({
  SyncMutationError: class SyncMutationError extends Error {
    code: string;
    status: number;
    constructor(code: string, status: number, message: string) {
      super(message);
      this.code = code;
      this.status = status;
    }
  },
  createThroughSyncServer: async () => {
    syncCreateCalls += 1;
    return { filePath: "new.md", frontmatter: { title: "New" }, storage: { mode: "database", documentId: "33333333-3333-4333-8333-333333333333", workspaceId: "22222222-2222-4222-8222-222222222222", version: 1 } };
  },
  writeThroughSyncServer: async () => null,
  renameThroughSyncServer: async () => ({ success: true, newFilePath: "renamed.md", newFilename: "renamed.md", version: 2 }),
  deleteThroughSyncServer: async () => ({ deleted: "new.md" }),
  // Bun shares module mocks across test files; every export a route imports must exist here.
  applyKnowledgeNodesThroughSyncServer: async () => { throw new Error("applyKnowledgeNodesThroughSyncServer is not used in this test."); },
  applyNodeContentThroughSyncServer: async () => { throw new Error("applyNodeContentThroughSyncServer is not used in this test."); },
  isSyncRoomActive: async () => { throw new Error("isSyncRoomActive is not used in this test."); },
  fetchSyncRoomStatus: async () => { throw new Error("fetchSyncRoomStatus is not used in this test."); },
}));

const { GET, POST } = await import("./route");

describe("mindmap listing route", () => {
  beforeEach(() => {
    storageError = null;
    syncCreateCalls = 0;
    console.error = () => undefined;
  });

  afterEach(() => {
    console.error = originalError;
  });

  test("returns a recoverable workspace error instead of an unhandled 500", async () => {
    storageError = new Error("Workspace not found or access denied.");

    const response = await GET(new Request("https://bloommd.app/api/mindmaps?workspace=33333333-3333-4333-8333-333333333333"));
    const body = await response.json() as { error?: string };

    expect(response.status).toBe(404);
    expect(body.error).toBe("Workspace not found or access denied.");
  });

  test("lists documents when workspace resolution succeeds", async () => {
    const response = await GET(new Request("https://bloommd.app/api/mindmaps"));
    const body = await response.json() as { files?: unknown[]; workspace?: { id: string } };

    expect(response.status).toBe(200);
    expect(body.files).toEqual([]);
    expect(body.workspace?.id).toBe("22222222-2222-4222-8222-222222222222");
  });

  test("creates cloud documents through the sync server", async () => {
    const response = await POST(new Request("https://bloommd.app/api/mindmaps", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "https://bloommd.app" },
      body: JSON.stringify({ filename: "new.md", markdown: "# New" }),
    }));

    expect(response.status).toBe(201);
    expect(syncCreateCalls).toBe(1);
  });
});
