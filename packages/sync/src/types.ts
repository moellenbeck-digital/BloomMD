import type * as Y from "yjs";
import type { Awareness } from "y-protocols/awareness";
import type { ServerWebSocket } from "bun";
import type { SyncTelemetry } from "./observability";
import type { ConflictAuthor } from "@bloommd/core";
import type { SnapshotStore } from "./snapshots";

export interface WebSocketData {
  roomName: string;
}

/** State for merging a client's offline changes (#261); created on first use when a room lacks it. */
export interface OfflineRoomState {
  /** Device label each connection announced. */
  devices: Map<ServerWebSocket<WebSocketData>, string>;
  /** Who last changed which node (memory only: a restarted server names the device "unbekannt"). */
  authors: Map<string, ConflictAuthor>;
  snapshots: SnapshotStore | null;
  /**
   * Puts the two starting versions of a merge with a conflict (server first, then device) into the
   * file's version history; none in cloud mode.
   */
  history?: ((filename: string, versions: readonly string[], at: number) => Promise<void>) | null;
  /** The history write of the latest merge; it never fails (an error is reported as telemetry). */
  historyPending?: Promise<void>;
  now: () => number;
  /** Connections that sent an offline reconcile (also a failed one); their ordinary sync is not held back. */
  reconciled?: WeakSet<object>;
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
  offline?: OfflineRoomState;
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
  /** Where pre-merge snapshots of offline merges go; none are taken when unset. */
  snapshotDir?: string;
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
  /**
   * First delay before a room whose debounced or final save failed tries again by itself; it
   * doubles per failure up to a minute. Defaults to 2000 ms.
   */
  persistenceRecoveryBaseMs?: number;
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
