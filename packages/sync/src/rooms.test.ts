import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import * as Y from "yjs";
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate } from "y-protocols/awareness";
import type { ServerWebSocket } from "bun";
import { createRoomManager, SyncNodeConflictError, SyncRoomBusyError, SyncServerDrainingError, type RoomManager } from "./rooms";
import { TestClock } from "./clock";
import { createSyncTelemetry } from "./observability";
import { releaseAwarenessClients } from "./sync-handler";
import { parseFile, yDocToDocument } from "@bloommd/core";
import {
  SyncDocumentVersionConflictError,
  SyncPersistenceCommitUnknownError,
  SyncPersistenceAuthorizationError,
  SyncPersistenceTimeoutError,
  SyncRetryablePersistenceError,
  type DocumentPersistence,
} from "./persistence";
import type { RoomDescriptor, SyncServerConfig, WebSocketData } from "./types";

function createMockWs(roomName: string) {
  return {
    sendBinary(_data: Uint8Array) {},
    readyState: 1,
    data: { roomName },
  } as unknown as import("bun").ServerWebSocket<WebSocketData>;
}

const SAMPLE_MD = `---
title: Test
id: "abc123"
created: "2026-04-01T00:00:00Z"
updated: "2026-04-01T00:00:00Z"
---

# Test

Root content.

## Child A

Content A.
`;

let tempDir: string;
let config: SyncServerConfig;
let managers: RoomManager[];
let clock: TestClock;

function newManager() {
  const manager = createRoomManager(config, undefined, clock);
  managers.push(manager);
  return manager;
}

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "bloommd-sync-test-"));
  await writeFile(join(tempDir, "test.md"), SAMPLE_MD, "utf-8");
  config = {
    baseDir: tempDir,
    port: 0,
    persistDebounceMs: 50,
    destroyDelayMs: 100,
  };
  managers = [];
  clock = new TestClock();
});

afterEach(async () => {
  await Promise.all(managers.map((manager) => manager.shutdown()));
  await rm(tempDir, { recursive: true, force: true });
});

