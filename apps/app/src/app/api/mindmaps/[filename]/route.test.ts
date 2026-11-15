import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { parseFile, type MindMapDocument } from "@bloommd/core";
import { ACCOUNT_QUOTA_BYTES, decideQuotaWrite, isAccountQuotaEnforced, quotaBytes } from "@bloommd/core/account-quota";

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

// Stand-in for the sync server's quota rule (#380): the account's usage and the stored size of the document.
let quotaUsedBytes = 0;
let quotaOldBytes = 0;

let agent = false;
let storedName = "synced.md";
let rights: { access: "read" | "propose" | "write"; areas: Record<string, "read" | "propose" | "write"> } = { access: "write", areas: {} };
let proposals: Array<Record<string, unknown>> = [];
let changes: Array<Record<string, unknown>> = [];

mock.module("../../../../lib/auth", () => ({
  getApiRequestIdentity: async () => agent
    ? { authKind: "access-token", userId: "11111111-1111-4111-8111-111111111111", tokenId: "tok-1", agentName: "OpenClaw", tokenScope: "write" }
    : { authKind: "session", userId: "11111111-1111-4111-8111-111111111111", email: "tester@example.test" },
}));

mock.module("../../../../lib/db", () => ({
  // Bun shares module mocks across test files; keep what request-security and the rights check need from lib/db.
  consumeRateLimit: async () => null,
  normalizeUuid: (value: string | undefined) => value ?? null,
  getAgentTokenRights: async () => rights,
  createAgentTokenProposal: async (input: Record<string, unknown>) => { proposals.push(input); return "p-1"; },
  recordAgentTokenChange: async (input: Record<string, unknown>) => { changes.push(input); return "c-1"; },
}));

let audits: Array<{ action?: string; documentId?: string }> = [];
mock.module("../../../../lib/agent-audit", () => ({
  auditAgentWrite: async (_identity: unknown, storage: { documentId?: string } | undefined, action?: string) => { audits.push({ action, documentId: storage?.documentId }); },
}));

