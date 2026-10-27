import type * as Y from "yjs";
import type { Awareness } from "y-protocols/awareness";
import type { ServerWebSocket } from "bun";
import type { SyncTelemetry } from "./observability";

export interface WebSocketData {
  roomName: string;
}

export interface SyncRoom {
  key: string;
  filename: string;
  workspaceId?: string;
  documentId?: string;
  userId?: string;
  /** Opaque server-generated trace id of the operation that last changed this room. */
  correlationId?: string;
  version?: number;
  yDoc: Y.Doc;
  clients: Set<ServerWebSocket<WebSocketData>>;
  /**
   * Room-wide presence. The server is not a participant, it only mirrors the clients' states so a
   * client joining an existing room immediately learns who is already there.
   */
  awareness: Awareness;
  /** Which awareness client ids each connection owns, so they can be cleared on disconnect. */
  awarenessClients: Map<ServerWebSocket<WebSocketData>, Set<number>>;
  persistTimer: unknown | null;
  /** Timer for an in-flight persistence request; cleared if a bounded shutdown gives up. */
  persistenceTimeoutTimer: unknown | null;
  destroyTimer: unknown | null;
  isPersisting: boolean;
  revision: number;
  /** Retained across safe retries until this logical revision is confirmed persisted. */
  persistenceOperation: PersistenceOperation | null;
  lastPersistError: string | null;
}

export interface PersistenceOperation {
  id: string;
  revision: number;
  expectedVersion?: number;
}

export interface SyncServerConfig {
  baseDir: string;
  port: number;
  persistDebounceMs: number;
  destroyDelayMs: number;
  apiKey?: string;
  syncSecret?: string;
  databaseUrl?: string;
  allowedOrigins?: string[];
  maxRooms?: number;
  maxClientsPerRoom?: number;
  maxMessageBytes?: number;
  persistenceRetryMaxAttempts?: number;
  persistenceRetryBaseMs?: number;
  persistenceRetryMaxDelayMs?: number;
  persistenceRetryMaxDurationMs?: number;
  /** Bound one persistence request. A timeout is treated as an unknown commit, never retried blindly. */
  persistenceSaveTimeoutMs?: number;
  /** Bound the complete graceful shutdown drain, including final room flushes. */
  shutdownTimeoutMs?: number;
  /** Server-only telemetry implementation. Never pass this to browser code. */
  telemetry?: SyncTelemetry;
}

export interface RoomDescriptor {
  key: string;
  filename: string;
  workspaceId?: string;
  documentId?: string;
  userId?: string;
  /** The access token the ticket was made for; its state decides over the connection, not only the ticket's lifetime. */
  tokenId?: string;
  permission?: "read" | "write";
}