describe("createRoomManager", () => {
  test("getOrCreateRoom loads .md file into Y.Doc", async () => {
    const manager = newManager();
    const room = await manager.getOrCreateRoom("test.md");

    expect(room.filename).toBe("test.md");
    expect(room.clients.size).toBe(0);

    const yNodes = room.yDoc.getMap("nodes");
    expect(yNodes.size).toBe(2); // root "Test" + "Child A"

    const yMeta = room.yDoc.getMap("meta");
    expect(yMeta.get("rootId")).toBeDefined();
  });

  test("getOrCreateRoom returns same room on second call", async () => {
    const manager = newManager();
    const room1 = await manager.getOrCreateRoom("test.md");
    const room2 = await manager.getOrCreateRoom("test.md");

    expect(room1).toBe(room2);
  });

  test("getOrCreateRoom throws for non-existent file", async () => {
    const manager = newManager();

    expect(manager.getOrCreateRoom("nope.md")).rejects.toThrow();
  });

  test("addClient and removeClient track clients", async () => {
    const manager = newManager();
    const room = await manager.getOrCreateRoom("test.md");
    const ws = createMockWs("test.md");

    manager.addClient(room, ws);
    expect(room.clients.size).toBe(1);

    manager.removeClient(room, ws);
    expect(room.clients.size).toBe(0);
  });

  test("persistRoom writes Y.Doc state back to .md file", async () => {
    const manager = newManager();
    const room = await manager.getOrCreateRoom("test.md");

    // Modify Y.Doc
    const yNodes = room.yDoc.getMap("nodes");
    const yMeta = room.yDoc.getMap("meta");
    const rootId = yMeta.get("rootId") as string;
    const rootNode = yNodes.get(rootId) as import("yjs").Map<unknown>;

    room.yDoc.transact(() => {
      rootNode.set("title", "Updated Title");
    });

    await manager.persistRoom(room);

    const content = await readFile(join(tempDir, "test.md"), "utf-8");
    expect(content).toContain("# Updated Title");
  });

  test("room is destroyed after destroyDelay when last client leaves", async () => {
    const manager = newManager();
    const room = await manager.getOrCreateRoom("test.md");
    const ws = createMockWs("test.md");

    manager.addClient(room, ws);
    manager.removeClient(room, ws);
    await manager.persistRoom(room);
    await Promise.resolve();

    // Room still exists immediately
    expect(manager.getRooms().has("test.md")).toBe(true);

    await clock.advanceBy(config.destroyDelayMs);

    expect(manager.getRooms().has("test.md")).toBe(false);
  });

  test("destroy is cancelled when new client joins during delay", async () => {
    const manager = newManager();
    const room = await manager.getOrCreateRoom("test.md");
    const ws1 = createMockWs("test.md");
    const ws2 = createMockWs("test.md");

    manager.addClient(room, ws1);
    manager.removeClient(room, ws1);
    await manager.persistRoom(room);
    await Promise.resolve();

    // New client joins before destroy
    await clock.advanceBy(50);
    const sameRoom = await manager.getOrCreateRoom("test.md");
    manager.addClient(sameRoom, ws2);

    // Wait past destroy delay
    await clock.advanceBy(config.destroyDelayMs);

    // Room should still exist because a client is connected
    expect(manager.getRooms().has("test.md")).toBe(true);

    manager.removeClient(sameRoom, ws2);
  });

  test("debounced persist writes after delay", async () => {
    const manager = newManager();
    const room = await manager.getOrCreateRoom("test.md");

    // Modify Y.Doc — triggers schedulePersist via update handler
    const yNodes = room.yDoc.getMap("nodes");
    const yMeta = room.yDoc.getMap("meta");
    const rootId = yMeta.get("rootId") as string;
    const rootNode = yNodes.get(rootId) as import("yjs").Map<unknown>;

    room.yDoc.transact(() => {
      rootNode.set("title", "Debounced Title");
    });

    // Not persisted immediately
    const contentBefore = await readFile(join(tempDir, "test.md"), "utf-8");
    expect(contentBefore).not.toContain("Debounced Title");

    await clock.advanceBy(config.persistDebounceMs);
    await manager.persistRoom(room);

    const contentAfter = await readFile(join(tempDir, "test.md"), "utf-8");
    expect(contentAfter).toContain("# Debounced Title");
  });

  test("persists only the latest update after a deterministic debounce", async () => {
    const savedTitles: string[] = [];
    const persistence: DocumentPersistence = {
      authorize: async () => "write",
      load: async (descriptor) => parseFile(descriptor.filename, SAMPLE_MD),
      save: async (_descriptor, document) => {
        savedTitles.push(document.nodes.get(document.rootId)?.title ?? "");
        return document;
      },
    };
    const manager = createRoomManager(config, persistence, clock);
    managers.push(manager);
    const room = await manager.getOrCreateRoom("test.md");
    const rootId = room.yDoc.getMap("meta").get("rootId") as string;
    const rootNode = room.yDoc.getMap("nodes").get(rootId) as import("yjs").Map<unknown>;

    rootNode.set("title", "First title");
    await clock.advanceBy(config.persistDebounceMs - 1);
    expect(savedTitles).toEqual([]);

    rootNode.set("title", "Latest title");
    await clock.advanceBy(config.persistDebounceMs - 1);
    expect(savedTitles).toEqual([]);
    await clock.advanceBy(1);

    expect(savedTitles).toEqual(["Latest title"]);
    expect(clock.pendingTaskCount()).toBe(0);
  });

  test("persists a healthy room when another room has a storage fault", async () => {
    await writeFile(join(tempDir, "healthy.md"), SAMPLE_MD.replaceAll("Test", "Healthy"), "utf-8");
    const savedFilenames: string[] = [];
    let shouldFault = true;
    const persistence: DocumentPersistence = {
      authorize: async () => "write",
      load: async (descriptor) => parseFile(descriptor.filename, descriptor.filename === "healthy.md"
        ? SAMPLE_MD.replaceAll("Test", "Healthy")
        : SAMPLE_MD),
      save: async (descriptor, document) => {
        if (descriptor.filename === "test.md" && shouldFault) throw new Error("test storage fault");
        savedFilenames.push(descriptor.filename);
        return document;
      },
    };
    const manager = createRoomManager(config, persistence, clock);
    managers.push(manager);
    const faulty = await manager.getOrCreateRoom("test.md");
    const healthy = await manager.getOrCreateRoom("healthy.md");
    const faultyRoot = faulty.yDoc.getMap("meta").get("rootId") as string;
    const healthyRoot = healthy.yDoc.getMap("meta").get("rootId") as string;
    (faulty.yDoc.getMap("nodes").get(faultyRoot) as import("yjs").Map<unknown>).set("title", "Faulty update");
    (healthy.yDoc.getMap("nodes").get(healthyRoot) as import("yjs").Map<unknown>).set("title", "Healthy update");

    await clock.advanceBy(config.persistDebounceMs);

    expect(faulty.lastPersistError).toBe("test storage fault");
    expect(savedFilenames).toEqual(["healthy.md"]);
    expect(manager.getRooms().has("healthy.md")).toBe(true);
    shouldFault = false;
  });

  test("reports a degraded room and its recovery through aggregate telemetry", async () => {
    const telemetry = createSyncTelemetry({ write: () => undefined });
    let shouldFault = true;
    const persistence: DocumentPersistence = {
      authorize: async () => "write",
      load: async (descriptor) => parseFile(descriptor.filename, SAMPLE_MD),
      save: async (_descriptor, document) => {
        if (shouldFault) throw new Error("synthetic persistence failure with token=must-not-leak");
        return document;
      },
    };
    const manager = createRoomManager({ ...config, telemetry }, persistence, clock);
    managers.push(manager);
    const room = await manager.getOrCreateRoom("test.md");
    const rootId = room.yDoc.getMap("meta").get("rootId") as string;
    (room.yDoc.getMap("nodes").get(rootId) as import("yjs").Map<unknown>).set("title", "Trigger telemetry");

    await expect(manager.persistRoom(room)).rejects.toThrow("synthetic persistence failure");
    expect(telemetry.snapshot()).toMatchObject({
      counters: { sync_persistence_errors_total: 1 },
      gauges: { sync_active_rooms: 1, sync_degraded_rooms: 1, sync_room_operations_in_flight: 0, sync_pending_persistence_rooms: 1 },
    });

    shouldFault = false;
    await manager.persistRoom(room);
    expect(telemetry.snapshot()).toMatchObject({
      counters: { sync_persistence_recoveries_total: 1 },
      gauges: { sync_degraded_rooms: 0 },
    });
  });

  test("exports evaluable aggregate telemetry for concurrent work across multiple rooms", async () => {
    const telemetry = createSyncTelemetry({ write: () => undefined });
    const persistence: DocumentPersistence = {
      authorize: async () => "write",
      load: async (descriptor) => parseFile(descriptor.filename, SAMPLE_MD),
      save: async (_descriptor, document) => document,
    };
    const manager = createRoomManager({ ...config, telemetry, maxRooms: 12 }, persistence, clock);
    managers.push(manager);
    const rooms = await Promise.all(Array.from({ length: 8 }, async (_value, index) => {
      const filename = `load-${index}.md`;
      const room = await manager.getOrCreateRoom(filename);
      const rootId = room.yDoc.getMap("meta").get("rootId") as string;
      (room.yDoc.getMap("nodes").get(rootId) as import("yjs").Map<unknown>).set("title", `Load ${index}`);
      return room;
    }));

    await Promise.all(rooms.map((room) => manager.persistRoom(room)));
    const metrics = telemetry.snapshot();

    expect(metrics.gauges).toMatchObject({
      sync_active_rooms: 8,
      sync_degraded_rooms: 0,
      sync_room_operations_in_flight: 0,
      sync_pending_persistence_rooms: 8,
    });
    expect(metrics.histograms.sync_persistence_duration_ms?.count).toBe(8);
    expect(telemetry.prometheus()).not.toContain("load-");
  });

  test("flushes scheduled persistence deterministically during shutdown", async () => {
    const savedTitles: string[] = [];
    const persistence: DocumentPersistence = {
      authorize: async () => "write",
      load: async (descriptor) => parseFile(descriptor.filename, SAMPLE_MD),
      save: async (_descriptor, document) => {
        savedTitles.push(document.nodes.get(document.rootId)?.title ?? "");
        return document;
      },
    };
    const manager = createRoomManager(config, persistence, clock);
    managers.push(manager);
    const room = await manager.getOrCreateRoom("test.md");
    const rootId = room.yDoc.getMap("meta").get("rootId") as string;
    (room.yDoc.getMap("nodes").get(rootId) as import("yjs").Map<unknown>).set("title", "Final shutdown title");

    expect(clock.pendingTaskCount()).toBe(1);
    await manager.shutdown();

    expect(savedTitles).toEqual(["Final shutdown title"]);
    expect(manager.getRooms().size).toBe(0);
    expect(clock.pendingTaskCount()).toBe(0);
  });

  test("stops accepting new rooms once a shutdown drain has begun", async () => {
    const manager = createRoomManager(config, undefined, clock);
    managers.push(manager);

    manager.beginDrain();

    await expect(manager.getOrCreateRoom("after-drain.md")).rejects.toBeInstanceOf(SyncServerDrainingError);
  });

  test("bounds a final flush without letting one stalled room block resource cleanup", async () => {
    const savedFilenames: string[] = [];
    const persistence: DocumentPersistence = {
      authorize: async () => "write",
      load: async (descriptor) => parseFile(descriptor.filename, SAMPLE_MD),
      save: async (descriptor, document) => {
        if (descriptor.filename === "stalled.md") return await new Promise<typeof document>(() => undefined);
        savedFilenames.push(descriptor.filename);
        return document;
      },
    };
    const manager = createRoomManager({ ...config, shutdownTimeoutMs: 25 }, persistence, clock);
    managers.push(manager);
    const healthy = await manager.getOrCreateRoom("healthy.md");
    const stalled = await manager.getOrCreateRoom("stalled.md");
    const healthyRoot = healthy.yDoc.getMap("meta").get("rootId") as string;
    const stalledRoot = stalled.yDoc.getMap("meta").get("rootId") as string;
    (healthy.yDoc.getMap("nodes").get(healthyRoot) as import("yjs").Map<unknown>).set("title", "Flush healthy");
    (stalled.yDoc.getMap("nodes").get(stalledRoot) as import("yjs").Map<unknown>).set("title", "Flush stalled");

    const shutdown = manager.shutdown();
    // Let both concurrent flushes enter their persistence adapter before the deterministic
    // shutdown deadline advances. No wall-clock waiting is involved.
    for (let tick = 0; tick < 10; tick += 1) await Promise.resolve();
    await clock.advanceBy(25);
    const result = await shutdown;

    expect(savedFilenames).toEqual(["healthy.md"]);
    expect(result).toEqual({ flushedRooms: 1, failedRoomKeys: [], timedOutRoomKeys: ["stalled.md"] });
    expect(manager.getRooms().size).toBe(0);
    expect(clock.pendingTaskCount()).toBe(0);
  });

  test("passes the latest editing user to cloud persistence", async () => {
    const savedDescriptors: RoomDescriptor[] = [];
    const persistence: DocumentPersistence = {
      authorize: async () => "write",
      load: async (descriptor) => ({
        ...parseFile(descriptor.filename, SAMPLE_MD),
        storage: { mode: "database", documentId: descriptor.documentId!, workspaceId: descriptor.workspaceId!, version: 1 },
      }),
      save: async (descriptor, document) => {
        savedDescriptors.push(descriptor);
        return { ...document, storage: { ...document.storage!, version: 2 } };
      },
    };
    const manager = createRoomManager(config, persistence, clock);
    managers.push(manager);
    const room = await manager.getOrCreateRoom({
      key: "document-id",
      filename: "test.md",
      documentId: "document-id",
      workspaceId: "workspace-id",
      userId: "user-a",
    });
    room.userId = "user-b";

    await manager.persistRoom(room);

    expect(savedDescriptors.at(-1)?.userId).toBe("user-b");
  });

  test("uses the server-owned room version when shared metadata is stale", async () => {
    const savedVersions: number[] = [];
    const persistence: DocumentPersistence = {
      authorize: async () => "write",
      load: async (descriptor) => ({
        ...parseFile(descriptor.filename, SAMPLE_MD),
        storage: { mode: "database", documentId: descriptor.documentId!, workspaceId: descriptor.workspaceId!, version: 7 },
      }),
      save: async (_descriptor, document) => {
        savedVersions.push(document.storage?.version ?? -1);
        return { ...document, storage: { ...document.storage!, version: (document.storage?.version ?? 0) + 1 } };
      },
    };
    const manager = createRoomManager(config, persistence, clock);
    managers.push(manager);
    const room = await manager.getOrCreateRoom({
      key: "document-id",
      filename: "test.md",
      documentId: "document-id",
      workspaceId: "workspace-id",
      userId: "user-a",
    });

    // Simulate a successful server-side persistence followed by a stale client metadata merge.
    room.version = 8;
    room.yDoc.getMap("meta").set("storage", { ...room.yDoc.getMap("meta").get("storage") as object, version: 7 });
    if (room.persistTimer) {
      clock.clearTimeout(room.persistTimer);
      room.persistTimer = null;
    }

    await manager.persistRoom(room);

    expect(savedVersions).toEqual([8]);
    expect(room.version).toBe(9);
  });

  test("writes a snapshot through the room authority and persists the new state", async () => {
    const savedTitles: string[] = [];
    const persistence: DocumentPersistence = {
      authorize: async () => "write",
      load: async (descriptor) => ({
        ...parseFile(descriptor.filename, SAMPLE_MD),
        storage: { mode: "database", documentId: descriptor.documentId!, workspaceId: descriptor.workspaceId!, version: 1 },
      }),
      save: async (_descriptor, document) => {
        savedTitles.push(document.nodes.get(document.rootId)?.title ?? "");
        return { ...document, storage: { ...document.storage!, version: 2 } };
      },
    };
    const manager = createRoomManager(config, persistence);
    managers.push(manager);
    const room = await manager.getOrCreateRoom({
      key: "document-id",
      filename: "test.md",
      documentId: "document-id",
      workspaceId: "workspace-id",
      userId: "user-a",
    });

    const saved = await manager.writeDocumentSnapshot({
      key: room.key,
      filename: "test.md",
      documentId: "document-id",
      workspaceId: "workspace-id",
      userId: "user-a",
    }, parseFile("test.md", "# Replacement"), 1);

    expect(savedTitles).toContain("Replacement");
    expect(saved.storage?.version).toBe(2);
    expect(room.version).toBe(2);
    expect(room.yDoc.getMap("nodes").size).toBe(1);
  });

  test("writes an offline snapshot through the room authority and rejects stale versions", async () => {
    const savedTitles: string[] = [];
    const persistence: DocumentPersistence = {
      authorize: async () => "write",
      load: async (descriptor) => ({
        ...parseFile(descriptor.filename, SAMPLE_MD),
        storage: { mode: "database", documentId: descriptor.documentId!, workspaceId: descriptor.workspaceId!, version: 4 },
      }),
      save: async (_descriptor, document) => {
        savedTitles.push(document.nodes.get(document.rootId)?.title ?? "");
        return { ...document, storage: { ...document.storage!, version: document.storage!.version + 1 } };
      },
    };
    const manager = createRoomManager(config, persistence);
    managers.push(manager);
    const descriptor: RoomDescriptor = {
      key: "document-id",
      filename: "test.md",
      documentId: "document-id",
      workspaceId: "workspace-id",
      userId: "user-a",
    };

    const saved = await manager.writeDocumentSnapshot(descriptor, parseFile("test.md", "# Snapshot"), 4);

    expect(savedTitles).toEqual(["Snapshot"]);
    expect(saved.storage?.version).toBe(5);
    await expect(manager.writeDocumentSnapshot(descriptor, parseFile("test.md", "# Stale"), 4)).rejects.toBeInstanceOf(SyncDocumentVersionConflictError);
  });

  test("does not replace a document while a client is connected", async () => {
    const persistence: DocumentPersistence = {
      authorize: async () => "write",
      load: async (descriptor) => parseFile(descriptor.filename, SAMPLE_MD),
      save: async (_descriptor, document) => document,
    };
    const manager = createRoomManager(config, persistence);
    managers.push(manager);
    const descriptor: RoomDescriptor = { key: "document-id", filename: "test.md", documentId: "document-id", workspaceId: "workspace-id", userId: "user-a" };
    const room = await manager.getOrCreateRoom(descriptor);
    manager.addClient(room, createMockWs("document-id"));

    await expect(manager.writeDocumentSnapshot(descriptor, parseFile("test.md", "# Unsafe"))).rejects.toBeInstanceOf(SyncRoomBusyError);
  });

  test("applies a checked node-content mutation while a client is connected", async () => {
    let savedContent = "";
    const persistence: DocumentPersistence = {
      authorize: async () => "write",
      load: async (descriptor) => ({
        ...parseFile(descriptor.filename, SAMPLE_MD),
        storage: { mode: "database", documentId: descriptor.documentId!, workspaceId: descriptor.workspaceId!, version: 3 },
      }),
      save: async (_descriptor, document) => {
        savedContent = document.nodes.get(document.rootId)?.content ?? "";
        return { ...document, storage: { ...document.storage!, version: 4 } };
      },
    };
    const manager = createRoomManager(config, persistence);
    managers.push(manager);
    const descriptor: RoomDescriptor = { key: "document-id", filename: "test.md", documentId: "document-id", workspaceId: "workspace-id", userId: "user-a" };
    const room = await manager.getOrCreateRoom(descriptor);
    manager.addClient(room, createMockWs("document-id"));

    const saved = await manager.applyNodeContent(descriptor, {
      nodeId: yDocToDocument(room.yDoc).rootId,
      expectedNodeTitle: "Test",
      expectedNodeContent: "Root content.",
      nextNodeContent: "Agent proposal content.",
    });

    expect(saved.nodes.get(saved.rootId)?.content).toBe("Agent proposal content.");
    expect(savedContent).toBe("Agent proposal content.");
    expect(saved.storage?.version).toBe(4);
  });

  test("merges agent knowledge nodes into a room while a person is connected", async () => {
    let saved = "";
    const persistence: DocumentPersistence = {
      authorize: async () => "write",
      load: async (descriptor) => ({
        ...parseFile(descriptor.filename, SAMPLE_MD),
        storage: { mode: "database", documentId: descriptor.documentId!, workspaceId: descriptor.workspaceId!, version: 3 },
      }),
      save: async (_descriptor, document) => {
        saved = [...document.nodes.values()].map((node) => node.title).join(",");
        return { ...document, storage: { ...document.storage!, version: 4 } };
      },
    };
    const manager = createRoomManager(config, persistence);
    managers.push(manager);
    const descriptor: RoomDescriptor = { key: "document-id", filename: "test.md", documentId: "document-id", workspaceId: "workspace-id", userId: "user-a" };
    const room = await manager.getOrCreateRoom(descriptor);
    manager.addClient(room, createMockWs("document-id"));

    const result = await manager.applyKnowledgeNodes(descriptor, [
      { ref: "t", title: "Folien bauen", status: "open", due: "2026-10-10", assignee: "Tom" },
    ]);

    const task = result.document.nodes.get(result.ids.t!);
    expect(task?.metadata).toEqual({ kind: "task", status: "open", due: "2026-10-10", assignee: "Tom" });
    expect(result.created).toEqual([result.ids.t!]);
    expect(saved).toContain("Folien bauen");
    // Saved once: no scheduled second save that would bump the version past the one returned.
    expect(room.persistTimer).toBeNull();
    await expect(manager.applyKnowledgeNodes(descriptor, [{ id: "missing", content: "x" }])).rejects.toThrow(/does not exist/);
  });

  test("applies typed task and decision children through the checked node mutation", async () => {
    const persistence: DocumentPersistence = {
      authorize: async () => "write",
      load: async (descriptor) => parseFile(descriptor.filename, SAMPLE_MD),
      save: async (_descriptor, document) => document,
    };
    const manager = createRoomManager(config, persistence);
    managers.push(manager);
    const descriptor: RoomDescriptor = { key: "document-id", filename: "test.md", documentId: "document-id", workspaceId: "workspace-id", userId: "user-a" };
    const room = await manager.getOrCreateRoom(descriptor);
    const source = yDocToDocument(room.yDoc);
    const root = source.nodes.get(source.rootId)!;

    const saved = await manager.applyNodeContent(descriptor, {
      nodeId: root.id,
      expectedNodeTitle: root.title,
      expectedNodeContent: root.content,
      nextNodeContent: root.content,
      childNodes: [
        { title: "Verify retry path", content: "Check the retry policy.", metadata: { kind: "task", status: "open" } },
        { title: "Choose persistence policy", content: "Record the rationale.", metadata: { kind: "decision", decision: "proposed" } },
      ],
    });

    const children = saved.nodes.get(saved.rootId)!.children.map((id) => saved.nodes.get(id)!);
    const proposedChildren = children.filter((child) => child.title !== "Child A");
    expect(proposedChildren.map((child) => child.title)).toEqual(["Verify retry path", "Choose persistence policy"]);
    expect(proposedChildren.map((child) => child.metadata)).toEqual([
      { kind: "task", status: "open" },
      { kind: "decision", decision: "proposed" },
    ]);
  });

  test("rejects a node-content mutation when its target changed", async () => {
    const manager = newManager();
    const descriptor: RoomDescriptor = { key: "test.md", filename: "test.md", userId: "user-a" };
    const room = await manager.getOrCreateRoom(descriptor);

    await expect(manager.applyNodeContent(descriptor, {
      nodeId: yDocToDocument(room.yDoc).rootId,
      expectedNodeTitle: "Test",
      expectedNodeContent: "Different source content.",
      nextNodeContent: "Agent proposal content.",
    })).rejects.toBeInstanceOf(SyncNodeConflictError);
  });

  test("rejects rename while a room has pending or active collaboration", async () => {
    let renamed = false;
    const persistence: DocumentPersistence = {
      authorize: async () => "write",
      load: async (descriptor) => parseFile(descriptor.filename, SAMPLE_MD),
      save: async (_descriptor, document) => document,
      rename: async () => {
        renamed = true;
        return { documentId: "document-id", filename: "renamed.md", version: 2 };
      },
    };
    const manager = createRoomManager(config, persistence);
    managers.push(manager);
    const descriptor: RoomDescriptor = { key: "document-id", filename: "test.md", documentId: "document-id", workspaceId: "workspace-id", userId: "user-a" };
    const room = await manager.getOrCreateRoom(descriptor);
    manager.addClient(room, createMockWs("document-id"));

    await expect(manager.renameDocument(descriptor, "renamed.md", 1)).rejects.toBeInstanceOf(SyncRoomBusyError);
    expect(renamed).toBe(false);
  });

  test("flushes a disconnected pending room before rename", async () => {
    let savedTitle = "";
    let renamedAfterSave = false;
    const persistence: DocumentPersistence = {
      authorize: async () => "write",
      load: async (descriptor) => parseFile(descriptor.filename, SAMPLE_MD),
      save: async (_descriptor, document) => {
        savedTitle = document.nodes.get(document.rootId)?.title ?? "";
        return document;
      },
      rename: async () => {
        renamedAfterSave = savedTitle === "Renamed before file move";
        return { documentId: "document-id", filename: "renamed.md", version: 2 };
      },
    };
    const manager = createRoomManager(config, persistence);
    managers.push(manager);
    const descriptor: RoomDescriptor = { key: "document-id", filename: "test.md", documentId: "document-id", workspaceId: "workspace-id", userId: "user-a" };
    const room = await manager.getOrCreateRoom(descriptor);
    const rootId = room.yDoc.getMap("meta").get("rootId") as string;
    const rootNode = room.yDoc.getMap("nodes").get(rootId) as import("yjs").Map<unknown>;
    rootNode.set("title", "Renamed before file move");

    await expect(manager.renameDocument(descriptor, "renamed.md", 1)).resolves.toEqual({
      documentId: "document-id",
      filename: "renamed.md",
      version: 2,
    });
    expect(renamedAfterSave).toBe(true);
  });

  test("passes the post-flush database version to rename", async () => {
    let renameVersion: number | undefined;
    const persistence: DocumentPersistence = {
      authorize: async () => "write",
      load: async (descriptor) => ({
        ...parseFile(descriptor.filename, SAMPLE_MD),
        storage: { mode: "database", documentId: "document-id", workspaceId: "workspace-id", version: 1 },
      }),
      save: async (_descriptor, document) => ({
        ...document,
        storage: { ...document.storage!, version: document.storage!.version + 1 },
      }),
      rename: async (_descriptor, _newFilename, expectedVersion) => {
        renameVersion = expectedVersion;
        return { documentId: "document-id", filename: "renamed.md", version: expectedVersion ?? 0 };
      },
    };
    const manager = createRoomManager(config, persistence);
    managers.push(manager);
    const descriptor: RoomDescriptor = { key: "document-id", filename: "test.md", documentId: "document-id", workspaceId: "workspace-id", userId: "user-a" };
    await manager.getOrCreateRoom(descriptor);

    await manager.renameDocument(descriptor, "renamed.md", 1);

    expect(renameVersion).toBe(2);
  });

  test("does not attach a websocket to a room destroyed by a rename race", async () => {
    const persistence: DocumentPersistence = {
      authorize: async () => "write",
      load: async (descriptor) => parseFile(descriptor.filename, SAMPLE_MD),
      save: async (_descriptor, document) => document,
      rename: async () => ({ documentId: "document-id", filename: "renamed.md", version: 2 }),
    };
    const manager = createRoomManager(config, persistence);
    managers.push(manager);
    const descriptor: RoomDescriptor = { key: "document-id", filename: "test.md", documentId: "document-id", workspaceId: "workspace-id", userId: "user-a" };
    const room = await manager.getOrCreateRoom(descriptor);

    await manager.renameDocument(descriptor, "renamed.md", 1);

    expect(() => manager.addClient(room, createMockWs("document-id"))).toThrow(SyncRoomBusyError);
  });

  test("uses persistence authorization as the current role source", async () => {
    const persistence: DocumentPersistence = {
      authorize: async () => "read",
      load: async (descriptor) => parseFile(descriptor.filename, SAMPLE_MD),
      save: async (_descriptor, document) => document,
    };
    const manager = createRoomManager(config, persistence);
    managers.push(manager);
    await expect(manager.authorize({ key: "doc", filename: "test.md" })).resolves.toBe("read");
  });

  test("keeps a room alive and degraded when the final persist fails", async () => {
    let shouldFail = true;
    const persistence: DocumentPersistence = {
      authorize: async () => "write",
      load: async (descriptor) => parseFile(descriptor.filename, SAMPLE_MD),
      save: async (_descriptor, document) => {
        if (shouldFail) throw new Error("storage unavailable");
        return document;
      },
    };
    const manager = createRoomManager(config, persistence, clock);
    managers.push(manager);
    const room = await manager.getOrCreateRoom("test.md");
    const ws = createMockWs("test.md");
    manager.addClient(room, ws);
    await expect(manager.persistRoom(room)).rejects.toThrow("storage unavailable");

    expect(clock.pendingTaskCount()).toBe(0);
    expect(manager.getRooms().has("test.md")).toBe(true);
    expect(room.lastPersistError).toBe("storage unavailable");

    shouldFail = false;
    manager.removeClient(room, ws);
  });

  test("retries only a proven pre-commit persistence failure with one operation id", async () => {
    const operations: string[] = [];
    let saveCalls = 0;
    const persistence: DocumentPersistence = {
      authorize: async () => "write",
      load: async (descriptor) => parseFile(descriptor.filename, SAMPLE_MD),
      save: async (_descriptor, document, operation) => {
        saveCalls += 1;
        operations.push(operation?.id ?? "missing");
        if (saveCalls === 1) throw new SyncRetryablePersistenceError("connection refused before write");
        return document;
      },
    };
    const manager = createRoomManager({
      ...config,
      persistenceRetryMaxAttempts: 2,
      persistenceRetryBaseMs: 10,
      persistenceRetryMaxDelayMs: 10,
    }, persistence, clock);
    managers.push(manager);
    const room = await manager.getOrCreateRoom("test.md");
    const pending = manager.persistRoom(room);

    await Promise.resolve();
    await Promise.resolve();
    await clock.advanceBy(100);
    await Promise.resolve();
    await clock.advanceBy(100);
    await pending;

    expect(saveCalls).toBe(2);
    expect(operations[0]).toBe(operations[1]);
    expect(room.lastPersistError).toBeNull();
    expect(room.persistenceOperation).toBeNull();
  });

  test("confirms an interrupted commit instead of writing the same operation twice", async () => {
    let saveCalls = 0;
    const confirmedOperationIds: string[] = [];
    const persistence: DocumentPersistence = {
      authorize: async () => "write",
      load: async (descriptor) => parseFile(descriptor.filename, SAMPLE_MD),
      save: async () => {
        saveCalls += 1;
        throw new SyncPersistenceCommitUnknownError("response lost after commit");
      },
      confirmSave: async (_descriptor, operation) => {
        confirmedOperationIds.push(operation.id);
        return parseFile("test.md", SAMPLE_MD);
      },
    };
    const manager = createRoomManager(config, persistence, clock);
    managers.push(manager);
    const room = await manager.getOrCreateRoom("test.md");

    await manager.persistRoom(room);

    expect(saveCalls).toBe(1);
    expect(confirmedOperationIds).toHaveLength(1);
    expect(room.lastPersistError).toBeNull();
  });

  test("stops a safe retry when its bounded duration would be exceeded", async () => {
    let saveCalls = 0;
    let shouldFail = true;
    const persistence: DocumentPersistence = {
      authorize: async () => "write",
      load: async (descriptor) => parseFile(descriptor.filename, SAMPLE_MD),
      save: async () => {
        saveCalls += 1;
        if (shouldFail) throw new SyncRetryablePersistenceError();
        return parseFile("test.md", SAMPLE_MD);
      },
    };
    const manager = createRoomManager({
      ...config,
      persistenceRetryMaxAttempts: 3,
      persistenceRetryBaseMs: 10,
      persistenceRetryMaxDelayMs: 10,
      persistenceRetryMaxDurationMs: 5,
    }, persistence, clock);
    managers.push(manager);
    const room = await manager.getOrCreateRoom("test.md");

    await expect(manager.persistRoom(room)).rejects.toBeInstanceOf(SyncRetryablePersistenceError);

    expect(saveCalls).toBe(1);
    expect(clock.pendingTaskCount()).toBe(0);
    shouldFail = false;
  });

  test("does not retry an unconfirmed interrupted commit", async () => {
    let saveCalls = 0;
    let shouldFail = true;
    const persistence: DocumentPersistence = {
      authorize: async () => "write",
      load: async (descriptor) => parseFile(descriptor.filename, SAMPLE_MD),
      save: async () => {
        saveCalls += 1;
        if (shouldFail) throw new SyncPersistenceCommitUnknownError();
        return parseFile("test.md", SAMPLE_MD);
      },
      confirmSave: async () => null,
    };
    const manager = createRoomManager({ ...config, persistenceRetryMaxAttempts: 3 }, persistence, clock);
    managers.push(manager);
    const room = await manager.getOrCreateRoom("test.md");

    await expect(manager.persistRoom(room)).rejects.toBeInstanceOf(SyncPersistenceCommitUnknownError);

    expect(saveCalls).toBe(1);
    expect(room.lastPersistError).toBe("PERSISTENCE_COMMIT_UNKNOWN");
    expect(room.persistenceOperation).not.toBeNull();
    shouldFail = false;
  });

  test("treats a persistence timeout as an unknown commit and clears its deterministic timer", async () => {
    let releaseSave!: () => void;
    const saveGate = new Promise<import("@bloommd/core").MindMapDocument>((resolve) => { releaseSave = () => resolve(parseFile("test.md", SAMPLE_MD)); });
    const persistence: DocumentPersistence = {
      authorize: async () => "write",
      load: async (descriptor) => parseFile(descriptor.filename, SAMPLE_MD),
      save: async () => saveGate,
      confirmSave: async () => null,
    };
    const manager = createRoomManager({ ...config, persistenceSaveTimeoutMs: 25 }, persistence, clock);
    managers.push(manager);
    const room = await manager.getOrCreateRoom("test.md");
    const pending = manager.persistRoom(room);

    await Promise.resolve();
    await clock.advanceBy(25);
    await expect(pending).rejects.toBeInstanceOf(SyncPersistenceTimeoutError);
    expect(room.lastPersistError).toBe("PERSISTENCE_TIMEOUT");
    expect(clock.pendingTaskCount()).toBe(0);
    releaseSave();
  });

  test("does not retry a permission denial", async () => {
    let saveCalls = 0;
    let denyWrite = true;
    const persistence: DocumentPersistence = {
      authorize: async () => "write",
      load: async (descriptor) => parseFile(descriptor.filename, SAMPLE_MD),
      save: async () => {
        saveCalls += 1;
        if (denyWrite) throw new SyncPersistenceAuthorizationError();
        return parseFile("test.md", SAMPLE_MD);
      },
    };
    const manager = createRoomManager({ ...config, persistenceRetryMaxAttempts: 3 }, persistence, clock);
    managers.push(manager);
    const room = await manager.getOrCreateRoom("test.md");

    await expect(manager.persistRoom(room)).rejects.toBeInstanceOf(SyncPersistenceAuthorizationError);
    expect(saveCalls).toBe(1);
    expect(clock.pendingTaskCount()).toBe(0);
    denyWrite = false;
  });

  test("persists an update that arrives while an earlier save is in flight", async () => {
    let releaseFirstSave!: () => void;
    let markFirstSaveStarted!: () => void;
    const firstSaveStarted = new Promise<void>((resolve) => { markFirstSaveStarted = resolve; });
    const firstSaveGate = new Promise<void>((resolve) => { releaseFirstSave = resolve; });
    const savedTitles: string[] = [];
    let saveCount = 0;
    const persistence: DocumentPersistence = {
      authorize: async () => "write",
      load: async (descriptor) => parseFile(descriptor.filename, SAMPLE_MD),
      save: async (_descriptor, document) => {
        saveCount += 1;
        const title = document.nodes.get(document.rootId)?.title ?? "";
        if (saveCount === 1) {
          markFirstSaveStarted();
          await firstSaveGate;
        }
        savedTitles.push(title);
        return document;
      },
    };
    const manager = createRoomManager(config, persistence, clock);
    managers.push(manager);
    const room = await manager.getOrCreateRoom("test.md");
    const rootId = room.yDoc.getMap("meta").get("rootId") as string;
    const rootNode = room.yDoc.getMap("nodes").get(rootId) as import("yjs").Map<unknown>;

    rootNode.set("title", "First update");
    const firstPersist = manager.persistRoom(room);
    await firstSaveStarted;
    rootNode.set("title", "Second update");
    releaseFirstSave();
    await firstPersist;
    await clock.advanceBy(config.persistDebounceMs);
    await manager.persistRoom(room);

    expect(savedTitles.at(-1)).toBe("Second update");
    expect(saveCount).toBeGreaterThanOrEqual(2);
  });

  test("enforces the configured room capacity", async () => {
    await writeFile(join(tempDir, "second.md"), SAMPLE_MD, "utf-8");
    const manager = createRoomManager({ ...config, maxRooms: 1 });
    managers.push(manager);
    await manager.getOrCreateRoom("test.md");
    await expect(manager.getOrCreateRoom("second.md")).rejects.toThrow("capacity");
  });

  test("merges ordered Yjs updates from two users in one room before the deterministic persist", async () => {
    const savedContents: string[] = [];
    const persistence: DocumentPersistence = {
      authorize: async () => "write",
      load: async (descriptor) => parseFile(descriptor.filename, SAMPLE_MD),
      save: async (_descriptor, document) => {
        savedContents.push(document.nodes.get(document.rootId)?.content ?? "");
        return document;
      },
    };
    const manager = createRoomManager(config, persistence, clock);
    managers.push(manager);
    const room = await manager.getOrCreateRoom("test.md");
    const initialState = Y.encodeStateAsUpdate(room.yDoc);
    const firstUser = new Y.Doc();
    const secondUser = new Y.Doc();
    Y.applyUpdate(firstUser, initialState);
    Y.applyUpdate(secondUser, initialState);
    const rootId = room.yDoc.getMap("meta").get("rootId") as string;
    const firstContent = firstUser.getMap("nodeContents").get(rootId) as Y.Text;
    const secondContent = secondUser.getMap("nodeContents").get(rootId) as Y.Text;

    firstContent.insert(firstContent.length, "\nFirst user");
    Y.applyUpdate(room.yDoc, Y.encodeStateAsUpdate(firstUser));
    secondContent.insert(secondContent.length, "\nSecond user");
    Y.applyUpdate(room.yDoc, Y.encodeStateAsUpdate(secondUser));
    await clock.advanceBy(config.persistDebounceMs);

    expect(savedContents).toHaveLength(1);
    expect(savedContents[0]).toContain("First user");
    expect(savedContents[0]).toContain("Second user");
    expect(clock.pendingTaskCount()).toBe(0);
    firstUser.destroy();
    secondUser.destroy();
  });
});

