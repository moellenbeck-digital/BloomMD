import { beforeEach, describe, expect, mock, test } from "bun:test";

const userId = "11111111-1111-4111-8111-111111111111";
const workspaceId = "22222222-2222-4222-822222222222";
const proposalId = "33333333-3333-4333-8333-333333333333";
const documentId = "44444444-4444-4444-8444-444444444444";
let documentVersion = 7;
let documentMarkdown = "# Current\n";
let syncWrites = 0;
let reviewActions: string[] = [];
let applied = 0;
let writtenMarkdown = "";
let writtenExpectedVersion: number | undefined;
let nodeContentWrites = 0;
let nodeMutationShouldConflict = false;
let nodeProposal = false;
let childNodeProposal = false;
let proposalBeforeHash = "9abb07c02bffada490ac742b0822d8c3865f018fb0630d07e9c346995666d8d1";

mock.module("../../../../../../lib/auth", () => ({
  getApiRequestIdentity: async () => ({ authKind: "session", userId, email: "reviewer@example.test" }),
}));

mock.module("../../../../../../lib/db", () => ({
  normalizeUuid: (value: string | undefined) => value ?? null,
  getWorkspaceForUser: async () => ({ id: workspaceId, name: "Team", role: "editor" }),
  getWorkspaceAgentProposalForApply: async () => ({
    id: proposalId,
    workspaceId,
    documentId,
    filename: "plan.md",
    beforeVersion: 7,
    beforeMarkdownHash: proposalBeforeHash,
    proposedMarkdown: "# Proposed\n",
    proposedNodeContent: nodeProposal ? "Only this node changed." : null,
    proposedChildNodes: childNodeProposal ? [{ title: "Check sync health", content: "Verify retries and conflicts.", kind: "task" }] : [],
    nodeId: nodeProposal || childNodeProposal ? "child" : null,
    sourceNodeTitle: nodeProposal || childNodeProposal ? "Child" : null,
    sourceNodeContent: nodeProposal || childNodeProposal ? "Old node text." : null,
    rationale: "A reviewable draft.",
  }),
  readCloudDocument: async () => ({ id: documentId, filename: "plan.md", version: documentVersion, markdown: documentMarkdown }),
  reviewWorkspaceAgentProposal: async ({ action }: { action: string }) => { reviewActions.push(action); },
  markWorkspaceAgentProposalApplied: async () => { applied += 1; },
}));

mock.module("../../../../../../lib/request-security", () => ({
  assertRateLimit: async () => undefined,
  assertSameOriginForIdentity: () => undefined,
  readJsonBody: async <T>(request: Request) => await request.json() as T,
}));

mock.module("../../../../../../lib/sync-room-status", () => {
  class MockSyncMutationError extends Error {
    constructor(readonly code: string) { super(code); }
  }
  return {
  SyncMutationError: MockSyncMutationError,
  writeThroughSyncServer: async (_documentId: string, input: { markdown: string; expectedVersion?: number }) => { syncWrites += 1; writtenMarkdown = input.markdown; writtenExpectedVersion = input.expectedVersion; return { storage: { mode: "database" }, version: 8 }; },
  applyNodeContentThroughSyncServer: async (_documentId: string, input: { nextNodeContent: string; childNodes?: unknown[] }) => {
    if (nodeMutationShouldConflict) throw new MockSyncMutationError("AGENT_NODE_STALE");
    nodeContentWrites += 1;
    writtenMarkdown = input.nextNodeContent;
    return { storage: { mode: "database" }, version: 8 };
  },
};
});

mock.module("../../../../../../lib/workspace-api", () => ({
  workspaceErrorResponse: (error: unknown) => new Response(JSON.stringify({ error: error instanceof Error ? error.message : "failed" }), { status: 500 }),
}));

const { POST } = await import("./route");

