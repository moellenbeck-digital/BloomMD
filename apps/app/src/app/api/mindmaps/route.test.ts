import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

const originalError = console.error;
let storageError: Error | null = null;
let syncCreateCalls = 0;
let agent = false;
let rights: { access: "read" | "propose" | "write"; areas: Record<string, "read" | "propose" | "write"> } = { access: "write", areas: {} };
let proposals: Array<Record<string, unknown>> = [];
let changes: Array<Record<string, unknown>> = [];

mock.module("../../../lib/auth", () => ({
  getApiRequestIdentity: async () => agent
    ? { authKind: "access-token", userId: "11111111-1111-4111-8111-111111111111", tokenId: "tok-1", agentName: "OpenClaw", tokenScope: "write" }
    : { authKind: "session", userId: "11111111-1111-4111-8111-111111111111", email: "tester@example.test" },
}));

mock.module("../../../lib/db", () => ({
  // Bun shares module mocks across test files; keep what request-security and the rights check need from lib/db.
  consumeRateLimit: async () => null,
  normalizeUuid: (value: string | undefined) => value ?? null,
  recordAgentDocumentWrite: async () => undefined,
  getAgentTokenRights: async () => rights,
  createAgentTokenProposal: async (input: Record<string, unknown>) => { proposals.push(input); return "p-1"; },
  recordAgentTokenChange: async (input: Record<string, unknown>) => { changes.push(input); return "c-1"; },
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
    agent = false;
    rights = { access: "write", areas: {} };
    proposals = [];
    changes = [];
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

  const create = (filename: string, agentMeta?: unknown) => POST(new Request("https://bloommd.app/api/mindmaps", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://bloommd.app" },
    body: JSON.stringify({ filename, markdown: "# New", ...(agentMeta ? { agentMeta } : {}) }),
  }));

  test("an agent with the right to write creates the map and the change is logged for undo", async () => {
    agent = true;
    rights = { access: "propose", areas: { "Learnings/dev-team": "write" } };
    const response = await create("Learnings › dev-team – Idee.md", { tool: "bloommd_create_map", reason: "Retro" });
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ mode: "written", changeId: "c-1" });
    expect(syncCreateCalls).toBe(1);
    expect(changes).toMatchObject([{ tokenId: "tok-1", agentName: "OpenClaw", event: "written", area: "Learnings/dev-team", createdMap: true, tool: "bloommd_create_map", reason: "Retro", afterVersion: 1 }]);
  });

  test("an agent that may only propose stores a proposal instead of creating the map", async () => {
    agent = true;
    rights = { access: "write", areas: { Arbeit: "propose" } };
    const response = await create("Arbeit – Plan.md");
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ mode: "proposed", proposalId: "p-1", filename: "Arbeit – Plan.md", area: "Arbeit" });
    expect(syncCreateCalls).toBe(0);
    expect(proposals).toMatchObject([{ tokenId: "tok-1", workspaceId: "22222222-2222-4222-8222-222222222222", area: "Arbeit", baseVersion: null, markdown: "# New" }]);
  });

  test("a read-only area refuses with the area in the message; a person is never limited", async () => {
    agent = true;
    rights = { access: "write", areas: { Learnings: "read" } };
    const response = await create("Learnings – Idee.md");
    expect(response.status).toBe(403);
    expect(((await response.json()) as { error: string }).error).toContain('may only read in "Learnings"');
    expect(syncCreateCalls).toBe(0);
    agent = false;
    expect((await create("Learnings – Idee.md")).status).toBe(201);
    expect(proposals).toHaveLength(0);
    expect(changes).toHaveLength(0);
  });
});
