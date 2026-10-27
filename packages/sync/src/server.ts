import { Hono } from "hono";
import { isKnowledgeInputError, KnowledgeNodeNotFoundError, parseKnowledgeNodeInputs, type KnowledgeNodeInput } from "@bloommd/core/knowledge";
import { cors } from "hono/cors";
import { timingSafeEqual } from "node:crypto";
import { createBunWebSocket } from "hono/bun";
import type { ServerWebSocket } from "bun";
import { createSyncTelemetry, type SyncTelemetry } from "./observability";
import { SyncNodeConflictError, SyncRoomBusyError, SyncRoomCapacityError, SyncServerDrainingError, type RoomManager, type RoomShutdownResult } from "./rooms";
import { SyncDocumentNotFoundError, SyncDocumentVersionConflictError } from "./persistence";
import type { RoomDescriptor, SyncRoom, SyncServerConfig, WebSocketData } from "./types";
import { parseFile, sanitizeMarkdownFilename, verifySyncTicket } from "@bloommd/core";
import { sendSyncStep1, handleSyncMessage, isReadOnlyMessageAllowed, releaseAwarenessClients, sendAwarenessStates } from "./sync-handler";

export function isSyncTokenAuthorized(configuredApiKey: string | undefined, token: string | undefined) {
  if (!configuredApiKey) return true;
  if (!token) return false;
  const expected = Buffer.from(configuredApiKey);
  const actual = Buffer.from(token);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function isSyncOriginAllowed(allowedOrigins: string[] | undefined, origin: string | undefined) {
  if (!origin) return true;
  if (!allowedOrigins || allowedOrigins.length === 0) return true;
  return allowedOrigins.includes(origin);
}

function bearerToken(value: string | undefined) {
  const [scheme, token] = value?.split(/\s+/, 2) ?? [];
  return scheme?.toLowerCase() === "bearer" ? token : undefined;
}

interface InternalDocumentBody {
  filename?: string;
  newFilename?: string;
  markdown?: string;
  workspaceId?: string;
  userId?: string;
  expectedVersion?: number;
  nodeId?: string;
  expectedNodeTitle?: string;
  expectedNodeContent?: string;
  nextNodeContent?: string;
  childNodes?: Array<{
    title?: string;
    content?: string;
    kind?: string;
  }>;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isValidExpectedVersion(value: unknown): value is number | undefined {
  return value === undefined || (typeof value === "number" && Number.isSafeInteger(value) && value >= 0);
}

/** Agent node operations, checked by the shared strict parser (fields, types, values, content). */
function parseKnowledgeNodes(value: unknown): { nodes: KnowledgeNodeInput[] } | { error: string } {
  try {
    return { nodes: parseKnowledgeNodeInputs(value) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Invalid nodes." };
  }
}

function parseAgentChildNodes(value: unknown): Array<{
  title: string;
  content: string;
  metadata: { kind: "task" | "decision" };
}> | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 12) return null;
  const children: Array<{
    title: string;
    content: string;
    metadata: { kind: "task" | "decision" };
  }> = [];
  for (const child of value) {
    if (!child || typeof child !== "object") return null;
    const candidate = child as { title?: unknown; content?: unknown; kind?: unknown };
    if (
      !isNonEmptyString(candidate.title) || candidate.title.length > 240 ||
      !isString(candidate.content) || candidate.content.length > 64 * 1024 ||
      (candidate.kind !== "task" && candidate.kind !== "decision")
    ) return null;
    children.push({
      title: candidate.title.trim(),
      content: candidate.content,
      metadata: { kind: candidate.kind },
    });
  }
  return children;
}

function internalDocumentDescriptor(
  body: InternalDocumentBody,
  documentId?: string,
): RoomDescriptor | null {
  if (!isNonEmptyString(body.filename) || !isNonEmptyString(body.workspaceId) || !isNonEmptyString(body.userId)) {
    return null;
  }
  let filename: string;
  try {
    filename = sanitizeMarkdownFilename(body.filename);
  } catch {
    return null;
  }
  const key = documentId ?? `create:${body.workspaceId}:${filename.toLowerCase()}`;
  return {
    key,
    filename,
    workspaceId: body.workspaceId,
    documentId,
    userId: body.userId,
    permission: "write",
  };
}

function mutationErrorResponse(error: unknown) {
  if (error instanceof SyncServerDrainingError) {
    return { status: 503 as const, body: { error: "Sync server is draining for shutdown.", code: "SYNC_DRAINING" } };
  }
  if (error instanceof SyncNodeConflictError) {
    return { status: 409 as const, body: { error: "The target node changed or was removed after the agent task was created.", code: "AGENT_NODE_STALE" } };
  }
  if (error instanceof SyncRoomBusyError) {
    const code = error.reason === "degraded"
      ? "SYNC_ROOM_DEGRADED"
      : error.reason === "pending"
        ? "SYNC_ROOM_PENDING"
        : "SYNC_ROOM_ACTIVE";
    const message = error.reason === "degraded"
      ? "Document persistence needs reconciliation."
      : error.reason === "pending"
        ? "Document persistence is still pending."
        : "Document is active in another sync session.";
    return { status: 409 as const, body: { error: message, code } };
  }
  if (error instanceof SyncDocumentVersionConflictError) {
    return { status: 409 as const, body: { error: "Document version changed on the server.", code: "VERSION_CONFLICT" } };
  }
  if (error instanceof SyncDocumentNotFoundError) {
    return { status: 404 as const, body: { error: "Document not found or access denied.", code: "DOCUMENT_NOT_FOUND" } };
  }
  if (error instanceof Error && error.message === "DOCUMENT_FILENAME_CONFLICT") {
    return { status: 409 as const, body: { error: "A document with this filename already exists.", code: "DOCUMENT_FILENAME_CONFLICT" } };
  }
  return { status: 503 as const, body: { error: "Document mutation service is unavailable.", code: "SYNC_MUTATION_UNAVAILABLE" } };
}

export interface SyncWebSocketState {
  roomKey: string;
  descriptor: RoomDescriptor;
  permission: "read" | "write";
  userId?: string;
  correlationId?: string;
}

export interface SyncServerDrainResult {
  state: "drained";
  closedClients: number;
  rooms: RoomShutdownResult;
}

/**
 * Re-checks the current database authorization for an already-open client.
 *
 * A sync ticket is intentionally short-lived, but a WebSocket can outlive a
 * workspace membership. Every client message therefore needs a fresh
 * membership check before it is applied to the room. Filesystem rooms have no
 * database identity and keep their connection-time permission.
 */
export async function refreshSyncClientPermission(
  roomManager: Pick<RoomManager, "authorize">,
  state: SyncWebSocketState,
): Promise<"read" | "write" | null> {
  if (!state.descriptor.workspaceId || !state.descriptor.documentId || !state.descriptor.userId) {
    return state.permission;
  }

  try {
    const currentPermission = await roomManager.authorize(state.descriptor);
    state.permission = state.descriptor.permission === "read" || currentPermission === "read" ? "read" : "write";
    return state.permission;
  } catch {
    return null;
  }
}

export type SyncMessageDisposition = "processed" | "ignored" | "revoked";

export function getSyncRoomOpenFailure(error: unknown): { code: 4004 | 4008; reason: "File not found" | "Room capacity reached" } {
  if (error instanceof SyncRoomCapacityError) {
    return { code: 4008, reason: "Room capacity reached" };
  }
  return { code: 4004, reason: "File not found" };
}

/** Authorizes and applies one message from an existing WebSocket client. */
export async function processSyncClientMessage(
  roomManager: Pick<RoomManager, "authorize">,
  state: SyncWebSocketState,
  room: SyncRoom,
  ws: ServerWebSocket<WebSocketData>,
  message: Uint8Array,
  maxMessageBytes: number,
  isDraining: () => boolean = () => false,
  telemetry?: SyncTelemetry,
  correlationId?: string,
): Promise<SyncMessageDisposition> {
  const startedAt = Date.now();
  function finish(disposition: SyncMessageDisposition): SyncMessageDisposition {
    telemetry?.observe("sync_message_duration_ms", Date.now() - startedAt);
    if (disposition === "processed") {
      telemetry?.increment("sync_messages_total");
      telemetry?.event({ operation: "websocket.message", outcome: "success", durationMs: Date.now() - startedAt, roomKey: room.key, correlationId });
    } else {
      telemetry?.increment("sync_messages_dropped_total");
      telemetry?.event({ operation: "websocket.message", outcome: disposition === "revoked" ? "error" : "dropped", durationMs: Date.now() - startedAt, roomKey: room.key, correlationId });
    }
    return disposition;
  }
  if (isDraining()) {
    ws.close(1012, "Service restarting");
    return finish("ignored");
  }
  const permission = await refreshSyncClientPermission(roomManager, state);
  // Authorization is asynchronous. A SIGTERM can begin draining while that check is in flight,
  // so check again immediately before a message could mutate the Y.Doc.
  if (isDraining()) {
    ws.close(1012, "Service restarting");
    return finish("ignored");
  }
  if (!permission) {
    ws.close(4003, "Access revoked");
    return finish("revoked");
  }

  if (message.length === 0) return finish("ignored");
  if (message.length > maxMessageBytes) {
    ws.close(1009, "Message too large");
    return finish("ignored");
  }
  if (permission === "read" && !isReadOnlyMessageAllowed(message)) return finish("ignored");
  if (permission === "write") room.userId = state.userId;
  handleSyncMessage(room.yDoc, message, ws, room, telemetry, correlationId);
  return finish("processed");
}

export function createSyncServer(roomManager: RoomManager, config: Pick<SyncServerConfig, "apiKey" | "syncSecret" | "allowedOrigins" | "maxClientsPerRoom" | "maxMessageBytes" | "shutdownTimeoutMs"> = {}) {
  const app = new Hono();
  const { upgradeWebSocket, websocket } = createBunWebSocket();
  const telemetry = roomManager.getTelemetry?.() ?? createSyncTelemetry({ write: () => undefined });

  // Map WebSocket instances to their room names (avoids overwriting ws.data)
  const wsRoomMap = new Map<ServerWebSocket<WebSocketData>, SyncWebSocketState>();
  let draining = false;
  let drainPromise: Promise<SyncServerDrainResult> | null = null;

  app.use("/*", cors({
    origin: (origin) => isSyncOriginAllowed(config.allowedOrigins, origin) ? origin : "",
  }));

  function isAuthorized(token: string | undefined) {
    return isSyncTokenAuthorized(config.apiKey, token);
  }

  function drainingResponse() {
    return { error: "Sync server is draining for shutdown.", code: "SYNC_DRAINING" };
  }

  function disconnectClient(raw: ServerWebSocket<WebSocketData>): void {
    const clientState = wsRoomMap.get(raw);
    if (!clientState) return;
    const room = roomManager.getRooms().get(clientState.roomKey);
    if (room) {
      releaseAwarenessClients(room, raw);
      roomManager.removeClient(room, raw);
      telemetry.event({ operation: "websocket.disconnect", outcome: "success", roomKey: clientState.roomKey, correlationId: clientState.correlationId });
    }
    wsRoomMap.delete(raw);
  }

  async function drain(): Promise<SyncServerDrainResult> {
    if (drainPromise) return drainPromise;
    draining = true;
    roomManager.beginDrain();
    const activeClients = [...wsRoomMap.keys()];
    for (const raw of activeClients) {
      disconnectClient(raw);
      raw.close(1012, "Service restarting");
    }
    drainPromise = roomManager.shutdown({ timeoutMs: config.shutdownTimeoutMs }).then((rooms) => ({
      state: "drained" as const,
      closedClients: activeClients.length,
      rooms,
    }));
    return drainPromise;
  }

  // Health endpoint
  app.get("/health", (c) => {
    const rooms = roomManager.getRooms();
    let totalClients = 0;
    for (const room of rooms.values()) {
      totalClients += room.clients.size;
    }
    const persistenceFailures = [...rooms.values()].filter((room) => room.lastPersistError).length;
    const inFlightRoomOperations = [...rooms.values()].filter((room) => room.isPersisting).length;
    const pendingPersistenceRooms = [...rooms.values()].filter((room) => room.persistTimer).length;
    telemetry.setGauge("sync_active_rooms", rooms.size);
    telemetry.setGauge("sync_active_clients", totalClients);
    telemetry.setGauge("sync_degraded_rooms", persistenceFailures);
    telemetry.setGauge("sync_room_operations_in_flight", inFlightRoomOperations);
    telemetry.setGauge("sync_pending_persistence_rooms", pendingPersistenceRooms);
    return c.json({
      status: draining ? "draining" : persistenceFailures > 0 ? "degraded" : "ok",
      rooms: rooms.size,
      clients: totalClients,
      persistenceFailures,
      inFlightRoomOperations,
      pendingPersistenceRooms,
    });
  });

  app.get("/metrics", (c) => {
    if (!isSyncTokenAuthorized(config.syncSecret, bearerToken(c.req.header("authorization")))) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    return c.body(telemetry.prometheus(), 200, { "content-type": "text/plain; version=0.0.4; charset=utf-8" });
  });

  // Traffic routers use readiness; liveness remains observable while a process drains so it can
  // finish its bounded flush instead of being killed a second time by an eager restart policy.
  app.get("/ready", (c) => {
    const hasPersistenceFailure = [...roomManager.getRooms().values()].some((room) => room.lastPersistError);
    if (draining || hasPersistenceFailure) {
      return c.json({ status: draining ? "draining" : "degraded" }, 503);
    }
    return c.json({ status: "ready" });
  });

  app.get("/internal/rooms/:roomId", (c) => {
    if (!isSyncTokenAuthorized(config.syncSecret, bearerToken(c.req.header("authorization")))) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    const roomId = decodeURIComponent(c.req.param("roomId") ?? "");
    const room = roomManager.getRooms().get(roomId);
    return c.json({
      active: Boolean(room),
      clients: room?.clients.size ?? 0,
      isPersisting: room?.isPersisting ?? false,
      hasPendingPersist: Boolean(room?.persistTimer),
      degraded: Boolean(room?.lastPersistError),
      version: room?.version ?? null,
    });
  });

  app.put("/internal/documents/:documentId/snapshot", async (c) => {
    if (!isSyncTokenAuthorized(config.syncSecret, bearerToken(c.req.header("authorization")))) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (draining) return c.json(drainingResponse(), 503);
    const documentId = decodeURIComponent(c.req.param("documentId") ?? "");
    const correlationId = telemetry.correlationId();
    const startedAt = Date.now();
    const body = await c.req.json<InternalDocumentBody>().catch(() => null);
    const descriptor = body && internalDocumentDescriptor(body, documentId);
    if (!descriptor || !isNonEmptyString(body?.markdown) || !isValidExpectedVersion(body?.expectedVersion)) {
      return c.json({ error: "filename, markdown, workspaceId, and userId are required; expectedVersion must be a non-negative integer when provided." }, 400);
    }
    try {
      const document = parseFile(descriptor.filename, body.markdown);
      const saved = await roomManager.writeDocumentSnapshot(descriptor, document, body.expectedVersion, correlationId);
      telemetry.event({ operation: "document.snapshot", outcome: "success", durationMs: Date.now() - startedAt, roomKey: descriptor.key, correlationId });
      return c.json({
        filePath: saved.filePath,
        frontmatter: saved.frontmatter,
        storage: saved.storage,
        version: saved.storage?.version ?? null,
      });
    } catch (error) {
      const response = mutationErrorResponse(error);
      telemetry.event({ operation: "document.snapshot", outcome: "error", durationMs: Date.now() - startedAt, roomKey: descriptor.key, correlationId, error });
      return c.json(response.body, response.status);
    }
  });

  app.post("/internal/documents/:documentId/nodes", async (c) => {
    if (!isSyncTokenAuthorized(config.syncSecret, bearerToken(c.req.header("authorization")))) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (draining) return c.json(drainingResponse(), 503);
    const documentId = decodeURIComponent(c.req.param("documentId") ?? "");
    const correlationId = telemetry.correlationId();
    const startedAt = Date.now();
    const body = await c.req.json<InternalDocumentBody & { nodes?: unknown }>().catch(() => null);
    const descriptor = body && internalDocumentDescriptor(body, documentId);
    if (!descriptor) return c.json({ error: "filename, workspaceId, userId and 1 to 200 valid nodes are required." }, 400);
    const parsed = parseKnowledgeNodes(body?.nodes);
    if ("error" in parsed) return c.json({ error: parsed.error, code: "INVALID_NODES" }, 400);
    const { nodes } = parsed;
    try {
      const result = await roomManager.applyKnowledgeNodes(descriptor, nodes, correlationId);
      telemetry.event({ operation: "document.nodes", outcome: "success", durationMs: Date.now() - startedAt, roomKey: descriptor.key, correlationId });
      return c.json({
        filePath: result.document.filePath,
        storage: result.document.storage,
        version: result.document.storage?.version ?? null,
        ids: result.ids,
        created: result.created,
        updated: result.updated,
      });
    } catch (error) {
      if (isKnowledgeInputError(error)) {
        telemetry.event({ operation: "document.nodes", outcome: "error", durationMs: Date.now() - startedAt, roomKey: descriptor.key, correlationId, error });
        // The caller decides how an unknown node id is reported: 404 for a node route, 400 for the batch route.
        if (error instanceof KnowledgeNodeNotFoundError) return c.json({ error: error.message, code: "NODE_NOT_FOUND" }, 404);
        return c.json({ error: error.message, code: "INVALID_NODES" }, 400);
      }
      const response = mutationErrorResponse(error);
      telemetry.event({ operation: "document.nodes", outcome: "error", durationMs: Date.now() - startedAt, roomKey: descriptor.key, correlationId, error });
      return c.json(response.body, response.status);
    }
  });

  app.post("/internal/documents/:documentId/node-content", async (c) => {
    if (!isSyncTokenAuthorized(config.syncSecret, bearerToken(c.req.header("authorization")))) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (draining) return c.json(drainingResponse(), 503);
    const documentId = decodeURIComponent(c.req.param("documentId") ?? "");
    const correlationId = telemetry.correlationId();
    const startedAt = Date.now();
    const body = await c.req.json<InternalDocumentBody>().catch(() => null);
    const descriptor = body && internalDocumentDescriptor(body, documentId);
    const childNodes = parseAgentChildNodes(body?.childNodes);
    if (!descriptor || !isNonEmptyString(body?.nodeId) || !isString(body?.expectedNodeTitle) || !isString(body?.expectedNodeContent) || !isString(body?.nextNodeContent) || !childNodes) {
      return c.json({ error: "filename, workspaceId, userId, nodeId, expectedNodeTitle, expectedNodeContent, nextNodeContent, and valid task or decision child nodes are required." }, 400);
    }
    try {
      const saved = await roomManager.applyNodeContent(descriptor, {
        nodeId: body.nodeId,
        expectedNodeTitle: body.expectedNodeTitle,
        expectedNodeContent: body.expectedNodeContent,
        nextNodeContent: body.nextNodeContent,
        childNodes,
      }, correlationId);
      telemetry.event({ operation: "document.node-content", outcome: "success", durationMs: Date.now() - startedAt, roomKey: descriptor.key, correlationId });
      return c.json({
        filePath: saved.filePath,
        frontmatter: saved.frontmatter,
        storage: saved.storage,
        version: saved.storage?.version ?? null,
      });
    } catch (error) {
      const response = mutationErrorResponse(error);
      telemetry.event({ operation: "document.node-content", outcome: "error", durationMs: Date.now() - startedAt, roomKey: descriptor.key, correlationId, error });
      return c.json(response.body, response.status);
    }
  });

  app.post("/internal/documents", async (c) => {
    if (!isSyncTokenAuthorized(config.syncSecret, bearerToken(c.req.header("authorization")))) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (draining) return c.json(drainingResponse(), 503);
    const correlationId = telemetry.correlationId();
    const startedAt = Date.now();
    const body = await c.req.json<InternalDocumentBody>().catch(() => null);
    const descriptor = body && internalDocumentDescriptor(body);
    if (!descriptor || !isNonEmptyString(body?.markdown)) {
      return c.json({ error: "filename, markdown, workspaceId, and userId are required." }, 400);
    }
    try {
      const document = parseFile(descriptor.filename, body.markdown);
      const saved = await roomManager.createDocument(descriptor, document);
      telemetry.event({ operation: "document.create", outcome: "success", durationMs: Date.now() - startedAt, roomKey: descriptor.key, correlationId });
      return c.json({
        filePath: saved.filePath,
        frontmatter: saved.frontmatter,
        storage: saved.storage,
      }, 201);
    } catch (error) {
      const response = mutationErrorResponse(error);
      telemetry.event({ operation: "document.create", outcome: "error", durationMs: Date.now() - startedAt, roomKey: descriptor.key, correlationId, error });
      return c.json(response.body, response.status);
    }
  });

  app.patch("/internal/documents/:documentId", async (c) => {
    if (!isSyncTokenAuthorized(config.syncSecret, bearerToken(c.req.header("authorization")))) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (draining) return c.json(drainingResponse(), 503);
    const documentId = decodeURIComponent(c.req.param("documentId") ?? "");
    const correlationId = telemetry.correlationId();
    const startedAt = Date.now();
    const body = await c.req.json<InternalDocumentBody>().catch(() => null);
    const descriptor = body && internalDocumentDescriptor(body, documentId);
    if (!descriptor || !isNonEmptyString(body?.newFilename) || !isValidExpectedVersion(body?.expectedVersion)) {
      return c.json({ error: "filename, newFilename, workspaceId, and userId are required; expectedVersion must be a non-negative integer when provided." }, 400);
    }
    try {
      const newFilename = sanitizeMarkdownFilename(body.newFilename);
      const renamed = await roomManager.renameDocument(descriptor, newFilename, body.expectedVersion);
      telemetry.event({ operation: "document.rename", outcome: "success", durationMs: Date.now() - startedAt, roomKey: descriptor.key, correlationId });
      return c.json({ success: true, newFilePath: renamed.filename, newFilename: renamed.filename, version: renamed.version });
    } catch (error) {
      const response = mutationErrorResponse(error);
      telemetry.event({ operation: "document.rename", outcome: "error", durationMs: Date.now() - startedAt, roomKey: descriptor.key, correlationId, error });
      return c.json(response.body, response.status);
    }
  });

  app.delete("/internal/documents/:documentId", async (c) => {
    if (!isSyncTokenAuthorized(config.syncSecret, bearerToken(c.req.header("authorization")))) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (draining) return c.json(drainingResponse(), 503);
    const documentId = decodeURIComponent(c.req.param("documentId") ?? "");
    const correlationId = telemetry.correlationId();
    const startedAt = Date.now();
    const body = await c.req.json<InternalDocumentBody>().catch(() => null);
    const descriptor = body && internalDocumentDescriptor(body, documentId);
    if (!descriptor || !isValidExpectedVersion(body?.expectedVersion)) {
      return c.json({ error: "filename, workspaceId, and userId are required; expectedVersion must be a non-negative integer when provided." }, 400);
    }
    try {
      await roomManager.deleteDocument(descriptor, body.expectedVersion);
      telemetry.event({ operation: "document.delete", outcome: "success", durationMs: Date.now() - startedAt, roomKey: descriptor.key, correlationId });
      return c.json({ deleted: descriptor.filename });
    } catch (error) {
      const response = mutationErrorResponse(error);
      telemetry.event({ operation: "document.delete", outcome: "error", durationMs: Date.now() - startedAt, roomKey: descriptor.key, correlationId, error });
      return c.json(response.body, response.status);
    }
  });

  // WebSocket sync endpoint: /ws/:filename
  app.get(
    "/ws/:filename",
    upgradeWebSocket((c) => {
      const roomParam = decodeURIComponent(c.req.param("filename") ?? "");
      const token = c.req.query("token") ?? undefined;
      const ticket = c.req.query("ticket") ?? undefined;
      const originAllowed = isSyncOriginAllowed(config.allowedOrigins, c.req.header("origin"));
      const claims = config.syncSecret ? verifySyncTicket(ticket, config.syncSecret) : null;
      const descriptor: RoomDescriptor | null = claims && claims.documentId === roomParam
        ? {
            key: claims.documentId,
            filename: claims.filename,
            workspaceId: claims.workspaceId,
            documentId: claims.documentId,
            userId: claims.userId,
            ...(claims.tokenId ? { tokenId: claims.tokenId } : {}),
            permission: claims.permission,
          }
        : config.syncSecret
          ? null
          : { key: roomParam, filename: roomParam, permission: "write" };
      const authorized = originAllowed && descriptor !== null && (config.syncSecret ? Boolean(claims) : isAuthorized(token));

      return {
        onOpen: async (_event, ws) => {
          const raw = ws.raw as unknown as ServerWebSocket<WebSocketData>;
          if (draining) {
            ws.close(1012, "Service restarting");
            return;
          }
          if (!authorized) {
            ws.close(4001, "Unauthorized");
            return;
          }

          try {
            if (!descriptor) throw new Error("Invalid sync ticket");
            const currentPermission = await roomManager.authorize(descriptor);
            if (draining) {
              ws.close(1012, "Service restarting");
              return;
            }
            const permission = descriptor.permission === "read" || currentPermission === "read" ? "read" : "write";
            const room = await roomManager.getOrCreateRoom(descriptor);
            if (room.clients.size >= (config.maxClientsPerRoom ?? 100)) {
              ws.close(4008, "Room capacity reached");
              return;
            }

            const correlationId = telemetry.correlationId();
            wsRoomMap.set(raw, { roomKey: room.key, descriptor, permission, userId: descriptor.userId, correlationId });
            roomManager.addClient(room, raw);
            sendSyncStep1(room.yDoc, raw);
            // Hand the newcomer the current presence, otherwise it sees an empty room until
            // somebody else happens to move.
            sendAwarenessStates(room, raw);

            telemetry.event({ operation: "websocket.connect", outcome: "success", roomKey: room.key, correlationId });
          } catch (err) {
            const failure = getSyncRoomOpenFailure(err);
            telemetry.event({ operation: "websocket.connect", outcome: "error", error: err });
            ws.close(failure.code, failure.reason);
          }
        },

        onMessage: (event, ws) => {
          void (async () => {
            const raw = ws.raw as unknown as ServerWebSocket<WebSocketData>;
            const clientState = wsRoomMap.get(raw);
            if (!clientState) return;
            if (draining) {
              disconnectClient(raw);
              ws.close(1012, "Service restarting");
              return;
            }

            const room = roomManager.getRooms().get(clientState.roomKey);
            if (!room) return;
            room.correlationId = clientState.correlationId;

            const data = event.data;
            const message =
              data instanceof ArrayBuffer
                ? new Uint8Array(data)
                : data instanceof Uint8Array
                ? data
                : new Uint8Array(0);
            await processSyncClientMessage(
              roomManager,
              clientState,
              room,
              raw,
              message,
              config.maxMessageBytes ?? 1024 * 1024,
              () => draining,
              telemetry,
              clientState.correlationId,
            );
          })().catch((error: unknown) => {
            telemetry.increment("sync_messages_dropped_total");
            telemetry.event({ operation: "websocket.message", outcome: "error", error });
            ws.close(1011, "Sync authorization failed");
          });
        },

        onClose: (_event, ws) => {
          const raw = ws.raw as unknown as ServerWebSocket<WebSocketData>;
          disconnectClient(raw);
        },
      };
    }),
  );

  return { app, websocket, drain, isDraining: () => draining };
}
