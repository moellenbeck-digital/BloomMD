import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { parseFile, type MindMapDocument } from "@bloommd/core";

const originalWarn = console.warn;
const originalError = console.error;

const USER_ID = "11111111-1111-4111-8111-111111111111";
const DOCUMENT_ID = "22222222-2222-4222-8222-222222222222";
const WORKSPACE_ID = "33333333-3333-4333-8333-333333333333";

let agent = false;
let mode: "database" | "filesystem" = "database";
let role: "owner" | "editor" | "viewer" = "editor";
let revisions: Array<Record<string, unknown>> = [];
let revisionMarkdown: string | null = "# Old\n";
let syncWrites: Array<Record<string, unknown>> = [];
let syncFailure: Error | null = null;
let restored: Array<{ filename: string; revisionId: string }> = [];
let restoreFailure: Error | null = null;
const readRevisionCalls: Array<{ filename: string; revisionId: string }> = [];

mock.module("../../../../../lib/auth", () => ({
  getApiRequestIdentity: async () => agent
    ? { authKind: "access-token", userId: USER_ID, tokenId: "tok-1", agentName: "OpenClaw", tokenScope: "write" }
    : { authKind: "session", userId: USER_ID, email: "tester@example.test" },
}));

mock.module("../../../../../lib/db", () => ({
  // Bun shares module mocks across test files; keep what request-security and the rights check need from lib/db.
  consumeRateLimit: async () => null,
  normalizeUuid: (value: string | undefined) => value ?? null,
  getAgentTokenRights: async () => ({ access: "write", areas: {} }),
}));

mock.module("../../../../../lib/mindmap-storage", () => ({
  getMindmapStorage: async () => ({
    mode,
    workspace: mode === "database" ? { id: WORKSPACE_ID, name: "Team", slug: "team", kind: "team", role } : undefined,
    read: async () => ({
      ...parseFile("synced.md", "# Synced\n"),
      storage: mode === "database" ? { mode: "database", documentId: DOCUMENT_ID, workspaceId: WORKSPACE_ID, version: 7 } : undefined,
    }) satisfies MindMapDocument,
    history: async () => revisions,
    readRevision: async (filename: string, revisionId: string) => { readRevisionCalls.push({ filename, revisionId }); return revisionMarkdown; },
    restoreRevision: async (filename: string, revisionId: string) => {
      if (restoreFailure) throw restoreFailure;
      restored.push({ filename, revisionId });
    },
    list: async () => [],
    write: async (document: MindMapDocument) => document,
    rename: async () => ({ filename: "synced.md" }),
    delete: async () => undefined,
  }),
}));

class SyncMutationError extends Error {
  constructor(readonly code: string, readonly status: number, message: string) {
    super(message);
  }
}

mock.module("../../../../../lib/sync-room-status", () => ({
  SyncMutationError,
  writeThroughSyncServer: async (documentId: string, input: Record<string, unknown>) => {
    if (syncFailure) throw syncFailure;
    syncWrites.push({ documentId, ...input });
    return { filePath: "synced.md", frontmatter: { title: "Synced" }, storage: { mode: "database", documentId, workspaceId: WORKSPACE_ID, version: 8 }, version: 8 };
  },
  renameThroughSyncServer: async () => { throw new Error("not used"); },
  deleteThroughSyncServer: async () => { throw new Error("not used"); },
  createThroughSyncServer: async () => { throw new Error("not used"); },
  applyKnowledgeNodesThroughSyncServer: async () => { throw new Error("not used"); },
  applyNodeContentThroughSyncServer: async () => { throw new Error("not used"); },
  isSyncRoomActive: async () => { throw new Error("not used"); },
  fetchSyncRoomStatus: async () => { throw new Error("not used"); },
}));

const { GET, POST } = await import("./route");

const params = { params: Promise.resolve({ filename: "synced.md" }) };

function restoreRequest(body: unknown) {
  return new Request("https://bloommd.app/api/mindmaps/synced.md/history", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://bloommd.app" },
    body: JSON.stringify(body),
  });
}

const listRequest = () => new Request("https://bloommd.app/api/mindmaps/synced.md/history");

