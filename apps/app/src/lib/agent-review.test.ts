import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { AgentTokenProposalRecord } from "./db";

const USER = "11111111-1111-4111-8111-111111111111";
const WORKSPACE = "22222222-2222-4222-8222-222222222222";
const TOKEN = "33333333-3333-4333-8333-333333333333";

type Rights = { access: "read" | "propose" | "write"; areas: Record<string, "read" | "propose" | "write"> };
let identity: Record<string, unknown> = {};
let proposal: AgentTokenProposalRecord;
let current: { id: string; filename: string; markdown: string; version: number } | null = null;
let change: Record<string, unknown> | null = null;
let rights: Rights = { access: "write", areas: {} };
let role: "owner" | "editor" = "owner";
let syncCalls: Array<{ kind: string; documentId?: string; input: Record<string, unknown> }> = [];
let finished: Array<Record<string, unknown>> = [];
let undone: Array<Record<string, unknown>> = [];
let proposed: Array<Record<string, unknown>> = [];

mock.module("./auth", () => ({ getApiRequestIdentity: async () => identity }));
mock.module("./db", () => ({
  consumeRateLimit: async () => null,
  normalizeUuid: (value: string | undefined | null) => value ?? null,
  getWorkspaceForUser: async () => ({ id: WORKSPACE, name: "Team", slug: "team", kind: "team", role }),
  readCloudDocument: async () => current,
  getAgentTokenProposal: async () => proposal,
  finishAgentTokenProposal: async (input: Record<string, unknown>) => { finished.push(input); return "c-approved"; },
  getAgentTokenChangeForUndo: async () => change,
  getAgentTokenRights: async () => rights,
  createAgentTokenProposal: async (input: Record<string, unknown>) => { proposed.push(input); return "p-undo"; },
  completeAgentTokenUndo: async (input: Record<string, unknown>) => { undone.push(input); return true; },
}));
mock.module("./sync-room-status", () => ({
  SyncMutationError: class SyncMutationError extends Error {
    constructor(readonly code: string, readonly status: number, message: string) { super(message); }
  },
  createThroughSyncServer: async (input: Record<string, unknown>) => { syncCalls.push({ kind: "create", input }); return { storage: { version: 1 }, version: 1 }; },
  writeThroughSyncServer: async (documentId: string, input: Record<string, unknown>) => { syncCalls.push({ kind: "write", documentId, input }); return { storage: { version: 9 }, version: 9 }; },
  deleteThroughSyncServer: async (documentId: string, input: Record<string, unknown>) => { syncCalls.push({ kind: "delete", documentId, input }); return { deleted: "x" }; },
}));

const review = await import("./agent-review");

const MAP = "# Plan <!-- bloommd:id=root01 -->\n\n## Ziel <!-- bloommd:id=ziel01 -->\n";
const NEXT = `${MAP}\n## Neu <!-- bloommd:id=neu001 -->\n`;
const context = (): Promise<import("./agent-review").OwnerContext> => review.agentOwnerContext(new Request("https://app.bloommd.test/api/workspaces/x/agent-rights", { method: "POST", headers: { Origin: "https://app.bloommd.test" } }), WORKSPACE, { write: true });

function makeProposal(extra: Partial<AgentTokenProposalRecord> = {}): AgentTokenProposalRecord {
  return { id: "p-1", tokenId: TOKEN, workspaceId: WORKSPACE, agentName: "OpenClaw", tool: "bloommd_update_map", filename: "Arbeit – Plan.md", area: "Arbeit", baseVersion: 4, proposedMarkdown: NEXT, summary: "1 node(s) created", reason: "Meeting", source: null, status: "pending", reviewerName: null, reviewReason: null, reviewedAt: null, createdAt: "2026-10-27T08:00:00Z", ...extra };
}

beforeEach(() => {
  identity = { authKind: "session", userId: USER, email: "owner@example.test", name: "Olivia Owner" };
  proposal = makeProposal();
  current = { id: "doc-1", filename: "Arbeit – Plan.md", markdown: MAP, version: 4 };
  change = null;
  rights = { access: "write", areas: {} };
  role = "owner";
  syncCalls = [];
  finished = [];
  undone = [];
  proposed = [];
});

