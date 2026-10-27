import { describe, expect, test } from "bun:test";
import * as Y from "yjs";
import { Awareness } from "y-protocols/awareness";
import type { ServerWebSocket } from "bun";
import { KnowledgeNodeNotFoundError } from "@bloommd/core/knowledge";
import { createSyncServer, getSyncRoomOpenFailure, isSyncOriginAllowed, isSyncTokenAuthorized, processSyncClientMessage, refreshSyncClientPermission, type SyncWebSocketState } from "./server";
import { SyncRoomBusyError, SyncRoomCapacityError } from "./rooms";
import { createSyncTelemetry } from "./observability";
import type { SyncRoom, WebSocketData } from "./types";

describe("isSyncTokenAuthorized", () => {
  test("allows connections when no API key is configured", () => {
    expect(isSyncTokenAuthorized(undefined, undefined)).toBe(true);
    expect(isSyncTokenAuthorized("", undefined)).toBe(true);
  });

  test("requires matching token when API key is configured", () => {
    expect(isSyncTokenAuthorized("sync-secret", undefined)).toBe(false);
    expect(isSyncTokenAuthorized("sync-secret", "wrong")).toBe(false);
    expect(isSyncTokenAuthorized("sync-secret", "sync-secret")).toBe(true);
  });
});

describe("sync origin policy", () => {
  test("allows configured browser origins and non-browser clients", () => {
    expect(isSyncOriginAllowed(["https://bloommd.app"], "https://bloommd.app")).toBe(true);
    expect(isSyncOriginAllowed(["https://bloommd.app"], undefined)).toBe(true);
  });

  test("allows configured desktop app origins", () => {
    expect(isSyncOriginAllowed(["https://bloommd.app", "views://mainview"], "views://mainview")).toBe(true);
  });

  test("rejects unconfigured browser origins", () => {
    expect(isSyncOriginAllowed(["https://bloommd.app"], "https://evil.example")).toBe(false);
  });
});

describe("existing sync client authorization", () => {
  const state = (): SyncWebSocketState => ({
    roomKey: "document-1",
    descriptor: {
      key: "document-1",
      filename: "shared.md",
      workspaceId: "workspace-1",
      documentId: "document-1",
      userId: "user-1",
      permission: "write",
    },
    permission: "write",
    userId: "user-1",
  });

  test("downgrades an existing editor connection when its role becomes viewer", async () => {
    const client = state();
    const permission = await refreshSyncClientPermission({ authorize: async () => "read" }, client);

    expect(permission).toBe("read");
    expect(client.permission).toBe("read");
  });

  test("revokes an existing connection when membership is removed", async () => {
    const client = state();
    const permission = await refreshSyncClientPermission({ authorize: async () => { throw new Error("access denied"); } }, client);

    expect(permission).toBeNull();
    expect(client.permission).toBe("write");
  });

  test("keeps a filesystem client on its connection-time permission", async () => {
    const client: SyncWebSocketState = {
      roomKey: "local.md",
      descriptor: { key: "local.md", filename: "local.md", permission: "write" },
      permission: "write",
    };

    await expect(refreshSyncClientPermission({ authorize: async () => "read" }, client)).resolves.toBe("write");
  });

  test("does not apply a message after membership is revoked", async () => {
    const client = state();
    const room = {
      key: "document-1",
      filename: "shared.md",
      documentId: "document-1",
      workspaceId: "workspace-1",
      yDoc: new Y.Doc(),
    } as unknown as SyncRoom;
    let closeCode: number | null = null;
    const ws = {
      close: (code: number) => { closeCode = code; },
    } as unknown as ServerWebSocket<WebSocketData>;

    const disposition = await processSyncClientMessage(
      { authorize: async () => { throw new Error("membership removed"); } },
      client,
      room,
      ws,
      new Uint8Array([0, 0]),
      1024,
    );

    expect(disposition).toBe("revoked");
    expect(closeCode ?? -1).toBe(4003);
    expect(room.yDoc.getMap("nodes").size).toBe(0);
    room.yDoc.destroy();
  });

  test("does not apply a message that was awaiting authorization when draining begins", async () => {
    const client = state();
    const room = {
      key: "document-1",
      filename: "shared.md",
      documentId: "document-1",
      workspaceId: "workspace-1",
      yDoc: new Y.Doc(),
    } as unknown as SyncRoom;
    let closeCode: number | null = null;
    const ws = {
      close: (code: number) => { closeCode = code; },
    } as unknown as ServerWebSocket<WebSocketData>;
    let authorize!: (permission: "read" | "write") => void;
    const authorization = new Promise<"read" | "write">((resolve) => { authorize = resolve; });
    let draining = false;

    const pending = processSyncClientMessage(
      { authorize: async () => authorization },
      client,
      room,
      ws,
      new Uint8Array([0, 0]),
      1024,
      () => draining,
    );
    draining = true;
    authorize("write");

    await expect(pending).resolves.toBe("ignored");
    expect(closeCode ?? -1).toBe(1012);
    expect(room.yDoc.getMap("nodes").size).toBe(0);
    room.yDoc.destroy();
  });
});

