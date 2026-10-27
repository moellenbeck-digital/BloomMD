import { beforeEach, describe, expect, mock, test } from "bun:test";

const USER = "11111111-1111-4111-8111-111111111111";
const WORKSPACE = "22222222-2222-4222-8222-222222222222";
const TOKEN = "33333333-3333-4333-8333-333333333333";
const MAP = "# Plan <!-- bloommd:id=root01 -->\n";
let identity: Record<string, unknown> = {};
let role = "owner";
let writes: Array<Record<string, unknown>> = [];
let undone: Array<Record<string, unknown>> = [];
let listed = 0;

mock.module("../../../../../../lib/auth", () => ({ getApiRequestIdentity: async () => identity }));
mock.module("../../../../../../lib/db", () => ({
  consumeRateLimit: async () => null,
  normalizeUuid: (value: string | undefined | null) => value ?? null,
  getWorkspaceForUser: async () => ({ id: WORKSPACE, name: "Team", slug: "team", kind: "team", role }),
  listAgentTokenChanges: async () => { listed += 1; return []; },
  listAgentTokenProposals: async () => { listed += 1; return []; },
  // Bun shares module mocks across test files; every export agent-review imports must exist.
  getAgentTokenChangeForUndo: async () => ({ id: "c-1", tokenId: TOKEN, agentName: "OpenClaw", event: "approved", origin: "approved", tool: "bloommd_update_map", filename: "Arbeit – Plan.md", area: "Arbeit", afterVersion: 5, undoable: true, undoneAt: null, beforeMarkdown: MAP, createdMap: false }),
  completeAgentTokenUndo: async (input: Record<string, unknown>) => { undone.push(input); return true; },
  createAgentTokenProposal: async () => "p-x",
  getAgentTokenRights: async () => ({ access: "write", areas: {} }),
  getAgentTokenProposal: async () => { throw new Error("not used"); },
  finishAgentTokenProposal: async () => { throw new Error("not used"); },
  readCloudDocument: async () => ({ id: "doc-1", filename: "Arbeit – Plan.md", markdown: `${MAP}\n## Neu <!-- bloommd:id=neu001 -->\n`, version: 5 }),
}));
mock.module("../../../../../../lib/sync-room-status", () => ({
  SyncMutationError: class SyncMutationError extends Error {
    constructor(readonly code: string, readonly status: number, message: string) { super(message); }
  },
  createThroughSyncServer: async () => { throw new Error("not used"); },
  deleteThroughSyncServer: async () => { throw new Error("not used"); },
  writeThroughSyncServer: async (_documentId: string, input: Record<string, unknown>) => { writes.push(input); return { storage: { version: 6 }, version: 6 }; },
}));

const undo = await import("./route");
const log = await import("../route");
const proposals = await import("../../agent-token-proposals/route");

const workspace = { params: Promise.resolve({ workspaceId: WORKSPACE }) };
const undoRequest = () => undo.POST(new Request("https://app.bloommd.test/api/x", { method: "POST", headers: { Origin: "https://app.bloommd.test", "Content-Type": "application/json" }, body: JSON.stringify({ action: "undo" }) }), { params: Promise.resolve({ workspaceId: WORKSPACE, changeId: "c-1" }) });

describe("the owner's tools for the agent log and proposals", () => {
  beforeEach(() => {
    identity = { authKind: "session", userId: USER, email: "owner@example.test", name: "Olivia Owner" };
    role = "owner";
    writes = [];
    undone = [];
    listed = 0;
  });

  test("an agent token cannot undo a change, not even its own approved one, and cannot read the owner's log or proposals", async () => {
    identity = { authKind: "access-token", userId: USER, tokenId: TOKEN, agentName: "OpenClaw", tokenScope: "write" };
    const refused = await undoRequest();
    expect(refused.status).toBe(403);
    expect(((await refused.json()) as { code: string }).code).toBe("AGENT_FORBIDDEN");
    expect((await log.GET(new Request("https://app.bloommd.test/api/x"), workspace)).status).toBe(403);
    expect((await proposals.GET(new Request("https://app.bloommd.test/api/x"), workspace)).status).toBe(403);
    expect(writes).toHaveLength(0);
    expect(undone).toHaveLength(0);
    expect(listed).toBe(0);
  });

  test("a person's token and a session may undo any change, also an approved one", async () => {
    for (const next of [{ authKind: "session", userId: USER, email: "owner@example.test", name: "Olivia Owner" }, { authKind: "access-token", userId: USER, tokenId: "tok-person", agentName: null, tokenScope: "write" }]) {
      identity = next;
      expect((await undoRequest()).status).toBe(200);
    }
    expect(writes).toHaveLength(2);
    expect(undone).toMatchObject([{ byAgent: false }, { byAgent: false }]);
  });

  test("editors and strangers cannot undo", async () => {
    role = "editor";
    expect((await undoRequest()).status).toBe(403);
    identity = {};
    expect((await undoRequest()).status).toBe(401);
    expect(writes).toHaveLength(0);
  });
});