function request() {
  return new Request(`https://bloommd.app/api/workspaces/${workspaceId}/agent-proposals/${proposalId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://bloommd.app" },
    body: JSON.stringify({ action: "apply" }),
  });
}

describe("agent proposal review route", () => {
  beforeEach(() => {
    documentVersion = 7;
    documentMarkdown = "# Current\n";
    syncWrites = 0;
    reviewActions = [];
    applied = 0;
    writtenMarkdown = "";
    writtenExpectedVersion = undefined;
    nodeContentWrites = 0;
    nodeMutationShouldConflict = false;
    nodeProposal = false;
    childNodeProposal = false;
    proposalBeforeHash = "9abb07c02bffada490ac742b0822d8c3865f018fb0630d07e9c346995666d8d1";
  });

  test("applies a reviewed proposal through the sync server, never directly through the document store", async () => {
    const response = await POST(request(), { params: Promise.resolve({ workspaceId, proposalId }) });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "applied", storage: { mode: "database" }, version: 8 });
    expect(syncWrites).toBe(1);
    expect(applied).toBe(1);
    expect(reviewActions).toEqual([]);
    expect(writtenMarkdown).toBe("# Proposed\n");
  });

  test("applies a node proposal without replacing other document content", async () => {
    nodeProposal = true;
    documentMarkdown = "# Current <!-- bloommd:id=root -->\n\n## Child <!-- bloommd:id=child -->\n\nOld node text.\n\n## Keep <!-- bloommd:id=keep -->\n\nMust stay.\n";
    const crypto = await import("node:crypto");
    proposalBeforeHash = crypto.createHash("sha256").update(documentMarkdown).digest("hex");

    const response = await POST(request(), { params: Promise.resolve({ workspaceId, proposalId }) });

    expect(response.status).toBe(200);
    expect(writtenMarkdown).toBe("Only this node changed.");
    expect(nodeContentWrites).toBe(1);
  });

  test("applies typed child-node proposals through the checked sync mutation", async () => {
    childNodeProposal = true;
    documentMarkdown = "# Current <!-- bloommd:id=root -->\n\n## Child <!-- bloommd:id=child -->\n\nOld node text.\n";
    const crypto = await import("node:crypto");
    proposalBeforeHash = crypto.createHash("sha256").update(documentMarkdown).digest("hex");
    const response = await POST(request(), { params: Promise.resolve({ workspaceId, proposalId }) });

    expect(response.status).toBe(200);
    expect(nodeContentWrites).toBe(1);
    expect(syncWrites).toBe(0);
    expect(applied).toBe(1);
  });

  test("rebases a node proposal when only another node changed", async () => {
    nodeProposal = true;
    documentVersion = 8;
    documentMarkdown = "# Current <!-- bloommd:id=root -->\n\n## Child <!-- bloommd:id=child -->\n\nOld node text.\n\n## Keep <!-- bloommd:id=keep -->\n\nUpdated independently.\n";

    const response = await POST(request(), { params: Promise.resolve({ workspaceId, proposalId }) });

    expect(response.status).toBe(200);
    expect(writtenMarkdown).toBe("Only this node changed.");
    expect(nodeContentWrites).toBe(1);
    expect(reviewActions).toEqual([]);
  });

  test("marks a node proposal stale when its target node changed", async () => {
    nodeProposal = true;
    nodeMutationShouldConflict = true;
    documentVersion = 8;
    documentMarkdown = "# Current <!-- bloommd:id=root -->\n\n## Child <!-- bloommd:id=child -->\n\nChanged by a collaborator.\n";

    const response = await POST(request(), { params: Promise.resolve({ workspaceId, proposalId }) });

    expect(response.status).toBe(409);
    expect(syncWrites).toBe(0);
    expect(reviewActions).toEqual(["mark_stale"]);
  });

  test("marks a proposal stale instead of overwriting a changed source document", async () => {
    documentVersion = 8;
    const response = await POST(request(), { params: Promise.resolve({ workspaceId, proposalId }) });

    expect(response.status).toBe(409);
    expect(syncWrites).toBe(0);
    expect(applied).toBe(0);
    expect(reviewActions).toEqual(["mark_stale"]);
  });
});
