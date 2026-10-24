import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { parseFile, type MindMapDocument } from "@bloommd/core";

const originalWarn = console.warn;

let storeWriteCalls = 0;
let storeRenameCalls = 0;
let storeDeleteCalls = 0;
let syncMutationFailure: Error | null = null;
let syncMutationResult: {
  filePath: string;
  frontmatter: Record<string, unknown>;
  storage?: MindMapDocument["storage"];
  version: number | null;
} | null = null;

mock.module("../../../../lib/auth", () => ({
  getApiRequestIdentity: async () => ({
    authKind: "session",
    userId: "11111111-1111-4111-8111-111111111111",
    email: "tester@example.test",
  }),
}));

let audits: Array<{ action?: string; documentId?: string }> = [];
mock.module("../../../../lib/agent-audit", () => ({
  auditAgentWrite: async (_identity: unknown, storage: { documentId?: string } | undefined, action?: string) => { audits.push({ action, documentId: storage?.documentId }); },
}));

mock.module("../../../../lib/mindmap-storage", () => ({
  getMindmapStorage: async () => ({
    mode: "database",
    read: async () => {
      const document = parseFile("synced.md", "# Synced\n");
      return {
        ...document,
        storage: {
          mode: "database",
          documentId: "22222222-2222-4222-8222-222222222222",
          workspaceId: "33333333-3333-4333-8333-333333333333",
          version: 7,
        },
      } satisfies MindMapDocument;
    },
    write: async (document: MindMapDocument) => {
      storeWriteCalls += 1;
      return document;
    },
    list: async () => [],
    rename: async () => { storeRenameCalls += 1; return "synced.md"; },
    delete: async () => { storeDeleteCalls += 1; },
  }),
}));

mock.module("../../../../lib/sync-room-status", () => ({
  SyncMutationError: class SyncMutationError extends Error {
    code: string;
    status: number;
    constructor(code: string, status: number, message: string) {
      super(message);
      this.code = code;
      this.status = status;
    }
  },
  writeThroughSyncServer: async () => {
    if (syncMutationFailure) throw syncMutationFailure;
    return syncMutationResult;
  },
  renameThroughSyncServer: async () => ({ success: true, newFilePath: "renamed.md", newFilename: "renamed.md", version: 8 }),
  deleteThroughSyncServer: async () => ({ deleted: "synced.md" }),
  // Bun shares module mocks across test files; every export a route imports must exist here.
  createThroughSyncServer: async () => { throw new Error("createThroughSyncServer is not used in this test."); },
  applyKnowledgeNodesThroughSyncServer: async () => { throw new Error("applyKnowledgeNodesThroughSyncServer is not used in this test."); },
  applyNodeContentThroughSyncServer: async () => { throw new Error("applyNodeContentThroughSyncServer is not used in this test."); },
  isSyncRoomActive: async () => { throw new Error("isSyncRoomActive is not used in this test."); },
  fetchSyncRoomStatus: async () => { throw new Error("fetchSyncRoomStatus is not used in this test."); },
}));

const { DELETE, PATCH, PUT } = await import("./route");

function saveRequest() {
  return new Request("https://bloommd.app/api/mindmaps/synced.md", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://bloommd.app",
    },
    body: JSON.stringify({ markdown: "# Synced\n\nChanged" }),
  });
}

function renameRequest() {
  return new Request("https://bloommd.app/api/mindmaps/synced.md", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://bloommd.app",
    },
    body: JSON.stringify({ newFilename: "renamed.md" }),
  });
}

describe("mindmap save route", () => {
  beforeEach(() => {
    storeWriteCalls = 0;
    storeRenameCalls = 0;
    storeDeleteCalls = 0;
    syncMutationFailure = null;
    syncMutationResult = null;
    console.warn = () => undefined;
  });

  afterEach(() => {
    console.warn = originalWarn;
  });

  test("returns the sync-room save result without writing directly to storage", async () => {
    syncMutationResult = {
      filePath: "synced.md",
      frontmatter: { title: "Synced" },
      storage: {
        mode: "database",
        documentId: "22222222-2222-4222-8222-222222222222",
        workspaceId: "33333333-3333-4333-8333-333333333333",
        version: 8,
      },
      version: 8,
    };

    const response = await PUT(saveRequest(), { params: Promise.resolve({ filename: "synced.md" }) });
    const body = await response.json() as { storage?: MindMapDocument["storage"] };

    expect(response.status).toBe(200);
    expect(body.storage?.version).toBe(8);
    expect(storeWriteCalls).toBe(0);
  });

  test("does not fall back to direct storage when the sync room is not active", async () => {
    const response = await PUT(saveRequest(), { params: Promise.resolve({ filename: "synced.md" }) });
    const body = await response.json() as { code?: string };

    expect(response.status).toBe(503);
    expect(body.code).toBe("SYNC_MUTATION_UNAVAILABLE");
    expect(storeWriteCalls).toBe(0);
  });

  test("does not fall back to direct storage when the active sync-room save fails", async () => {
    syncMutationFailure = new Error("sync unavailable");

    const response = await PUT(saveRequest(), { params: Promise.resolve({ filename: "synced.md" }) });
    const body = await response.json() as { code?: string };

    expect(response.status).toBe(503);
    expect(body.code).toBe("SYNC_MUTATION_UNAVAILABLE");
    expect(storeWriteCalls).toBe(0);
  });

  test("routes cloud rename and delete through the sync server", async () => {
    const rename = await PATCH(new Request("https://bloommd.app/api/mindmaps/synced.md", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Origin: "https://bloommd.app" },
      body: JSON.stringify({ newFilename: "renamed.md" }),
    }), { params: Promise.resolve({ filename: "synced.md" }) });
    const remove = await DELETE(new Request("https://bloommd.app/api/mindmaps/synced.md", {
      method: "DELETE",
      headers: { Origin: "https://bloommd.app" },
    }), { params: Promise.resolve({ filename: "synced.md" }) });

    expect(rename.status).toBe(200);
    expect(remove.status).toBe(200);
    expect(storeRenameCalls).toBe(0);
    expect(storeDeleteCalls).toBe(0);
    // Agent tokens are audited for renames and deletes as well as saves.
    expect(audits.slice(-2)).toEqual([
      { action: "rename", documentId: "22222222-2222-4222-8222-222222222222" },
      { action: "delete", documentId: "22222222-2222-4222-8222-222222222222" },
    ]);
  });
});