describe("sync health", () => {
  test("keeps metrics protected in cloud mode and exports only aggregate values", async () => {
    const telemetry = createSyncTelemetry({ write: () => undefined });
    telemetry.increment("sync_messages_total", 4);
    const roomManager = {
      getRooms: () => new Map(),
      getTelemetry: () => telemetry,
    };
    const secret = "sync-secret-with-enough-variety-123";
    const { app } = createSyncServer(roomManager as never, { syncSecret: secret });

    expect((await app.request("/metrics")).status).toBe(401);
    const response = await app.request("/metrics", { headers: { Authorization: `Bearer ${secret}` } });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/plain");
    expect(await response.text()).toContain("sync_messages_total 4");
  });

  test("reports degraded persistence without failing liveness", async () => {
    const roomManager = {
      getRooms: () => new Map([
        ["doc", { clients: new Set([{}]), lastPersistError: "VERSION_CONFLICT" }],
      ]),
    };
    const { app } = createSyncServer(roomManager as never);

    const response = await app.request("/health");
    const body = await response.json() as { status: string; rooms: number; clients: number; persistenceFailures: number; inFlightRoomOperations: number; pendingPersistenceRooms: number };

    expect(response.status).toBe(200);
    expect(body).toEqual({ status: "degraded", rooms: 1, clients: 1, persistenceFailures: 1, inFlightRoomOperations: 0, pendingPersistenceRooms: 0 });
  });

  test("reports draining as not ready and rejects new internal mutations", async () => {
    let beganDrain = false;
    let shutdownTimeout: number | undefined;
    const roomManager = {
      getRooms: () => new Map(),
      beginDrain: () => { beganDrain = true; },
      shutdown: async (options?: { timeoutMs?: number }) => {
        shutdownTimeout = options?.timeoutMs;
        return { flushedRooms: 0, failedRoomKeys: [], timedOutRoomKeys: [] };
      },
    };
    const secret = "sync-secret-with-enough-variety-123";
    const { app, drain, isDraining } = createSyncServer(roomManager as never, { syncSecret: secret, shutdownTimeoutMs: 321 });

    expect((await app.request("/ready")).status).toBe(200);
    await expect(drain()).resolves.toEqual({
      state: "drained",
      closedClients: 0,
      rooms: { flushedRooms: 0, failedRoomKeys: [], timedOutRoomKeys: [] },
    });
    expect(beganDrain).toBe(true);
    expect(shutdownTimeout).toBe(321);
    expect(isDraining()).toBe(true);
    expect((await app.request("/ready")).status).toBe(503);
    const health = await app.request("/health");
    expect(await health.json()).toEqual({ status: "draining", rooms: 0, clients: 0, persistenceFailures: 0, inFlightRoomOperations: 0, pendingPersistenceRooms: 0 });
    const mutation = await app.request("/internal/documents", {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      body: JSON.stringify({ filename: "new.md", markdown: "# New", workspaceId: "workspace-1", userId: "user-1" }),
    });
    expect(mutation.status).toBe(503);
    expect(await mutation.json()).toEqual({ error: "Sync server is draining for shutdown.", code: "SYNC_DRAINING" });
  });

  test("closes a connected WebSocket with 1012 before draining rooms", async () => {
    const yDoc = new Y.Doc();
    const awareness = new Awareness(yDoc);
    awareness.setLocalState(null);
    const room = {
      key: "drain.md",
      filename: "drain.md",
      yDoc,
      clients: new Set<ServerWebSocket<WebSocketData>>(),
      awareness,
      awarenessClients: new Map<ServerWebSocket<WebSocketData>, Set<number>>(),
      persistTimer: null,
      persistenceTimeoutTimer: null,
      destroyTimer: null,
      isPersisting: false,
      revision: 0,
      persistenceOperation: null,
      lastPersistError: null,
    } satisfies SyncRoom;
    const rooms = new Map([[room.key, room]]);
    let beganDrain = false;
    const roomManager = {
      authorize: async () => "write" as const,
      getOrCreateRoom: async () => room,
      addClient: (target: SyncRoom, ws: ServerWebSocket<WebSocketData>) => { target.clients.add(ws); },
      removeClient: (target: SyncRoom, ws: ServerWebSocket<WebSocketData>) => { target.clients.delete(ws); },
      getRooms: () => rooms,
      beginDrain: () => { beganDrain = true; },
      shutdown: async () => ({ flushedRooms: 1, failedRoomKeys: [], timedOutRoomKeys: [] }),
    };
    const { app, websocket, drain } = createSyncServer(roomManager as never);
    const server = Bun.serve({ port: 0, fetch: app.fetch, websocket });
    const endpoint = server.url.toString().replace(/^http/, "ws").replace(/\/$/, "/ws/drain.md");
    const client = new WebSocket(endpoint);

    try {
      await new Promise<void>((resolve, reject) => {
        client.addEventListener("open", () => resolve(), { once: true });
        client.addEventListener("error", () => reject(new Error("WebSocket did not open")), { once: true });
      });
      expect(room.clients.size).toBe(1);
      const closed = new Promise<number>((resolve) => {
        client.addEventListener("close", (event) => resolve(event.code), { once: true });
      });

      await expect(drain()).resolves.toMatchObject({ closedClients: 1, rooms: { flushedRooms: 1 } });
      expect(await closed).toBe(1012);
      expect(beganDrain).toBe(true);
      expect(room.clients.size).toBe(0);
    } finally {
      client.close();
      server.stop(true);
      awareness.destroy();
      yDoc.destroy();
    }
  });
});