describe("room presence", () => {
  const fakeWs = () => ({ sendBinary() {}, readyState: 1, data: { roomName: "test.md" } }) as unknown as ServerWebSocket<WebSocketData>;

  test("mirrors presence so a later joiner is not shown an empty room", async () => {
    const manager = newManager();
    const room = await manager.getOrCreateRoom("test.md");
    const ws = fakeWs();
    manager.addClient(room, ws);

    const peerDoc = new Y.Doc();
    const peer = new Awareness(peerDoc);
    peer.setLocalState({ name: "Peer", color: "#FF6B35", selectedNodeId: null });
    applyAwarenessUpdate(room.awareness, encodeAwarenessUpdate(peer, [peerDoc.clientID]), ws);

    expect(room.awareness.getStates().has(peerDoc.clientID)).toBe(true);
    // The connection owns that id, so a disconnect can clear exactly this client's presence.
    expect(room.awarenessClients.get(ws)?.has(peerDoc.clientID)).toBe(true);

    peer.destroy();
    peerDoc.destroy();
  });

  test("clears a disconnecting client's presence", async () => {
    const manager = newManager();
    const room = await manager.getOrCreateRoom("test.md");
    const ws = fakeWs();
    manager.addClient(room, ws);

    const peerDoc = new Y.Doc();
    const peer = new Awareness(peerDoc);
    peer.setLocalState({ name: "Peer", color: "#FF6B35", selectedNodeId: null });
    applyAwarenessUpdate(room.awareness, encodeAwarenessUpdate(peer, [peerDoc.clientID]), ws);

    releaseAwarenessClients(room, ws);
    expect(room.awareness.getStates().has(peerDoc.clientID)).toBe(false);
    expect(room.awarenessClients.has(ws)).toBe(false);

    peer.destroy();
    peerDoc.destroy();
  });
});
