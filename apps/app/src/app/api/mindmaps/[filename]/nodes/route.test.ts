import { beforeEach, describe, expect, mock, test } from "bun:test";
import { parseFile, type MindMapDocument } from "@bloommd/core";

let mode: "database" | "filesystem" = "database";
let permission: "read" | "write" = "write";
let written: MindMapDocument | null = null;
let syncCalls: Array<{ documentId: string; input: Record<string, unknown> }> = [];
let audits: unknown[] = [];
let filename = "plan.md";
let rights: { access: "read" | "propose" | "write"; areas: Record<string, "read" | "propose" | "write"> } = { access: "write", areas: {} };
let proposals: Array<Record<string, unknown>> = [];
let changes: Array<Record<string, unknown>> = [];
let asOwner = false;
let syncFailure: Error | null = null;

class SyncMutationError extends Error {
  constructor(readonly code: string, readonly status: number, message: string) { super(message); }
}

mock.module("../../../../../lib/auth", () => ({
  getApiRequestIdentity: async () => asOwner
    ? { authKind: "session", userId: "11111111-1111-4111-8111-111111111111" }
    : { authKind: "access-token", userId: "11111111-1111-4111-8111-111111111111", tokenId: "tok-1", agentName: "OpenClaw", tokenScope: "write" },
}));

mock.module("../../../../../lib/db", () => ({
  // Bun shares module mocks across test files; keep what request-security and the rights check need from lib/db.
  consumeRateLimit: async () => null,
  normalizeUuid: (value: string | undefined) => value ?? null,
  getAgentTokenRights: async () => rights,
  createAgentTokenProposal: async (input: Record<string, unknown>) => { proposals.push(input); return "p-1"; },
  recordAgentTokenChange: async (input: Record<string, unknown>) => { changes.push(input); return "c-1"; },
}));

mock.module("../../../../../lib/agent-audit", () => ({
  auditAgentWrite: async (identity: unknown, storage: unknown) => { audits.push({ identity, storage }); },
}));

mock.module("../../../../../lib/mindmap-storage", () => ({
  getMindmapStorage: async () => ({
    mode,
    read: async () => ({
      ...parseFile(filename, "# Plan <!-- bloommd:id=root01 -->\n\n## Aufgaben <!-- bloommd:id=aufg01 -->\n"),
      storage: mode === "database"
        ? { mode: "database", documentId: "22222222-2222-4222-8222-222222222222", workspaceId: "33333333-3333-4333-8333-333333333333", version: 5, permission }
        : undefined,
    }) as MindMapDocument,
    write: async (document: MindMapDocument) => { written = document; return document; },
  }),
}));

mock.module("../../../../../lib/sync-room-status", () => ({
  SyncMutationError,
  applyKnowledgeNodesThroughSyncServer: async (documentId: string, input: Record<string, unknown>) => {
    syncCalls.push({ documentId, input });
    if (syncFailure) throw syncFailure;
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
const call = (nodes: unknown, agentMeta?: unknown) => POST(
  new Request("https://app.bloommd.test/api/mindmaps/plan.md/nodes", { method: "POST", headers: { Authorization: "Bearer bloom_pat_x", "Content-Type": "application/json", Origin: "https://app.bloommd.test" }, body: JSON.stringify({ nodes, ...(agentMeta ? { agentMeta } : {}) }) }),
  { params: Promise.resolve({ filename }) },
);

describe("POST /api/mindmaps/:filename/nodes", () => {
  beforeEach(() => {
    mode = "database";
    permission = "write";
    written = null;
    syncCalls = [];
    audits = [];
    filename = "plan.md";
    rights = { access: "write", areas: {} };
    proposals = [];
    changes = [];
    asOwner = false;
    syncFailure = null;
  });

  test("merges cloud node operations through the sync server and audits the agent", async () => {
    const response = await call([{ ref: "t", parent: "aufg01", title: "Folien", status: "open" }]);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ids: { t: "n1" }, created: ["n1"], updated: [], version: 6, mode: "written", changeId: "c-1" });
    expect(changes).toMatchObject([{ tokenId: "tok-1", agentName: "OpenClaw", event: "written", filename: "plan.md", area: "", afterVersion: 6, beforeMarkdown: expect.stringContaining("Aufgaben") }]);
    expect(syncCalls[0]?.input).toMatchObject({ filename: "plan.md", userId: "11111111-1111-4111-8111-111111111111", nodes: [{ ref: "t", title: "Folien" }] });
    expect(audits).toHaveLength(1);
  });

  test("an unknown node id stays a 400 on the batch route, also when the live document reports it", async () => {
    syncFailure = new SyncMutationError("NODE_NOT_FOUND", 404, "Node \"nope\" does not exist in this map.");
    const response = await call([{ id: "nope", content: "x" }]);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "INVALID_NODES" });
    expect(changes).toHaveLength(0);
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

  test("an agent that may only propose gets a stored proposal and nothing is written", async () => {
    rights = { access: "write", areas: { Arbeit: "propose" } };
    filename = "Arbeit – Plan.md";
    const response = await call([{ ref: "t", parent: "aufg01", title: "Folien" }], { tool: "bloommd_update_map", reason: "Meeting", summary: "ignored by rights, only shown" });
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ mode: "proposed", proposalId: "p-1", filename: "Arbeit – Plan.md", area: "Arbeit" });
    expect(syncCalls).toHaveLength(0);
    expect(written).toBeNull();
    expect(proposals).toMatchObject([{ tokenId: "tok-1", agentName: "OpenClaw", area: "Arbeit", baseVersion: 5, tool: "bloommd_update_map", reason: "Meeting", markdown: expect.stringContaining("Folien") }]);
    expect(changes).toHaveLength(0);
  });

  test("a read-only area refuses the change and names the area", async () => {
    rights = { access: "write", areas: { Learnings: "read" } };
    filename = "Learnings – Idee.md";
    const response = await call([{ title: "x" }]);
    expect(response.status).toBe(403);
    const body = await response.json() as { error: string; code: string; area: string };
    expect(body).toMatchObject({ code: "AGENT_READ_ONLY", area: "Learnings" });
    expect(body.error).toContain('may only read in "Learnings"');
    expect(syncCalls).toHaveLength(0);
    expect(proposals).toHaveLength(0);
  });

  test("the longest area decides: a sub-area may write below a read-only parent", async () => {
    rights = { access: "propose", areas: { Learnings: "read", "Learnings/dev-team": "write" } };
    filename = "Learnings › dev-team – Idee.md";
    expect((await call([{ parent: "aufg01", title: "ok" }])).status).toBe(200);
    expect(changes[0]).toMatchObject({ area: "Learnings/dev-team", filename: "Learnings › dev-team – Idee.md" });
    filename = "Learnings › andere – Idee.md";
    const refused = await call([{ parent: "aufg01", title: "nein" }]);
    expect(refused.status).toBe(403);
    expect(((await refused.json()) as { error: string }).error).toContain('"Learnings/andere"');
    expect(syncCalls).toHaveLength(1);
  });

  test("without any stored right an agent only proposes; the owner (a session) is not limited", async () => {
    rights = { access: "propose", areas: {} };
    expect((await call([{ parent: "aufg01", title: "x" }])).status).toBe(202);
    asOwner = true;
    const response = await call([{ parent: "aufg01", title: "y" }]);
    expect(response.status).toBe(200);
    expect(await response.json()).not.toHaveProperty("changeId");
    expect(proposals).toHaveLength(1);
  });
});