describe("room open failures", () => {
  test("maps room capacity to a terminal capacity close code", () => {
    expect(getSyncRoomOpenFailure(new SyncRoomCapacityError())).toEqual({ code: 4008, reason: "Room capacity reached" });
    expect(getSyncRoomOpenFailure(new Error("missing file"))).toEqual({ code: 4004, reason: "File not found" });
  });
});

describe("internal room status", () => {
  test("requires the shared sync secret", async () => {
    const roomManager = { getRooms: () => new Map() };
    const { app } = createSyncServer(roomManager as never, { syncSecret: "sync-secret-with-enough-variety-123" });

    expect((await app.request("/internal/rooms/doc-1")).status).toBe(401);
    expect((await app.request("/internal/rooms/doc-1", { headers: { Authorization: "Bearer wrong" } })).status).toBe(401);
  });

  test("reports whether a document room is active", async () => {
    const roomManager = {
      getRooms: () => new Map([
        ["doc-1", {
          clients: new Set([{}]),
          isPersisting: true,
          persistTimer: {},
          lastPersistError: null,
          version: 7,
        }],
      ]),
    };
    const { app } = createSyncServer(roomManager as never, { syncSecret: "sync-secret-with-enough-variety-123" });

    const response = await app.request("/internal/rooms/doc-1", { headers: { Authorization: "Bearer sync-secret-with-enough-variety-123" } });
    const body = await response.json() as { active: boolean; clients: number; isPersisting: boolean; hasPendingPersist: boolean; degraded: boolean; version: number };

    expect(response.status).toBe(200);
    expect(body).toEqual({ active: true, clients: 1, isPersisting: true, hasPendingPersist: true, degraded: false, version: 7 });
  });
});

