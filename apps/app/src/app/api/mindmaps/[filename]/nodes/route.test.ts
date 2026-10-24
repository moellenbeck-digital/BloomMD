import { beforeEach, describe, expect, mock, test } from "bun:test";
import { parseFile, type MindMapDocument } from "@bloommd/core";

let mode: "database" | "filesystem" = "database";
let permission: "read" | "write" = "write";
let written: MindMapDocument | null = null;
let syncCalls: Array<{ documentId: string; input: Record<string, unknown> }> = [];
let audits: unknown[] = [];

mock.module("../../../../../lib/auth", () => ({
  getApiRequestIdentity: async () => ({
    authKind: "access-token",
    userId: "11111111-1111-4111-8111-111111111111",
    tokenId: "tok-1",
    agentName: "OpenClaw",
    tokenScope: "write",
  }),
}));

mock.module("../../../../../lib/agent-audit", () => ({
  auditAgentWrite: async (identity: unknown, storage: unknown) => { audits.push({ identity, storage }); },
}));

mock.module("../../../../../lib/mindmap-storage", () => ({
  getMindmapStorage: async () => ({
    mode,
    read: async () => ({
      ...parseFile("plan.md", "# Plan <!-- bloommd:id=root01 -->\n\n## Aufgaben <!-- bloommd:id=aufg01 -->\n"),
      storage: mode === "database"
        ? { mode: "database", documentId: "22222222-2222-4222-8222-222222222222", workspaceId: "33333333-3333-4333-8333-333333333333", version: 5, permission }
        : undefined,
    }) as MindMapDocument,
    write: async (document: MindMapDocument) => { written = document; return document; },
  }),
}));

mock.module("../../../../../lib/sync-room-status", () => ({
  SyncMutationError: class SyncMutationError extends Error {
    constructor(readonly code: string, readonly status: number, message: string) { super(message); }
  },
  applyKnowledgeNodesThroughSyncServer: async (documentId: string, input: Record<string, unknown>) => {
    syncCalls.push({ documentId, input });
    return { filePath: "plan.md", storage: { documentId, version: 6 }, version: 6, ids: { t: "n1" }, created: ["n1"], updated: [] };
  },
  // Bun shares module mocks across test files; every export a route imports must exist here.
  createThroughSyncServer: async () => { throw new Error("createThroughSyncServer is not used in this test."); },
  writeThroughSyncServer: async () => { throw new Error("writeThroughSyncServer is not used in this test."); },
  renameThroughSyncServer: async () => { throw new Error("renameThroughSyncServer is not used in this test."); },
  deleteThroughSyncServer: async () => { throw new Error("deleteThroughSyncServer is not used in this test."); },
  applyNodeContentThroughSyncServer: async () => { throw new Error("applyNodeContentThroughSyncServer is not used in this test."); },
  isSyncRoomActive: async () => { throw new Error("isSyncRoomActive is not used in this test."); },
  fetchSyncRoomStatus: async () => { throw new Error("fetchSyncRoomStatus is not used in this test."); },
}));

const { POST } = await import("./route");
const call = (nodes: unknown) => POST(
  new Request("https://app.bloommd.test/api/mindmaps/plan.md/nodes", { method: "POST", headers: { Authorization: "Bearer bloom_pat_x", "Content-Type": "application/json" }, body: JSON.stringify({ nodes }) }),
  { params: Promise.resolve({ filename: "plan.md" }) },
);

describe("POST /api/mindmaps/:filename/nodes", () => {
  beforeEach(() => {
    mode = "database";
    permission = "write";
    written = null;
    syncCalls = [];
    audits = [];
  });

  test("merges cloud node operations through the sync server and audits the agent", async () => {
    const response = await call([{ ref: "t", parent: "aufg01", title: "Folien", status: "open" }]);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ids: { t: "n1" }, created: ["n1"], updated: [], version: 6 });
    expect(syncCalls[0]?.input).toMatchObject({ filename: "plan.md", userId: "11111111-1111-4111-8111-111111111111", nodes: [{ ref: "t", title: "Folien" }] });
    expect(audits).toHaveLength(1);
  });

  test("applies node operations to filesystem documents", async () => {
    mode = "filesystem";
    const response = await call([{ ref: "t", parent: "aufg01", title: "Folien", due: "2026-10-09" }]);
    expect(response.status).toBe(200);
    const body = await response.json() as { ids: { t: string } };
    expect(written?.nodes.get(body.ids.t)?.metadata).toEqual({ kind: "task", due: "2026-10-09" });
  });

  test("refuses read-only workspaces, invalid nodes and empty requests", async () => {
    permission = "read";
    expect((await call([{ title: "x" }])).status).toBe(403);
    mode = "filesystem";
    expect((await call([{ id: "missing", content: "x" }])).status).toBe(400);
    expect((await call([])).status).toBe(400);
    expect((await call([{ title: "x", kind: "evil" }])).status).toBe(400);
    expect((await call([{ title: 5 }])).status).toBe(400);
    expect((await call([{ title: "x", content: "## Kopf" }])).status).toBe(400);
    expect(written).toBeNull();
  });
});
