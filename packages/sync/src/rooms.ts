import type { ServerWebSocket } from "bun";
import { Awareness } from "y-protocols/awareness";
import { documentToYDoc, yAddNode, yDocToDocument, yUpdateContentDiff, type MindMapDocument, type MindMapNodeMetadata } from "@bloommd/core";
import { applyKnowledgeNodesToYDoc } from "@bloommd/core/knowledge-yjs";
import type { KnowledgeNodeInput } from "@bloommd/core/knowledge";
import { broadcastUpdate } from "./sync-handler";
import { systemClock, type SyncClock } from "./clock";
import { createSyncTelemetry, type SyncTelemetry } from "./observability";
import {
  createFilePersistence,
  SyncPersistenceCommitUnknownError,
  SyncPersistenceTimeoutError,
  SyncRetryablePersistenceError,
  SyncDocumentVersionConflictError,
  type DocumentPersistence,
  type DocumentRenameResult,
} from "./persistence";
import type { PersistenceOperation, RoomDescriptor, SyncRoom, SyncServerConfig, WebSocketData } from "./types";

const PERSISTENCE_ORIGIN = "bloommd:persistence";

export class SyncRoomCapacityError extends Error {
  constructor() {
    super("Sync room capacity reached.");
    this.name = "SyncRoomCapacityError";
  }
}

export class SyncRoomBusyError extends Error {
  constructor(readonly reason: "active" | "pending" | "degraded" = "active") {
    super(reason === "degraded"
      ? "The document room has a persistence error and needs reconciliation."
      : "The document is currently active or has pending persistence work.");
    this.name = "SyncRoomBusyError";
  }
}

export class SyncNodeConflictError extends Error {
  constructor() {
    super("The target node changed or was removed after the agent task was created.");
  }
}

/** The server has started draining and no longer accepts new room work. */
export class SyncServerDrainingError extends Error {
  constructor() {
    super("The sync server is draining for shutdown.");
    this.name = "SyncServerDrainingError";
  }
}

export interface NodeContentMutation {
  nodeId: string;
  expectedNodeTitle: string;
  expectedNodeContent: string;
  nextNodeContent: string;
  childNodes?: Array<{
    title: string;
    content: string;
    metadata: MindMapNodeMetadata;
  }>;
}

export interface RoomManager {
  authorize(descriptor: RoomDescriptor): Promise<"read" | "write">;
  getOrCreateRoom(descriptor: string | RoomDescriptor): Promise<SyncRoom>;
  addClient(room: SyncRoom, ws: ServerWebSocket<WebSocketData>): void;
  removeClient(room: SyncRoom, ws: ServerWebSocket<WebSocketData>): void;
  writeDocumentSnapshot(descriptor: RoomDescriptor, document: MindMapDocument, expectedVersion?: number, correlationId?: string): Promise<MindMapDocument>;
  applyNodeContent(descriptor: RoomDescriptor, mutation: NodeContentMutation, correlationId?: string): Promise<MindMapDocument>;
  /** Agent node operations, merged into the live room even while people are editing it. */
  applyKnowledgeNodes(descriptor: RoomDescriptor, nodes: KnowledgeNodeInput[], correlationId?: string): Promise<{ document: MindMapDocument; ids: Record<string, string>; created: string[]; updated: string[] }>;
  createDocument(descriptor: RoomDescriptor, document: MindMapDocument): Promise<MindMapDocument>;
  renameDocument(descriptor: RoomDescriptor, newFilename: string, expectedVersion?: number): Promise<DocumentRenameResult>;
  deleteDocument(descriptor: RoomDescriptor, expectedVersion?: number): Promise<void>;
  persistRoom(room: SyncRoom): Promise<void>;
  getRooms(): Map<string, SyncRoom>;
  beginDrain(): void;
  shutdown(options?: { timeoutMs?: number }): Promise<RoomShutdownResult>;
  getTelemetry(): SyncTelemetry;
}