mock.module("../../../../lib/mindmap-storage", () => ({
  getMindmapStorage: async () => ({
    mode: "database",
    read: async () => {
      const document = parseFile(storedName, "# Synced\n");
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
  writeThroughSyncServer: async (_documentId: string, input: { markdown?: string }) => {
    if (syncMutationFailure) throw syncMutationFailure;
    // The sync server refuses a growing save beyond the limit only with BLOOMMD_ACCOUNT_QUOTA=1; same rule, same module.
    if (isAccountQuotaEnforced() && !decideQuotaWrite({ usedBytes: quotaUsedBytes, oldBytes: quotaOldBytes, newBytes: quotaBytes(input.markdown ?? "") }).allowed) {
      throw Object.assign(new Error("The account's storage quota is reached."), { code: "QUOTA_EXCEEDED", status: 413, details: { usedBytes: quotaUsedBytes, limitBytes: ACCOUNT_QUOTA_BYTES } });
    }
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
    quotaUsedBytes = 0;
    quotaOldBytes = 0;
    delete process.env.BLOOMMD_ACCOUNT_QUOTA;
    agent = false;
    storedName = "synced.md";
    rights = { access: "write", areas: {} };
    proposals = [];
    changes = [];
    console.warn = () => undefined;
  });

  afterEach(() => {
    console.warn = originalWarn;
    delete process.env.BLOOMMD_ACCOUNT_QUOTA;
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

  describe("storage quota (#380)", () => {
    const putMarkdown = (markdown: string, query = "") => PUT(new Request(`https://bloommd.app/api/mindmaps/synced.md${query}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Origin: "https://bloommd.app" },
      body: JSON.stringify({ markdown }),
    }), { params: Promise.resolve({ filename: "synced.md" }) });
    const okResult = () => {
      syncMutationResult = {
        filePath: "synced.md",
        frontmatter: {},
        storage: { mode: "database", documentId: "22222222-2222-4222-8222-222222222222", workspaceId: "33333333-3333-4333-8333-333333333333", version: 8 },
        version: 8,
      };
    };

    test("a growing PUT that takes the account over 100 MB is a 413 QUOTA_EXCEEDED with usage, limit and a German message", async () => {
      process.env.BLOOMMD_ACCOUNT_QUOTA = "1";
      quotaUsedBytes = ACCOUNT_QUOTA_BYTES;
      quotaOldBytes = 10;
      okResult();

      const response = await putMarkdown("# Synced\n\nGrows");
      const body = await response.json() as { code?: string; error?: string; usedBytes?: number; limitBytes?: number };

      expect(response.status).toBe(413);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(body.code).toBe("QUOTA_EXCEEDED");
      expect(body.usedBytes).toBe(ACCOUNT_QUOTA_BYTES);
      expect(body.limitBytes).toBe(ACCOUNT_QUOTA_BYTES);
      expect(body.error).toContain("100,0 MB von 100 MB");
      expect(body.error).toContain("Lesen, Export und Löschen");
      expect(storeWriteCalls).toBe(0);
    });

    test("the message follows ?lang=en and the Accept-Language header", async () => {
      process.env.BLOOMMD_ACCOUNT_QUOTA = "1";
      quotaUsedBytes = ACCOUNT_QUOTA_BYTES;
      quotaOldBytes = 10;
      okResult();

      const en = await (await putMarkdown("# Synced\n\nGrows", "?lang=en")).json() as { error?: string; code?: string };
      expect(en.code).toBe("QUOTA_EXCEEDED");
      expect(en.error).toContain("100.0 MB of 100 MB");
      expect(en.error).toContain("read, export and delete");

      const header = await PUT(new Request("https://bloommd.app/api/mindmaps/synced.md", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Origin: "https://bloommd.app", "Accept-Language": "en-GB,en;q=0.8" },
        body: JSON.stringify({ markdown: "# Synced\n\nGrows" }),
      }), { params: Promise.resolve({ filename: "synced.md" }) });
      expect(header.status).toBe(413);
      expect((await header.json() as { error?: string }).error).toContain("storage quota");
    });

    test("a shrinking PUT with the quota reached goes through (200)", async () => {
      process.env.BLOOMMD_ACCOUNT_QUOTA = "1";
      quotaUsedBytes = ACCOUNT_QUOTA_BYTES + 5_000_000;
      quotaOldBytes = quotaBytes("# Synced\n\nA long text that is cut down below");
      okResult();

      const response = await putMarkdown("# Synced\n");
      const body = await response.json() as { storage?: MindMapDocument["storage"] };

      expect(response.status).toBe(200);
      expect(body.storage?.version).toBe(8);
    });

    test("without the switch a growing PUT at the limit is not refused", async () => {
      quotaUsedBytes = ACCOUNT_QUOTA_BYTES + 5_000_000;
      quotaOldBytes = 10;
      okResult();

      const response = await putMarkdown("# Synced\n\nGrows and grows");

      expect(response.status).toBe(200);
      expect(isAccountQuotaEnforced()).toBe(false);
    });
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

  const send = (method: "PUT" | "PATCH" | "DELETE", body?: unknown) => {
    const request = new Request(`https://bloommd.app/api/mindmaps/${encodeURIComponent(storedName)}`, { method, headers: { "Content-Type": "application/json", Origin: "https://bloommd.app" }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const params = { params: Promise.resolve({ filename: storedName }) };
    return method === "PUT" ? PUT(request, params) : method === "PATCH" ? PATCH(request, params) : DELETE(request, params);
  };
  const saved = (version: number) => ({ filePath: storedName, frontmatter: {}, storage: { mode: "database" as const, documentId: "22222222-2222-4222-8222-222222222222", workspaceId: "33333333-3333-4333-8333-333333333333", version }, version });

  test("an agent saves a whole map only where it may write, and the log keeps the old state", async () => {
    agent = true;
    storedName = "Arbeit – Plan.md";
    rights = { access: "propose", areas: { Arbeit: "write" } };
    syncMutationResult = saved(8);
    const response = await send("PUT", { markdown: "# Synced\n\nNeu", expectedVersion: 7, agentMeta: { tool: "bloommd_update_map", summary: "Absatz ergänzt" } });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ mode: "written", changeId: "c-1" });
    expect(changes).toMatchObject([{ event: "written", area: "Arbeit", tool: "bloommd_update_map", summary: "Absatz ergänzt", afterVersion: 8, beforeMarkdown: expect.stringContaining("Synced") }]);
  });

  test("an agent that may only propose stores the proposal with the expected version; nothing is saved", async () => {
    agent = true;
    storedName = "Arbeit – Plan.md";
    rights = { access: "write", areas: { Arbeit: "propose" } };
    syncMutationResult = saved(8);
    const response = await send("PUT", { markdown: "# Synced\n\nVorschlag", expectedVersion: 6 });
    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({ mode: "proposed", proposalId: "p-1", area: "Arbeit" });
    expect(proposals).toMatchObject([{ filename: "Arbeit – Plan.md", baseVersion: 6, markdown: "# Synced\n\nVorschlag" }]);
    expect(changes).toHaveLength(0);
  });

  test("an agent in a read-only area is refused, whatever the client sends", async () => {
    agent = true;
    storedName = "Learnings › dev-team – Idee.md";
    rights = { access: "write", areas: { Learnings: "read" } };
    for (const body of [{ markdown: "# x" }, { markdown: "# x", overwrite: true, expectedVersion: 7 }]) {
      const response = await send("PUT", body);
      expect(response.status).toBe(403);
      expect(((await response.json()) as { error: string }).error).toContain('may only read in "Learnings/dev-team"');
    }
    expect(proposals).toHaveLength(0);
    expect(changes).toHaveLength(0);
  });

  test("renaming and deleting need the right to write in the old and the new area", async () => {
    agent = true;
    storedName = "Arbeit – Plan.md";
    rights = { access: "propose", areas: { Arbeit: "write" } };
    const blockedRename = await send("PATCH", { newFilename: "Privat – Plan.md" });
    expect(blockedRename.status).toBe(403);
    expect(((await blockedRename.json()) as { error: string }).error).toContain('only propose changes in "Privat"');
    expect((await send("PATCH", { newFilename: "Arbeit – Neu.md" })).status).toBe(200);
    expect(changes).toMatchObject([{ event: "renamed", area: "Arbeit" }]);
    rights = { access: "write", areas: { Arbeit: "propose" } };
    const blockedDelete = await send("DELETE");
    expect(blockedDelete.status).toBe(403);
    expect(((await blockedDelete.json()) as { code: string }).code).toBe("AGENT_WRITE_REQUIRED");
    rights = { access: "propose", areas: { Arbeit: "write" } };
    expect((await send("DELETE")).status).toBe(200);
    expect(changes.map((change) => change.event)).toEqual(["renamed", "deleted"]);
  });

  test("a rename and a delete name the agent and, when it says so, the source in the log", async () => {
    agent = true;
    storedName = "Arbeit – Plan.md";
    rights = { access: "write", areas: {} };
    expect((await send("PATCH", { newFilename: "Arbeit – Neu.md", agentMeta: { source: "Teams-Transkript", reason: "Umbenannt" } })).status).toBe(200);
    expect((await send("DELETE", { agentMeta: { source: "Aufräumen", reason: "Doppelt", tool: "cleanup" } })).status).toBe(200);
    // Without a body the log still names the agent and the route as the tool.
    expect((await send("DELETE")).status).toBe(200);
    expect(changes).toMatchObject([
      { tokenId: "tok-1", agentName: "OpenClaw", event: "renamed", tool: "api:rename", source: "Teams-Transkript", reason: "Umbenannt" },
      { tokenId: "tok-1", agentName: "OpenClaw", event: "deleted", tool: "cleanup", source: "Aufräumen", reason: "Doppelt" },
      { tokenId: "tok-1", agentName: "OpenClaw", event: "deleted", tool: "api:delete" },
    ]);
    expect(changes[2]?.source).toBeUndefined();
  });
});
