import { beforeEach, describe, expect, mock, test } from "bun:test";

const USER = "11111111-1111-4111-8111-111111111111";
const WORKSPACE = "22222222-2222-4222-8222-222222222222";
const TOKEN = "33333333-3333-4333-8333-333333333333";
let identity: Record<string, unknown> = {};
let currentVersion = 4;
let finished: Array<Record<string, unknown>> = [];
let writes = 0;

mock.module("../../../../../../lib/auth", () => ({ getApiRequestIdentity: async () => identity }));
mock.module("../../../../../../lib/db", () => ({
  consumeRateLimit: async () => null,
  normalizeUuid: (value: string | undefined | null) => value ?? null,
  getWorkspaceForUser: async () => ({ id: WORKSPACE, name: "Team", slug: "team", kind: "team", role: "owner" }),
  // Bun shares module mocks across test files; every export agent-review imports must exist.
  completeAgentTokenUndo: async () => true,
  createAgentTokenProposal: async () => "p-x",
  getAgentTokenChangeForUndo: async () => null,
  getAgentTokenRights: async () => ({ access: "propose", areas: {} }),
  readCloudDocument: async () => ({ id: "doc-1", filename: "Arbeit – Plan.md", markdown: "# Plan <!-- bloommd:id=root01 -->\n", version: currentVersion }),
  getAgentTokenProposal: async () => ({ id: "p-1", tokenId: TOKEN, workspaceId: WORKSPACE, agentName: "OpenClaw", tool: "bloommd_update_map", filename: "Arbeit – Plan.md", area: "Arbeit", baseVersion: 4, proposedMarkdown: "# Plan <!-- bloommd:id=root01 -->\n\n## Neu <!-- bloommd:id=neu001 -->\n", summary: "x", reason: null, source: null, status: "pending" }),
  finishAgentTokenProposal: async (input: Record<string, unknown>) => { finished.push(input); return "c-1"; },
}));
mock.module("../../../../../../lib/sync-room-status", () => ({
  SyncMutationError: class SyncMutationError extends Error {
    constructor(readonly code: string, readonly status: number, message: string) { super(message); }
  },
  createThroughSyncServer: async () => { throw new Error("not used"); },
  deleteThroughSyncServer: async () => { throw new Error("not used"); },
  writeThroughSyncServer: async () => { writes += 1; return { storage: { version: 5 }, version: 5 }; },
}));

const { POST } = await import("./route");
const call = (body: unknown) => POST(new Request("https://app.bloommd.test/api/x", { method: "POST", headers: { Origin: "https://app.bloommd.test", "Content-Type": "application/json" }, body: JSON.stringify(body) }), { params: Promise.resolve({ workspaceId: WORKSPACE, proposalId: "p-1" }) });

describe("review of an agent token proposal", () => {
  beforeEach(() => {
    identity = { authKind: "session", userId: USER, email: "owner@example.test", name: "Olivia Owner" };
    currentVersion = 4;
    finished = [];
    writes = 0;
  });

  test("approving applies the proposal and the log names the signed-in reviewer", async () => {
    const response = await call({ action: "approve" });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ applied: "p-1", changeId: "c-1", reviewer: "Olivia Owner" });
    expect(writes).toBe(1);
    expect(finished).toMatchObject([{ action: "approved", reviewerName: "Olivia Owner" }]);
  });

  test("a personal token (command line) reviews through the same path and is named by its owner", async () => {
    identity = { authKind: "access-token", userId: USER, email: "owner@example.test", name: "Olivia Owner", tokenId: "t2", agentName: null, tokenScope: "write" };
    expect((await call({ action: "reject", reason: "Zu ungenau" })).status).toBe(200);
    expect(finished).toMatchObject([{ action: "rejected", reviewerName: "Olivia Owner", reason: "Zu ungenau" }]);
    expect(writes).toBe(0);
  });

  test("a map that changed since is a conflict (409) until the owner overwrites on purpose", async () => {
    currentVersion = 6;
    const conflict = await call({ action: "approve" });
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toMatchObject({ code: "AGENT_PROPOSAL_CONFLICT" });
    expect(writes).toBe(0);
    expect((await call({ action: "approve", overwrite: true })).status).toBe(200);
    expect(writes).toBe(1);
  });

  test("agent tokens cannot approve their own proposals; unknown actions are refused", async () => {
    identity = { authKind: "access-token", userId: USER, tokenId: TOKEN, agentName: "OpenClaw", tokenScope: "write" };
    expect((await call({ action: "approve" })).status).toBe(403);
    identity = { authKind: "session", userId: USER, email: "owner@example.test" };
    expect((await call({ action: "delete" })).status).toBe(400);
    expect(writes).toBe(0);
    expect(finished).toHaveLength(0);
  });
});