export interface RoomShutdownResult {
  flushedRooms: number;
  failedRoomKeys: string[];
  timedOutRoomKeys: string[];
}

export function createRoomManager(
  config: SyncServerConfig,
  persistence: DocumentPersistence = createFilePersistence(config),
  clock: SyncClock = systemClock,
): RoomManager {
  const rooms = new Map<string, SyncRoom>();
  // The executable injects the production logger. A library consumer that does not opt in still
  // gets the metric semantics without unexpectedly writing room lifecycle events to its stdout.
  const telemetry = config.telemetry ?? createSyncTelemetry({ write: () => undefined });
  const persistencePromises = new WeakMap<SyncRoom, Promise<void>>();
  const keyLocks = new Map<string, Promise<void>>();
  const mutatingKeys = new Set<string>();
  let draining = false;

  function refreshGauges(): void {
    let clients = 0;
    let degraded = 0;
    let inFlight = 0;
    let pendingPersistence = 0;
    for (const room of rooms.values()) {
      clients += room.clients.size;
      if (room.lastPersistError) degraded += 1;
      if (room.isPersisting) inFlight += 1;
      if (room.persistTimer) pendingPersistence += 1;
    }
    telemetry.setGauge("sync_active_rooms", rooms.size);
    telemetry.setGauge("sync_active_clients", clients);
    telemetry.setGauge("sync_degraded_rooms", degraded);
    telemetry.setGauge("sync_room_operations_in_flight", inFlight);
    telemetry.setGauge("sync_pending_persistence_rooms", pendingPersistence);
  }

  function assertAcceptingWork(): void {
    if (draining) throw new SyncServerDrainingError();
  }

  async function withKeyLock<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = keyLocks.get(key) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => { release = resolve; });
    const chain = previous.then(() => current);
    keyLocks.set(key, chain);
    await previous;
    try {
      return await task();
    } finally {
      release();
      if (keyLocks.get(key) === chain) keyLocks.delete(key);
    }
  }

  async function getOrCreateRoomUnsafe(input: string | RoomDescriptor): Promise<SyncRoom> {
    const descriptor: RoomDescriptor = typeof input === "string"
      ? { key: input, filename: input }
      : input;
    const existing = rooms.get(descriptor.key);
    if (existing) {
      // Cancel pending destruction — a new client is joining
      if (existing.destroyTimer) {
        clock.clearTimeout(existing.destroyTimer);
        existing.destroyTimer = null;
      }
      return existing;
    }
    if (rooms.size >= (config.maxRooms ?? 500)) {
      throw new SyncRoomCapacityError();
    }

    // Load .md from disk → MindMapDocument → Y.Doc
    const doc = await persistence.load(descriptor);
    const yDoc = documentToYDoc(doc);
    // The server mirrors presence but never participates, so it holds no local state of its own.
    const awareness = new Awareness(yDoc);
    awareness.setLocalState(null);

    const room: SyncRoom = {
      key: descriptor.key,
      filename: descriptor.filename,
      workspaceId: descriptor.workspaceId,
      documentId: descriptor.documentId,
      userId: descriptor.userId,
      version: doc.storage?.version,
      yDoc,
      clients: new Set(),
      awareness,
      awarenessClients: new Map(),
      persistTimer: null,
      persistenceTimeoutTimer: null,
      destroyTimer: null,
      isPersisting: false,
      revision: 0,
      persistenceOperation: null,
      lastPersistError: null,
    };

    // On every Y.Doc update: broadcast to other clients + schedule persistence
    yDoc.on("update", (update: Uint8Array, origin: unknown) => {
      if (origin === PERSISTENCE_ORIGIN) return;
      room.revision += 1;
      const sender =
        origin instanceof Object && "readyState" in origin
          ? (origin as ServerWebSocket<WebSocketData>)
          : null;
      const broadcastStartedAt = clock.now();
      broadcastUpdate(update, room, sender);
      telemetry.observe("sync_broadcast_duration_ms", clock.now() - broadcastStartedAt);
      schedulePersist(room);
    });

    // Attribute every presence id to the connection that announced it, so a disconnect can clear
    // exactly that client's entries. The origin is the ServerWebSocket passed to applyAwarenessUpdate.
    awareness.on("update", ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => {
      if (!origin || typeof origin !== "object" || !("readyState" in origin)) return;
      const ws = origin as ServerWebSocket<WebSocketData>;
      const owned = room.awarenessClients.get(ws) ?? new Set<number>();
      for (const id of [...added, ...updated]) owned.add(id);
      for (const id of removed) owned.delete(id);
      room.awarenessClients.set(ws, owned);
    });

    rooms.set(descriptor.key, room);
    refreshGauges();
    telemetry.event({ operation: "room.open", outcome: "success", roomKey: room.key });
    return room;
  }

  async function getOrCreateRoom(input: string | RoomDescriptor): Promise<SyncRoom> {
    assertAcceptingWork();
    const key = typeof input === "string" ? input : input.key;
    return withKeyLock(key, () => getOrCreateRoomUnsafe(input));
  }

  function addClient(
    room: SyncRoom,
    ws: ServerWebSocket<WebSocketData>,
  ): void {
    assertAcceptingWork();
    if (mutatingKeys.has(room.key) || rooms.get(room.key) !== room) throw new SyncRoomBusyError();
    room.clients.add(ws);
    refreshGauges();
  }

  function removeClient(
    room: SyncRoom,
    ws: ServerWebSocket<WebSocketData>,
  ): void {
    room.clients.delete(ws);
    refreshGauges();

    if (room.clients.size === 0) {
      void flushRoom(room).then(() => scheduleDestroy(room)).catch(() => undefined);
    }
  }

  function assertRoomIsSafeForSnapshot(room: SyncRoom): void {
    if (room.clients.size > 0) throw new SyncRoomBusyError("active");
    if (room.isPersisting || room.persistTimer) throw new SyncRoomBusyError("pending");
    if (room.lastPersistError) throw new SyncRoomBusyError("degraded");
  }

  async function writeDocumentSnapshot(
    descriptor: RoomDescriptor,
    document: MindMapDocument,
    expectedVersion?: number,
    correlationId?: string,
  ): Promise<MindMapDocument> {
    assertAcceptingWork();
    return withKeyLock(descriptor.key, async () => {
      mutatingKeys.add(descriptor.key);
      try {
        const room = rooms.get(descriptor.key) ?? await getOrCreateRoomUnsafe(descriptor);
        room.correlationId = correlationId;
        assertRoomIsSafeForSnapshot(room);
        if (room.destroyTimer) {
          clock.clearTimeout(room.destroyTimer);
          room.destroyTimer = null;
        }

        const current = yDocToDocument(room.yDoc);
        const currentVersion = room.version ?? current.storage?.version;
        if (expectedVersion != null && currentVersion !== expectedVersion) {
          throw new SyncDocumentVersionConflictError();
        }

        const next: MindMapDocument = { ...document, storage: current.storage };
        room.userId = descriptor.userId;
        if (room.persistTimer) {
          clock.clearTimeout(room.persistTimer);
          room.persistTimer = null;
        }
        room.filename = next.filePath;
        documentToYDoc(next, room.yDoc);
        if (room.persistTimer) {
          clock.clearTimeout(room.persistTimer);
          room.persistTimer = null;
        }
        await persistRoom(room);
        if (room.clients.size === 0) scheduleDestroy(room);
        return yDocToDocument(room.yDoc);
      } finally {
        mutatingKeys.delete(descriptor.key);
      }
    });
  }

  async function applyNodeContent(descriptor: RoomDescriptor, mutation: NodeContentMutation, correlationId?: string): Promise<MindMapDocument> {
    assertAcceptingWork();
    return withKeyLock(descriptor.key, async () => {
      mutatingKeys.add(descriptor.key);
      try {
        const room = rooms.get(descriptor.key) ?? await getOrCreateRoomUnsafe(descriptor);
        room.correlationId = correlationId;
        if (room.destroyTimer) {
          clock.clearTimeout(room.destroyTimer);
          room.destroyTimer = null;
        }
        if (room.lastPersistError) throw new SyncRoomBusyError("degraded");

        const current = yDocToDocument(room.yDoc);
        const node = current.nodes.get(mutation.nodeId);
        if (!node || node.title !== mutation.expectedNodeTitle || node.content !== mutation.expectedNodeContent) {
          throw new SyncNodeConflictError();
        }

        room.userId = descriptor.userId;
        yUpdateContentDiff(room.yDoc, mutation.nodeId, node.content, mutation.nextNodeContent);
        for (const child of mutation.childNodes ?? []) {
          yAddNode(room.yDoc, mutation.nodeId, child.title, child.content, undefined, child.metadata);
        }
        cancelScheduledPersist(room);
        await flushRoom(room);
        if (room.clients.size === 0) scheduleDestroy(room);
        return yDocToDocument(room.yDoc);
      } finally {
        mutatingKeys.delete(descriptor.key);
      }
    });
  }

  async function applyKnowledgeNodes(descriptor: RoomDescriptor, nodes: KnowledgeNodeInput[], correlationId?: string) {
    assertAcceptingWork();
    return withKeyLock(descriptor.key, async () => {
      mutatingKeys.add(descriptor.key);
      try {
        const room = rooms.get(descriptor.key) ?? await getOrCreateRoomUnsafe(descriptor);
        room.correlationId = correlationId;
        if (room.destroyTimer) {
          clock.clearTimeout(room.destroyTimer);
          room.destroyTimer = null;
        }
        if (room.lastPersistError) throw new SyncRoomBusyError("degraded");
        room.userId = descriptor.userId;
        const change = applyKnowledgeNodesToYDoc(room.yDoc, nodes);
        cancelScheduledPersist(room);
        await flushRoom(room);
        if (room.clients.size === 0) scheduleDestroy(room);
        return { document: yDocToDocument(room.yDoc), ...change };
      } finally {
        mutatingKeys.delete(descriptor.key);
      }
    });
  }

  async function createDocument(descriptor: RoomDescriptor, document: MindMapDocument): Promise<MindMapDocument> {
    assertAcceptingWork();
    const create = persistence.create;
    if (!create) throw new Error("Document creation is not supported by this persistence.");
    const key = `create:${descriptor.workspaceId ?? "local"}:${descriptor.filename.toLowerCase()}`;
    return withKeyLock(key, () => create(descriptor, document));
  }

  async function renameDocument(
    descriptor: RoomDescriptor,
    newFilename: string,
    expectedVersion?: number,
  ): Promise<DocumentRenameResult> {
    assertAcceptingWork();
    const rename = persistence.rename;
    if (!rename) throw new Error("Document rename is not supported by this persistence.");
    return withKeyLock(descriptor.key, async () => {
      mutatingKeys.add(descriptor.key);
      try {
        const room = rooms.get(descriptor.key);
        let persistedVersion = expectedVersion;
        if (room) {
          if (room.clients.size > 0) throw new SyncRoomBusyError("active");
          if (room.lastPersistError) throw new SyncRoomBusyError("degraded");
          if (room.version != null && expectedVersion != null && room.version !== expectedVersion) {
            throw new SyncDocumentVersionConflictError();
          }
          if (room.destroyTimer) {
            clock.clearTimeout(room.destroyTimer);
            room.destroyTimer = null;
          }
          // The rename follows an explicit client disconnect. Flush any debounce timer or
          // in-flight persistence before moving the document, otherwise the last title edit could
          // remain attached to the old room/file or be lost when the room is destroyed.
          if (room.persistTimer) {
            clock.clearTimeout(room.persistTimer);
            room.persistTimer = null;
          }
          await flushRoom(room);
          persistedVersion = room.version ?? persistedVersion;
          destroyRoom(room.key);
        }
        return rename(descriptor, newFilename, persistedVersion);
      } finally {
        mutatingKeys.delete(descriptor.key);
      }
    });
  }

  async function deleteDocument(descriptor: RoomDescriptor, expectedVersion?: number): Promise<void> {
    assertAcceptingWork();
    const remove = persistence.delete;
    if (!remove) throw new Error("Document deletion is not supported by this persistence.");
    return withKeyLock(descriptor.key, async () => {
      mutatingKeys.add(descriptor.key);
      try {
        const room = rooms.get(descriptor.key);
        if (room) {
          assertRoomIsSafeForSnapshot(room);
          destroyRoom(room.key);
        }
        await remove(descriptor, expectedVersion);
      } finally {
        mutatingKeys.delete(descriptor.key);
      }
    });
  }

  function scheduleDestroy(room: SyncRoom) {
    if (draining) return;
    if (room.destroyTimer) clock.clearTimeout(room.destroyTimer);
    room.destroyTimer = clock.setTimeout(() => {
      if (room.clients.size === 0 && !room.lastPersistError) destroyRoom(room.key);
    }, config.destroyDelayMs);
  }

  function schedulePersist(room: SyncRoom): void {
    if (draining) return;
    if (room.persistTimer) {
      clock.clearTimeout(room.persistTimer);
    }
    room.persistTimer = clock.setTimeout(() => {
      room.persistTimer = null;
      refreshGauges();
      void persistRoom(room).catch(() => undefined);
    }, config.persistDebounceMs);
    refreshGauges();
  }

  async function persistRoom(room: SyncRoom): Promise<void> {
    const existing = persistencePromises.get(room);
    if (existing) return existing;
    room.isPersisting = true;
    refreshGauges();

    const task = (async () => {
      const startedAt = clock.now();
      const wasDegraded = room.lastPersistError !== null;
      const revision = room.revision;
      const operation = room.persistenceOperation?.revision === revision
        ? room.persistenceOperation
        : {
            id: crypto.randomUUID(),
            revision,
            expectedVersion: room.version,
          };
      room.persistenceOperation = operation;
      try {
        const doc = yDocToDocument(room.yDoc);
        // Storage metadata is mirrored into Y.Doc for clients, but an older client may merge a
        // stale version back into that shared metadata while reconnecting. The room's version is
        // the server-owned persistence cursor and must be the only version used for the write.
        const persistenceDocument = room.version != null && doc.storage
          ? {
              ...doc,
              storage: {
                ...doc.storage,
                documentId: room.documentId ?? doc.storage.documentId,
                workspaceId: room.workspaceId ?? doc.storage.workspaceId,
                version: room.version,
              },
            }
          : doc;
        const saved = await persistWithRetry(room, persistenceDocument, operation);
        if (saved.storage) {
          room.version = saved.storage.version;
          room.yDoc.transact(() => {
            room.yDoc.getMap("meta").set("storage", structuredClone(saved.storage));
          }, PERSISTENCE_ORIGIN);
        }
        room.lastPersistError = null;
        room.persistenceOperation = null;
        telemetry.observe("sync_persistence_duration_ms", clock.now() - startedAt);
        telemetry.event({
          operation: "persistence",
          outcome: wasDegraded ? "recovered" : "success",
          durationMs: clock.now() - startedAt,
          roomKey: room.key,
          correlationId: room.correlationId,
        });
        if (wasDegraded) telemetry.increment("sync_persistence_recoveries_total");
        if (room.revision !== revision) schedulePersist(room);
      } catch (err) {
        room.lastPersistError = err instanceof Error ? err.message : "Persistence failed";
        telemetry.increment("sync_persistence_errors_total");
        telemetry.event({ operation: "persistence", outcome: "error", durationMs: clock.now() - startedAt, roomKey: room.key, correlationId: room.correlationId, error: err });
        throw err;
      } finally {
        room.isPersisting = false;
        persistencePromises.delete(room);
        refreshGauges();
      }
    })();
    persistencePromises.set(room, task);
    return task;
  }

  async function persistWithRetry(
    room: SyncRoom,
    document: MindMapDocument,
    operation: PersistenceOperation,
  ): Promise<MindMapDocument> {
    const maxAttempts = config.persistenceRetryMaxAttempts ?? 3;
    const baseDelayMs = config.persistenceRetryBaseMs ?? 100;
    const maxDelayMs = config.persistenceRetryMaxDelayMs ?? 2_000;
    const maxDurationMs = config.persistenceRetryMaxDurationMs ?? 10_000;
    const saveTimeoutMs = config.persistenceSaveTimeoutMs ?? 15_000;
    const startedAt = clock.now();
    let attempt = 1;
    while (true) {
      try {
        return await withPersistenceTimeout(clock, persistence.save({
          key: room.key,
          filename: room.filename,
          workspaceId: room.workspaceId,
          documentId: room.documentId,
          userId: room.userId,
        }, document, operation), saveTimeoutMs, (timer) => {
          room.persistenceTimeoutTimer = timer;
        });
      } catch (error) {
        let confirmed: MindMapDocument | null = null;
        if (persistence.confirmSave) {
          try {
            confirmed = await persistence.confirmSave({
              key: room.key,
              filename: room.filename,
              workspaceId: room.workspaceId,
              documentId: room.documentId,
              userId: room.userId,
            }, operation);
          } catch (confirmationError) {
            // A retry is only sound when the adapter has proved that no write reached storage.
            // For an interrupted/unknown commit, an unavailable confirmation leaves the outcome
            // ambiguous and the room must remain degraded instead of risking a second write.
            if (!(error instanceof SyncRetryablePersistenceError)) {
              throw new SyncPersistenceCommitUnknownError(
                confirmationError instanceof Error ? confirmationError.message : "PERSISTENCE_CONFIRMATION_FAILED",
              );
            }
          }
        }
        if (confirmed) return confirmed;
        if (!(error instanceof SyncRetryablePersistenceError) || attempt >= maxAttempts) throw error;
        const delayMs = retryDelay(operation.id, attempt, baseDelayMs, maxDelayMs);
        if (clock.now() - startedAt + delayMs > maxDurationMs) throw error;
        telemetry.increment("sync_persistence_retries_total");
        telemetry.event({ operation: "persistence", outcome: "retry", retry: attempt, roomKey: room.key, correlationId: room.correlationId, error });
        await waitFor(clock, delayMs);
        attempt += 1;
      }
    }
  }

  /**
   * The edit above also scheduled the debounced save; flushRoom saves now, so a second save of the
   * same content later would only bump the version the caller was just given.
   */
  function cancelScheduledPersist(room: SyncRoom) {
    if (!room.persistTimer) return;
    clock.clearTimeout(room.persistTimer);
    room.persistTimer = null;
  }

  async function flushRoom(room: SyncRoom) {
    let persistedRevision = -1;
    while (persistedRevision !== room.revision) {
      persistedRevision = room.revision;
      await persistRoom(room);
    }
  }

  function destroyRoom(filename: string): void {
    const room = rooms.get(filename);
    if (!room) return;

    if (room.persistTimer) {
      clock.clearTimeout(room.persistTimer);
    }
    if (room.persistenceTimeoutTimer) {
      clock.clearTimeout(room.persistenceTimeoutTimer);
      room.persistenceTimeoutTimer = null;
    }
    if (room.destroyTimer) {
      clock.clearTimeout(room.destroyTimer);
    }

    room.awareness.destroy();
    room.yDoc.destroy();
    rooms.delete(filename);
    refreshGauges();
    telemetry.event({ operation: "room.destroy", outcome: "success", roomKey: room.key });
  }

  return {
    authorize: (descriptor) => persistence.authorize(descriptor),
    getOrCreateRoom,
    addClient,
    removeClient,
    writeDocumentSnapshot,
    applyNodeContent,
    applyKnowledgeNodes,
    createDocument,
    renameDocument,
    deleteDocument,
    persistRoom,
    getRooms: () => rooms,
    getTelemetry: () => telemetry,
    beginDrain() {
      draining = true;
    },
    async shutdown(options = {}) {
      draining = true;
      const activeRooms = [...rooms.values()];
      for (const room of activeRooms) {
        if (room.persistTimer) {
          clock.clearTimeout(room.persistTimer);
          room.persistTimer = null;
        }
        if (room.destroyTimer) {
          clock.clearTimeout(room.destroyTimer);
          room.destroyTimer = null;
        }
      }
      refreshGauges();

      const timeoutMs = options.timeoutMs ?? config.shutdownTimeoutMs ?? 20_000;
      const results = await Promise.all(activeRooms.map(async (room) => {
        const startedAt = clock.now();
        try {
          await withRoomShutdownTimeout(clock, flushRoom(room), timeoutMs);
          telemetry.observe("sync_room_flush_duration_ms", clock.now() - startedAt);
          telemetry.event({ operation: "shutdown.flush", outcome: "success", durationMs: clock.now() - startedAt, roomKey: room.key });
          return { key: room.key, status: "flushed" as const };
        } catch (error) {
          const timedOut = error instanceof SyncRoomShutdownTimeoutError;
          telemetry.observe("sync_room_flush_duration_ms", clock.now() - startedAt);
          telemetry.increment("sync_room_flush_errors_total");
          telemetry.event({ operation: "shutdown.flush", outcome: "error", durationMs: clock.now() - startedAt, roomKey: room.key, error });
          return { key: room.key, status: timedOut ? "timed-out" as const : "failed" as const };
        }
      }));
      for (const room of activeRooms) destroyRoom(room.key);
      return {
        flushedRooms: results.filter((result) => result.status === "flushed").length,
        failedRoomKeys: results.filter((result) => result.status === "failed").map((result) => result.key),
        timedOutRoomKeys: results.filter((result) => result.status === "timed-out").map((result) => result.key),
      };
    },
  };
}

