import { beforeEach, describe, expect, mock, test } from "bun:test";

const USER = "11111111-1111-4111-8111-111111111111";
const WORKSPACE = "22222222-2222-4222-8222-222222222222";
const TOKEN = "33333333-3333-4333-8333-333333333333";
const MAP = "# Plan <!-- bloommd:id=root01 -->\n";
let identity: Record<string, unknown> = {};
let change: Record<string, unknown> = {};
let rights: { access: "read" | "propose" | "write"; areas: Record<string, "read" | "propose" | "write"> } = { access: "write", areas: {} };
let writes: Array<Record<string, unknown>> = [];
let proposals: Array<Record<string, unknown>> = [];
let undone: Array<Record<string, unknown>> = [];

const owned = (extra: Record<string, unknown> = {}) => ({ id: "c-1", tokenId: TOKEN, agentName: "OpenClaw", event: "written", origin: "agent", tool: "bloommd_update_map", filename: "Arbeit – Plan.md", area: "Arbeit", afterVersion: 5, undoable: true, undoneAt: null, beforeMarkdown: MAP, createdMap: false, ...extra });

mock.module("../../../../../lib/auth", () => ({ getApiRequestIdentity: async () => identity }));
mock.module("../../../../../lib/db", () => ({
  consumeRateLimit: async () => null,
  normalizeUuid: (value: string | undefined | null) => value ?? null,
  getWorkspaceForUser: async (_user: string, workspaceId?: string | null) => ({ id: workspaceId ?? WORKSPACE, name: "Team", slug: "team", kind: "team", role: "owner" }),
  getAgentTokenChangeForUndo: async () => change,
  getAgentTokenRights: async () => rights,
  readCloudDocument: async () => ({ id: "doc-1", filename: "Arbeit – Plan.md", markdown: `${MAP}\n## Neu <!-- bloommd:id=neu001 -->\n`, version: 5 }),
  createAgentTokenProposal: async (input: Record<string, unknown>) => { proposals.push(input); return "p-undo"; },
  completeAgentTokenUndo: async (input: Record<string, unknown>) => { undone.push(input); return true; },
  // Bun shares module mocks across test files; every export agent-review imports must exist.
  getAgentTokenProposal: async () => { throw new Error("not used"); },
  finishAgentTokenProposal: async () => { throw new Error("not used"); },
}));
mock.module("../../../../../lib/sync-room-status", () => ({
  SyncMutationError: class SyncMutationError extends Error {
    constructor(readonly code: string, readonly status: number, message: string) { super(message); }
  },
  createThroughSyncServer: async () => { throw new Error("not used"); },
  deleteThroughSyncServer: async () => { throw new Error("not used"); },
  writeThroughSyncServer: async (_documentId: string, input: Record<string, unknown>) => { writes.push(input); return { storage: { version: 6 }, version: 6 }; },
}));

const { POST } = await import("./route");
const undo = (changeId = "c-1") => POST(new Request("https://app.bloommd.test/api/mindmaps/agent-access/undo", { method: "POST", headers: { Origin: "https://app.bloommd.test", "Content-Type": "application/json" }, body: JSON.stringify({ changeId }) }));

describe("an agent undoes changes through the self-service route", () => {
  beforeEach(() => {
    identity = { authKind: "access-token", userId: USER, tokenId: TOKEN, agentName: "OpenClaw", tokenScope: "write" };
    change = owned();
    rights = { access: "write", areas: {} };
    writes = [];
    proposals = [];
    undone = [];
  });

  test("its own direct change is undone and the undo names the agent", async () => {
    expect(await (await undo()).json()).toEqual({ undone: "c-1", path: "Arbeit – Plan.md" });
    expect(writes).toMatchObject([{ markdown: MAP, expectedVersion: 5, userId: USER }]);
    expect(undone).toMatchObject([{ byAgent: true, byName: "OpenClaw", tokenId: TOKEN }]);
  });

  test("a change the owner approved, another token's change and an owner's own change are the owner's to undo", async () => {
    for (const other of [owned({ origin: "approved", event: "approved" }), owned({ tokenId: "another-token" }), owned({ origin: "owner" })]) {
      change = other;
      const response = await undo();
      expect(response.status).toBe(403);
      expect(((await response.json()) as { code: string }).code).toBe("AGENT_UNDO_FORBIDDEN");
    }
    expect(writes).toHaveLength(0);
    expect(undone).toHaveLength(0);
  });

  test("a read right refuses the undo; a propose right turns it into a proposal and writes nothing", async () => {
    rights = { access: "write", areas: { Arbeit: "read" } };
    const refused = await undo();
    expect(refused.status).toBe(403);
    expect(((await refused.json()) as { code: string }).code).toBe("AGENT_READ_ONLY");
    rights = { access: "write", areas: { Arbeit: "propose" } };
    expect(await (await undo()).json()).toMatchObject({ proposed: "p-undo" });
    expect(writes).toHaveLength(0);
    expect(undone).toHaveLength(0);
    expect(proposals).toMatchObject([{ tool: "bloommd_undo", agentName: "OpenClaw", markdown: MAP }]);
  });

  test("a person's own token has no agent log to undo from here", async () => {
    identity = { authKind: "access-token", userId: USER, tokenId: "tok-person", agentName: null, tokenScope: "write" };
    expect((await undo()).status).toBe(403);
    expect(writes).toHaveLength(0);
  });
});