describe("who may manage agent rights", () => {
  test("an agent token never may, so it cannot widen its own rights", async () => {
    identity = { authKind: "access-token", userId: USER, tokenId: TOKEN, agentName: "OpenClaw", tokenScope: "write" };
    await expect(context()).rejects.toMatchObject({ status: 403, code: "AGENT_FORBIDDEN" });
  });

  test("a person's token and a session are fine; the signed-in name is the reviewer", async () => {
    expect((await context()).reviewerName).toBe("Olivia Owner");
    identity = { authKind: "access-token", userId: USER, tokenId: "t2", email: "owner@example.test", agentName: null, tokenScope: "write" };
    expect((await context()).reviewerName).toBe("owner@example.test");
  });

  test("anonymous callers are refused", async () => {
    identity = {};
    await expect(context()).rejects.toMatchObject({ status: 401 });
  });

  test("only the workspace owner, not every member: an editor cannot manage, review or undo", async () => {
    role = "editor";
    await expect(context()).rejects.toMatchObject({ status: 403, code: "OWNER_REQUIRED" });
    identity = { authKind: "access-token", userId: USER, tokenId: "t2", agentName: null, tokenScope: "write" };
    await expect(context()).rejects.toMatchObject({ status: 403, code: "OWNER_REQUIRED" });
  });
});

describe("approving and rejecting proposals", () => {
  test("approving writes through the sync server as the owner and logs the reviewer with the old state", async () => {
    const result = await review.approveAgentTokenProposal(await context(), "p-1");
    expect(result).toEqual({ applied: "p-1", changeId: "c-approved", path: "Arbeit – Plan.md", reviewer: "Olivia Owner" });
    expect(syncCalls).toEqual([{ kind: "write", documentId: "doc-1", input: { filename: "Arbeit – Plan.md", markdown: NEXT, workspaceId: WORKSPACE, userId: USER, expectedVersion: 4 } }]);
    expect(finished).toMatchObject([{ action: "approved", reviewerName: "Olivia Owner", applied: { beforeMarkdown: MAP, createdMap: false, afterVersion: 9 } }]);
  });

  test("a proposal for a new map creates it", async () => {
    proposal = makeProposal({ baseVersion: null, filename: "Arbeit – Neu.md" });
    current = null;
    await review.approveAgentTokenProposal(await context(), "p-1");
    expect(syncCalls).toMatchObject([{ kind: "create", input: { filename: "Arbeit – Neu.md", markdown: NEXT } }]);
    expect(finished).toMatchObject([{ applied: { beforeMarkdown: null, createdMap: true } }]);
  });

  test("a map that changed since is a conflict with an outline; overwriting is a deliberate choice", async () => {
    current = { id: "doc-1", filename: "Arbeit – Plan.md", markdown: `${MAP}\n## Fremd <!-- bloommd:id=fremd1 -->\n`, version: 5 };
    const failure = await review.approveAgentTokenProposal(await context(), "p-1").catch((error) => error);
    expect(failure).toMatchObject({ status: 409, code: "AGENT_PROPOSAL_CONFLICT" });
    expect((failure as { extra: { changes: unknown[] } }).extra.changes.length).toBeGreaterThan(0);
    expect(syncCalls).toHaveLength(0);
    expect(finished).toHaveLength(0);
    const result = await review.approveAgentTokenProposal(await context(), "p-1", { overwrite: true });
    expect(result).toMatchObject({ applied: "p-1", overwrote: 5 });
    expect(syncCalls).toMatchObject([{ kind: "write", input: { expectedVersion: 5 } }]);
    // What was replaced stays in the log for undo.
    expect(finished[0]).toMatchObject({ applied: { beforeMarkdown: expect.stringContaining("Fremd") } });
  });

  test("a map that exists although the proposal creates it is a conflict, too", async () => {
    proposal = makeProposal({ baseVersion: null });
    await expect(review.approveAgentTokenProposal(await context(), "p-1")).rejects.toMatchObject({ code: "AGENT_PROPOSAL_CONFLICT" });
  });

  test("rejecting logs the reviewer and an optional reason, and writes nothing", async () => {
    const result = await review.rejectAgentTokenProposal(await context(), "p-1", "  Passt nicht  ");
    expect(result).toEqual({ rejected: "p-1", reviewer: "Olivia Owner", reason: "Passt nicht" });
    expect(finished).toMatchObject([{ action: "rejected", reviewerName: "Olivia Owner", reason: "Passt nicht" }]);
    expect(syncCalls).toHaveLength(0);
  });

  test("the outline names what a proposal changes and whether the map moved on", async () => {
    const described = await review.describeProposal(await context(), proposal);
    expect(described.stale).toBe(false);
    expect(described.changes).toEqual([{ mark: "+", id: "neu001", title: "Neu", level: 2 }]);
    expect(described).not.toHaveProperty("proposedMarkdown");
    current = { ...current!, version: 6 };
    expect((await review.describeProposal(await context(), proposal)).stale).toBe(true);
  });
});