describe("note history route", () => {
  beforeEach(() => {
    agent = false;
    mode = "database";
    role = "editor";
    revisions = [{ id: "r-2", source: "cloud", replacedAt: "2026-11-03T09:00:00.000Z", size: 12, version: 6, author: "Ada" }];
    revisionMarkdown = "# Old\n";
    syncWrites = [];
    syncFailure = null;
    restored = [];
    restoreFailure = null;
    readRevisionCalls.length = 0;
    console.warn = () => undefined;
    console.error = () => undefined;
  });

  afterEach(() => {
    console.warn = originalWarn;
    console.error = originalError;
  });

  test("lists the cloud versions for an editor, who may restore", async () => {
    const response = await GET(listRequest(), params);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ source: "cloud", canRestore: true, version: 7, revisions });
  });

  test("a reader sees the cloud versions but is not offered restoring", async () => {
    role = "viewer";

    const body = await (await GET(listRequest(), params)).json() as { canRestore: boolean; revisions: unknown[] };

    expect(body.canRestore).toBe(false);
    expect(body.revisions).toHaveLength(1);
  });

  test("a note in a local folder reports its versions as local", async () => {
    mode = "filesystem";
    revisions = [{ id: "synced.md.2026-11-03T09-00-00-000Z.bak", source: "local", replacedAt: "2026-11-03T09:00:00.000Z", size: 12 }];

    const body = await (await GET(listRequest(), params)).json() as { source: string; canRestore: boolean; version: unknown };

    expect(body).toMatchObject({ source: "local", canRestore: true, version: null });
  });

  test("restoring a cloud version goes through the sync server against the current version", async () => {
    const response = await POST(restoreRequest({ revisionId: "r-2" }), params);

    expect(response.status).toBe(200);
    expect(readRevisionCalls).toEqual([{ filename: "synced.md", revisionId: "r-2" }]);
    expect(syncWrites).toEqual([{
      documentId: DOCUMENT_ID,
      filename: "synced.md",
      markdown: "# Old\n",
      workspaceId: WORKSPACE_ID,
      userId: USER_ID,
      expectedVersion: 7,
    }]);
    expect(await response.json()).toMatchObject({ storage: { version: 8 } });
  });

  test("a version the client names is checked instead of the current one", async () => {
    await POST(restoreRequest({ revisionId: "r-2", expectedVersion: 5 }), params);

    expect(syncWrites[0]!.expectedVersion).toBe(5);
  });

  test("a reader cannot restore, and nothing reaches the sync server", async () => {
    role = "viewer";

    const response = await POST(restoreRequest({ revisionId: "r-2" }), params);

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "READ_ONLY" });
    expect(readRevisionCalls).toEqual([]);
    expect(syncWrites).toEqual([]);
  });

  test("a version that is none of the note's versions is not found", async () => {
    revisionMarkdown = null;

    const response = await POST(restoreRequest({ revisionId: "r-of-another-workspace" }), params);

    expect(response.status).toBe(404);
    expect(syncWrites).toEqual([]);
  });

  test("a changed document answers 409 VERSION_CONFLICT and an occupied room 409 SYNC_ROOM_ACTIVE", async () => {
    syncFailure = new SyncMutationError("VERSION_CONFLICT", 409, "changed");
    const conflict = await POST(restoreRequest({ revisionId: "r-2" }), params);
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toMatchObject({ code: "VERSION_CONFLICT" });

    syncFailure = new SyncMutationError("SYNC_ROOM_ACTIVE", 409, "busy");
    const busy = await POST(restoreRequest({ revisionId: "r-2" }), params);
    expect(busy.status).toBe(409);
    expect(await busy.json()).toMatchObject({ code: "SYNC_ROOM_ACTIVE" });

    syncFailure = new Error("down");
    expect((await POST(restoreRequest({ revisionId: "r-2" }), params)).status).toBe(503);
  });

  test("restoring a local version restores the backup in the folder", async () => {
    mode = "filesystem";

    const response = await POST(restoreRequest({ revisionId: "synced.md.2026-11-03T09-00-00-000Z.bak" }), params);

    expect(response.status).toBe(200);
    expect(restored).toEqual([{ filename: "synced.md", revisionId: "synced.md.2026-11-03T09-00-00-000Z.bak" }]);
    expect(syncWrites).toEqual([]);
  });

  test("an unknown local version is not found", async () => {
    mode = "filesystem";
    restoreFailure = new Error("BACKUP_NOT_FOUND");

    expect((await POST(restoreRequest({ revisionId: "nope" }), params)).status).toBe(404);
  });

  test("rejects a request without a version and one from another origin", async () => {
    expect((await POST(restoreRequest({}), params)).status).toBe(400);
    expect((await POST(restoreRequest({ revisionId: "r-2", expectedVersion: -1 }), params)).status).toBe(400);
    const foreign = new Request("https://bloommd.app/api/mindmaps/synced.md/history", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "https://evil.example" },
      body: JSON.stringify({ revisionId: "r-2" }),
    });
    expect((await POST(foreign, params)).status).toBe(403);
    expect(syncWrites).toEqual([]);
  });

  test("agent tokens can neither list nor restore", async () => {
    agent = true;

    expect((await GET(listRequest(), params)).status).toBe(403);
    expect((await POST(restoreRequest({ revisionId: "r-2" }), params)).status).toBe(403);
    expect(syncWrites).toEqual([]);
  });
});
