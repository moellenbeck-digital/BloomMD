import { beforeEach, describe, expect, mock, test } from "bun:test";
import { parseFile, serializeToMarkdown, type MindMapDocument } from "@bloommd/core";

const USER = "11111111-1111-4111-8111-111111111111";
const MARKDOWN = [
  "# Plan <!-- bloommd:id=root01 -->",
  "",
  '## Aufgaben <!-- bloommd:id=aufg01 --> <!-- bloommd:meta={"kind":"task","status":"open","due":"2026-10-01","assignee":"Tom"} -->',
  "",
  "Erste Zeile.",
  "",
  "### Alt <!-- bloommd:id=alt001 -->",
  "",
  "## Ideen <!-- bloommd:id=idee01 -->",
  "",
].join("\n");

class SyncMutationError extends Error {
  constructor(readonly code: string, readonly status: number, message: string) { super(message); }
}

let who: "agent" | "session" | "pat" = "agent";
let mode: "database" | "filesystem" = "database";
let permission: "read" | "write" = "write";
let written: MindMapDocument | null = null;
let syncCalls: Array<{ documentId: string; input: Record<string, unknown> }> = [];
let syncFailure: SyncMutationError | null = null;
let audits: unknown[] = [];
let filename = "plan.md";
let rights: { access: "read" | "propose" | "write"; areas: Record<string, "read" | "propose" | "write"> } = { access: "write", areas: {} };
let proposals: Array<Record<string, unknown>> = [];
let changes: Array<Record<string, unknown>> = [];

mock.module("../../../../../../lib/auth", () => ({
  getApiRequestIdentity: async () => who === "session"
    ? { authKind: "session", userId: USER }
    : { authKind: "access-token", userId: USER, tokenId: "tok-1", tokenScope: "write", ...(who === "agent" ? { agentName: "OpenClaw" } : {}) },
}));

mock.module("../../../../../../lib/db", () => ({
  // Bun shares module mocks across test files; keep what request-security and the rights check need from lib/db.
  consumeRateLimit: async () => null,
  normalizeUuid: (value: string | undefined) => value ?? null,
  getAgentTokenRights: async () => rights,
  createAgentTokenProposal: async (input: Record<string, unknown>) => { proposals.push(input); return "p-1"; },
  recordAgentTokenChange: async (input: Record<string, unknown>) => { changes.push(input); return "c-1"; },
}));

mock.module("../../../../../../lib/agent-audit", () => ({
  auditAgentWrite: async (identity: unknown, storage: unknown) => { audits.push({ identity, storage }); },
}));

mock.module("../../../../../../lib/mindmap-storage", () => ({
  getMindmapStorage: async () => ({
    mode,
    read: async () => ({
      ...parseFile(filename, MARKDOWN),
      storage: mode === "database"
        ? { mode: "database", documentId: "22222222-2222-4222-8222-222222222222", workspaceId: "33333333-3333-4333-8333-333333333333", version: 5, permission }
        : undefined,
    }) as MindMapDocument,
    write: async (document: MindMapDocument) => { written = document; return document; },
  }),
}));