describe("single-writer document mutations", () => {
  const secret = "sync-secret-with-enough-variety-123";
  const headers = {
    Authorization: `Bearer ${secret}`,
    "Content-Type": "application/json",
  };

  test("routes snapshots through the room manager with the caller identity and version", async () => {
    let received: { descriptor: unknown; title: string; expectedVersion?: number } | null = null;
    const roomManager = {
      writeDocumentSnapshot: async (descriptor: unknown, document: { nodes: Map<string, { title: string }>; rootId: string }, expectedVersion?: number) => {
        received = { descriptor, title: document.nodes.get(document.rootId)?.title ?? "", expectedVersion };
        return { filePath: "synced.md", frontmatter: {}, storage: { mode: "database" as const, documentId: "doc-1", workspaceId: "workspace-1", version: 8 }, nodes: document.nodes, rootId: document.rootId };
      },
    };
    const { app } = createSyncServer(roomManager as never, { syncSecret: secret });

    const response = await app.request("/internal/documents/doc-1/snapshot", {
      method: "PUT",
      headers,
      body: JSON.stringify({
        filename: "synced.md",
        markdown: "# Updated",
        workspaceId: "workspace-1",
        userId: "user-1",
        expectedVersion: 7,
      }),
    });

    expect(response.status).toBe(200);
    expect(received).toMatchObject({ title: "Updated", expectedVersion: 7 });
    const descriptor = (received as unknown as { descriptor: unknown }).descriptor;
    expect(descriptor).toEqual({
      key: "doc-1",
      filename: "synced.md",
      workspaceId: "workspace-1",
      documentId: "doc-1",
      userId: "user-1",
      permission: "write",
    });
  });

  test("routes agent node operations to the room manager and rejects malformed nodes", async () => {
    let received: { descriptor: unknown; nodes: unknown } | null = null;
    const roomManager = {
      applyKnowledgeNodes: async (descriptor: unknown, nodes: unknown) => {
        received = { descriptor, nodes };
        return { document: { filePath: "plan.md", storage: { mode: "database", documentId: "doc-1", workspaceId: "workspace-1", version: 9 } }, ids: { t: "n1" }, created: ["n1"], updated: [] };
      },
    };
    const { app } = createSyncServer(roomManager as never, { syncSecret: secret });
    const base = { filename: "plan.md", workspaceId: "workspace-1", userId: "user-1" };

    const ok = await app.request("/internal/documents/doc-1/nodes", { method: "POST", headers, body: JSON.stringify({ ...base, nodes: [{ ref: "t", title: "Folien", status: "open", relations: [{ target: "root", label: "für" }] }] }) });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ version: 9, ids: { t: "n1" }, created: ["n1"] });
    expect((received as unknown as { nodes: unknown }).nodes).toEqual([{ ref: "t", title: "Folien", status: "open", relations: [{ target: "root", label: "für" }] }]);

    for (const nodes of [[], [{ title: 5 }], [{ title: "x", relations: "nope" }], [{ title: "x", kind: "evil" }], [{ title: "x", content: "# Kopf" }], Array.from({ length: 201 }, () => ({ title: "x" }))]) {
      const bad = await app.request("/internal/documents/doc-1/nodes", { method: "POST", headers, body: JSON.stringify({ ...base, nodes }) });
      expect(bad.status).toBe(400);
    }
  });

  test("reports a node id that is not in the live document as 404 NODE_NOT_FOUND, other bad input as 400", async () => {
    let failure: Error = new KnowledgeNodeNotFoundError("fehlt");
    const roomManager = { applyKnowledgeNodes: async () => { throw failure; } };
    const { app } = createSyncServer(roomManager as never, { syncSecret: secret });
    const body = JSON.stringify({ filename: "plan.md", workspaceId: "workspace-1", userId: "user-1", nodes: [{ id: "fehlt", status: "done" }] });
    const missing = await app.request("/internal/documents/doc-1/nodes", { method: "POST", headers, body });
    expect(missing.status).toBe(404);
    expect(await missing.json()).toMatchObject({ code: "NODE_NOT_FOUND", error: expect.stringContaining("fehlt") });
    failure = new Error("Unknown node \"x\": use an existing id or a ref created earlier in this call.");
    const invalid = await app.request("/internal/documents/doc-1/nodes", { method: "POST", headers, body });
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toMatchObject({ code: "INVALID_NODES" });
  });

  test("returns an explicit active-room response instead of allowing a snapshot overwrite", async () => {
    const roomManager = {
      writeDocumentSnapshot: async () => { throw new SyncRoomBusyError(); },
    };
    const { app } = createSyncServer(roomManager as never, { syncSecret: secret });

    const response = await app.request("/internal/documents/doc-1/snapshot", {
      method: "PUT",
      headers,
      body: JSON.stringify({ filename: "synced.md", markdown: "# Updated", workspaceId: "workspace-1", userId: "user-1" }),
    });
    const body = await response.json() as { code?: string };

    expect(response.status).toBe(409);
    expect(body.code).toBe("SYNC_ROOM_ACTIVE");
  });

  test("rejects malformed expected versions before reaching the mutation authority", async () => {
    let called = false;
    const roomManager = {
      writeDocumentSnapshot: async () => {
        called = true;
        throw new Error("must not be called");
      },
    };
    const { app } = createSyncServer(roomManager as never, { syncSecret: secret });

    const response = await app.request("/internal/documents/doc-1/snapshot", {
      method: "PUT",
      headers,
      body: JSON.stringify({ filename: "synced.md", markdown: "# Updated", workspaceId: "workspace-1", userId: "user-1", expectedVersion: -1 }),
    });

    expect(response.status).toBe(400);
    expect(called).toBe(false);
  });

  test("delegates create, rename, and delete to the sync authority", async () => {
    const calls: string[] = [];
    const roomManager = {
      createDocument: async () => {
        calls.push("create");
        return { filePath: "new.md", frontmatter: {}, storage: { mode: "database" as const, documentId: "doc-2", workspaceId: "workspace-1", version: 1 } };
      },
      renameDocument: async () => {
        calls.push("rename");
        return { documentId: "doc-2", filename: "renamed.md", version: 2 };
      },
      deleteDocument: async () => { calls.push("delete"); },
    };
    const { app } = createSyncServer(roomManager as never, { syncSecret: secret });

    const create = await app.request("/internal/documents", { method: "POST", headers, body: JSON.stringify({ filename: "new.md", markdown: "# New", workspaceId: "workspace-1", userId: "user-1" }) });
    const rename = await app.request("/internal/documents/doc-2", { method: "PATCH", headers, body: JSON.stringify({ filename: "new.md", newFilename: "renamed.md", workspaceId: "workspace-1", userId: "user-1", expectedVersion: 1 }) });
    const remove = await app.request("/internal/documents/doc-2", { method: "DELETE", headers, body: JSON.stringify({ filename: "renamed.md", workspaceId: "workspace-1", userId: "user-1", expectedVersion: 2 }) });

    expect(create.status).toBe(201);
    expect(rename.status).toBe(200);
    expect(remove.status).toBe(200);
    expect(calls).toEqual(["create", "rename", "delete"]);
  });
});