describe("undo", () => {
  const owned = (extra: Record<string, unknown> = {}) => ({ id: "c-1", tokenId: TOKEN, agentName: "OpenClaw", event: "written", origin: "agent", filename: "Arbeit – Plan.md", area: "Arbeit", afterVersion: 4, undoable: true, undoneAt: null, beforeMarkdown: MAP, createdMap: false, ...extra });

  test("the owner restores the old state of any change, also an approved one", async () => {
    change = owned({ origin: "approved" });
    const result = await review.undoAgentChange(WORKSPACE, "c-1", { kind: "owner", userId: USER, name: "Olivia Owner" });
    expect(result).toEqual({ undone: "c-1", path: "Arbeit – Plan.md" });
    expect(syncCalls).toMatchObject([{ kind: "write", documentId: "doc-1", input: { markdown: MAP, expectedVersion: 4, userId: USER } }]);
    expect(undone).toMatchObject([{ changeId: "c-1", byName: "Olivia Owner", byUserId: USER, byAgent: false }]);
  });

  test("a created map is removed again; an edited map is left alone", async () => {
    change = owned({ createdMap: true, beforeMarkdown: null });
    await review.undoAgentChange(WORKSPACE, "c-1", { kind: "owner", userId: USER, name: "O" });
    expect(syncCalls[0]).toMatchObject({ kind: "delete", documentId: "doc-1" });
    syncCalls = [];
    current = { ...current!, version: 5 };
    await expect(review.undoAgentChange(WORKSPACE, "c-1", { kind: "owner", userId: USER, name: "O" })).rejects.toMatchObject({ code: "CHANGE_EDITED_LATER" });
    expect(syncCalls).toHaveLength(0);
  });

  test("unknown, undone and old changes are refused", async () => {
    const actor = { kind: "owner" as const, userId: USER, name: "O" };
    change = null;
    await expect(review.undoAgentChange(WORKSPACE, "c-9", actor)).rejects.toMatchObject({ status: 404 });
    change = owned({ undoneAt: "2026-10-27T09:00:00Z" });
    await expect(review.undoAgentChange(WORKSPACE, "c-1", actor)).rejects.toMatchObject({ code: "CHANGE_UNDONE" });
    change = owned({ undoable: false, beforeMarkdown: null });
    await expect(review.undoAgentChange(WORKSPACE, "c-1", actor)).rejects.toMatchObject({ code: "CHANGE_NOT_UNDOABLE" });
  });

  const agent = { kind: "agent" as const, userId: USER, tokenId: TOKEN, agentName: "OpenClaw" };

  test("an agent undoes only its own direct changes within its rights", async () => {
    change = owned();
    await review.undoAgentChange(WORKSPACE, "c-1", agent);
    expect(syncCalls).toMatchObject([{ kind: "write" }]);
    expect(undone).toMatchObject([{ byAgent: true }]);
    change = owned({ origin: "approved" });
    await expect(review.undoAgentChange(WORKSPACE, "c-1", agent)).rejects.toMatchObject({ code: "AGENT_UNDO_FORBIDDEN" });
    change = owned({ tokenId: "someone-else" });
    await expect(review.undoAgentChange(WORKSPACE, "c-1", agent)).rejects.toMatchObject({ code: "AGENT_UNDO_FORBIDDEN" });
  });

  test("where the agent may only propose, the undo becomes a proposal; where it may only read, it is refused", async () => {
    change = owned();
    rights = { access: "write", areas: { Arbeit: "propose" } };
    expect(await review.undoAgentChange(WORKSPACE, "c-1", agent)).toEqual({ proposed: "p-undo", changeId: "c-1", path: "Arbeit – Plan.md" });
    expect(proposed).toMatchObject([{ tool: "bloommd_undo", baseVersion: 4, markdown: MAP }]);
    expect(syncCalls).toHaveLength(0);
    change = owned({ createdMap: true, beforeMarkdown: null });
    await expect(review.undoAgentChange(WORKSPACE, "c-1", agent)).rejects.toMatchObject({ code: "AGENT_WRITE_REQUIRED" });
    rights = { access: "write", areas: { Arbeit: "read" } };
    change = owned();
    const refused = await review.undoAgentChange(WORKSPACE, "c-1", agent).catch((error) => error);
    expect(refused).toMatchObject({ status: 403, code: "AGENT_READ_ONLY" });
    expect(refused.message).toContain('"Arbeit"');
  });
});