mock.module("../../../../../../lib/sync-room-status", () => ({
  SyncMutationError,
  applyKnowledgeNodesThroughSyncServer: async (documentId: string, input: Record<string, unknown>) => {
    syncCalls.push({ documentId, input });
    if (syncFailure) throw syncFailure;
    return { filePath: "plan.md", storage: { documentId, version: 6 }, version: 6, ids: { aufg01: "aufg01" }, created: [], updated: ["aufg01"] };
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

const { PATCH } = await import("./route");
const call = (patch: unknown, nodeId = "aufg01") => PATCH(
  new Request(`https://app.bloommd.test/api/mindmaps/plan.md/nodes/${nodeId}`, { method: "PATCH", headers: { Authorization: "Bearer bloom_pat_x", "Content-Type": "application/json", Origin: "https://app.bloommd.test" }, body: JSON.stringify(patch) }),
  { params: Promise.resolve({ filename, nodeId }) },
);

describe("PATCH /api/mindmaps/:filename/nodes/:nodeId", () => {
  beforeEach(() => {
    who = "agent";
    mode = "database";
    permission = "write";
    written = null;
    syncCalls = [];
    syncFailure = null;
    audits = [];
    filename = "plan.md";
    rights = { access: "write", areas: {} };
    proposals = [];
    changes = [];
  });

  test("an agent with the right to write changes only the given fields, and the change is logged with agent and source", async () => {
    const response = await call({ status: "done", agentMeta: { tool: "bloommd_update_node", source: "Teams-Transkript 27.10.", reason: "Erledigt" } });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ids: { aufg01: "aufg01" }, created: [], updated: ["aufg01"], version: 6, mode: "written", changeId: "c-1" });
    // The sync server gets the same node operations as the batch route: the node and nothing else.
    expect(syncCalls[0]?.input).toMatchObject({ filename: "plan.md", userId: USER, nodes: [{ id: "aufg01", status: "done" }] });
    expect(Object.keys((syncCalls[0]!.input.nodes as Array<Record<string, unknown>>)[0]!).sort()).toEqual(["id", "status"]);
    expect(changes).toMatchObject([{ tokenId: "tok-1", agentName: "OpenClaw", event: "written", tool: "bloommd_update_node", source: "Teams-Transkript 27.10.", reason: "Erledigt", filename: "plan.md", afterVersion: 6, beforeMarkdown: expect.stringContaining("Aufgaben") }]);
    expect(audits).toHaveLength(1);
  });

  test("the log names the route as the tool when the agent says nothing", async () => {
    await call({ title: "Aufgaben neu" });
    expect(changes[0]).toMatchObject({ tool: "api:node", agentName: "OpenClaw" });
  });

  test("children are new nodes below the node; a child may sit below an earlier child", async () => {
    const response = await call({ content: "Mehr.", children: [{ ref: "a", title: "Neu A", status: "open" }, { parent: "a", title: "Neu B" }] });
    expect(response.status).toBe(200);
    expect(syncCalls[0]?.input.nodes).toEqual([
      { id: "aufg01", content: "Mehr." },
      { ref: "a", title: "Neu A", status: "open", parent: "aufg01" },
      { parent: "a", title: "Neu B" },
    ]);
  });

  test("relations and metadata go through the same parser as the batch route", async () => {
    await call({ due: "2026-11-01", assignee: "Anna", relations: [{ target: "idee01", label: "gehört zu" }] });
    expect(syncCalls[0]?.input.nodes).toEqual([{ id: "aufg01", due: "2026-11-01", assignee: "Anna", relations: [{ target: "idee01", label: "gehört zu" }] }]);
  });

  test("a read-only area refuses the change, whatever the body says", async () => {
    rights = { access: "write", areas: { Learnings: "read" } };
    filename = "Learnings – Idee.md";
    const response = await call({ status: "done", children: [{ title: "x" }] });
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "AGENT_READ_ONLY", area: "Learnings" });
    expect(syncCalls).toHaveLength(0);
    expect(proposals).toHaveLength(0);
    expect(changes).toHaveLength(0);
  });

  test("an agent that may only propose gets a proposal with the base version; the new children end up last", async () => {
    rights = { access: "propose", areas: {} };
    const response = await call({ status: "done", children: [{ title: "Neu" }], agentMeta: { source: "Meeting" } });
    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({ mode: "proposed", proposalId: "p-1" });
    expect(syncCalls).toHaveLength(0);
    expect(changes).toHaveLength(0);
    expect(proposals).toMatchObject([{ tokenId: "tok-1", agentName: "OpenClaw", baseVersion: 5, tool: "api:node", source: "Meeting" }]);
    const proposed = parseFile("plan.md", proposals[0]!.markdown as string);
    expect(proposed.nodes.get("aufg01")?.metadata).toMatchObject({ status: "done", due: "2026-10-01", assignee: "Tom" });
    const children = proposed.nodes.get("aufg01")!.children.map((id) => proposed.nodes.get(id)!.title);
    expect(children).toEqual(["Alt", "Neu"]);
  });

  test("a session and a personal token act as their owner: no gate, no agent log", async () => {
    rights = { access: "read", areas: {} };
    for (const identity of ["session", "pat"] as const) {
      who = identity;
      const response = await call({ status: "in_progress" });
      expect(response.status).toBe(200);
      expect(await response.json()).not.toHaveProperty("changeId");
    }
    expect(syncCalls).toHaveLength(2);
    expect(changes).toHaveLength(0);
    expect(proposals).toHaveLength(0);
  });

  test("an unknown node id is a 404 with a code on every path", async () => {
    // Merge into the live document: the sync server says so.
    syncFailure = new SyncMutationError("NODE_NOT_FOUND", 404, 'Node "nope" does not exist in this map.');
    const live = await call({ status: "done" }, "nope");
    expect(live.status).toBe(404);
    expect(await live.json()).toMatchObject({ code: "NODE_NOT_FOUND" });
    // A proposal and a filesystem map are checked against the Markdown.
    rights = { access: "propose", areas: {} };
    const proposed = await call({ status: "done" }, "nope");
    expect(proposed.status).toBe(404);
    expect(await proposed.json()).toMatchObject({ code: "NODE_NOT_FOUND" });
    expect(proposals).toHaveLength(0);
    mode = "filesystem";
    who = "session";
    expect((await call({ status: "done" }, "nope")).status).toBe(404);
    expect(written).toBeNull();
    expect(changes).toHaveLength(0);
  });

  test("invalid fields are a 400 INVALID_NODES and nothing is sent", async () => {
    const bad: unknown[] = [
      {},
      { children: [] },
      [],
      { id: "other", status: "done" },
      { ref: "x", status: "done" },
      { parent: "root01", status: "done" },
      { unknown: 1 },
      { status: "kaputt" },
      { kind: "evil" },
      { due: "morgen" },
      { title: 5 },
      { content: "## Kopf" },
      { relations: "nope" },
      { children: "nope" },
      { children: [{ id: "alt001", content: "x" }] },
      { children: [{ title: "ok" }, { title: 7 }] },
      { children: [{ title: "x", content: "```" }] },
      { children: Array.from({ length: 200 }, (_, index) => ({ title: `k${index}` })) },
    ];
    for (const patch of bad) {
      const response = await call(patch);
      expect({ patch, status: response.status, code: ((await response.json()) as { code?: string }).code }).toEqual({ patch, status: 400, code: "INVALID_NODES" });
    }
    expect(syncCalls).toHaveLength(0);
    expect(proposals).toHaveLength(0);
  });

  test("a read-only workspace refuses the change", async () => {
    permission = "read";
    expect((await call({ status: "done" })).status).toBe(403);
    expect(syncCalls).toHaveLength(0);
  });

  test("an agent token is refused outside the cloud database, whatever its rights say", async () => {
    mode = "filesystem";
    const response = await call({ status: "done" });
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "AGENT_WORKSPACE_REQUIRED" });
    expect(written).toBeNull();
    expect(changes).toHaveLength(0);
  });

  test("a filesystem map keeps what the change does not name", async () => {
    mode = "filesystem";
    who = "session";
    const response = await call({ note: "Notiz", children: [{ ref: "k", title: "Kind", status: "open" }] });
    expect(response.status).toBe(200);
    const body = await response.json() as { ids: { k: string }; created: string[]; updated: string[] };
    expect(body.updated).toEqual(["aufg01"]);
    expect(body.created).toEqual([body.ids.k]);
    const doc = written!;
    expect(doc.nodes.get("aufg01")?.metadata).toEqual({ kind: "task", status: "open", due: "2026-10-01", assignee: "Tom", note: "Notiz" });
    expect(doc.nodes.get("aufg01")?.content).toBe("Erste Zeile.");
    expect(doc.nodes.get("aufg01")!.children.map((id) => doc.nodes.get(id)!.title)).toEqual(["Alt", "Kind"]);
    expect(serializeToMarkdown(doc)).toContain("## Ideen");
  });
});