class SyncRoomShutdownTimeoutError extends Error {
  constructor() {
    super("SYNC_SHUTDOWN_FLUSH_TIMEOUT");
    this.name = "SyncRoomShutdownTimeoutError";
  }
}

function retryDelay(operationId: string, attempt: number, baseDelayMs: number, maxDelayMs: number): number {
  const exponential = Math.min(maxDelayMs, baseDelayMs * (2 ** (attempt - 1)));
  let hash = 0;
  for (const char of `${operationId}:${attempt}`) hash = ((hash * 31) + char.charCodeAt(0)) | 0;
  const jitter = 0.8 + ((hash >>> 0) % 401) / 1_000;
  return Math.round(exponential * jitter);
}

function waitFor(clock: SyncClock, delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    clock.setTimeout(resolve, delayMs);
  });
}

/**
 * A storage timeout leaves the commit outcome unknown. The caller will therefore ask the adapter
 * to confirm the named operation and only accepts a confirmed result; it never turns this into a
 * blind retry. The original promise is deliberately observed by Promise.race so a late rejection
 * cannot become unhandled.
 */
function withPersistenceTimeout<T>(
  clock: SyncClock,
  task: Promise<T>,
  timeoutMs: number,
  onTimer: (timer: unknown | null) => void,
): Promise<T> {
  let timer: unknown = null;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = clock.setTimeout(() => reject(new SyncPersistenceTimeoutError()), timeoutMs);
    onTimer(timer);
  });
  return Promise.race([task, timeout]).finally(() => {
    if (timer != null) clock.clearTimeout(timer);
    onTimer(null);
  });
}

function withRoomShutdownTimeout<T>(clock: SyncClock, task: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: unknown = null;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = clock.setTimeout(() => reject(new SyncRoomShutdownTimeoutError()), timeoutMs);
  });
  return Promise.race([task, timeout]).finally(() => {
    if (timer != null) clock.clearTimeout(timer);
  });
}
