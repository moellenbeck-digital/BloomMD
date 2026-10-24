import { resolve } from "node:path";
import { createRoomManager } from "./rooms";
import { createSyncServer } from "./server";
import { createDatabasePersistence } from "./persistence";
import { createSyncTelemetry } from "./observability";
import type { SyncServerConfig } from "./types";

const telemetry = createSyncTelemetry();

const config: SyncServerConfig = {
  baseDir: resolve(process.cwd(), process.env.BLOOMMD_DIR || "./data"),
  port: parseInt(process.env.SYNC_PORT || "4100", 10),
  persistDebounceMs: parseInt(process.env.SYNC_PERSIST_DEBOUNCE || "2500", 10),
  destroyDelayMs: parseInt(process.env.SYNC_DESTROY_DELAY || "30000", 10),
  apiKey: process.env.SYNC_API_KEY || undefined,
  syncSecret: process.env.BLOOMMD_SYNC_SECRET || undefined,
  databaseUrl: process.env.SYNC_DATABASE_URL || process.env.DATABASE_URL || undefined,
  allowedOrigins: process.env.SYNC_ALLOWED_ORIGINS?.split(",").map((origin) => origin.trim()).filter(Boolean),
  maxRooms: parseInt(process.env.SYNC_MAX_ROOMS || "500", 10),
  maxClientsPerRoom: parseInt(process.env.SYNC_MAX_CLIENTS_PER_ROOM || "100", 10),
  maxMessageBytes: parseInt(process.env.SYNC_MAX_MESSAGE_BYTES || String(1024 * 1024), 10),
  persistenceRetryMaxAttempts: parseInt(process.env.SYNC_PERSIST_RETRY_MAX_ATTEMPTS || "3", 10),
  persistenceRetryBaseMs: parseInt(process.env.SYNC_PERSIST_RETRY_BASE_MS || "100", 10),
  persistenceRetryMaxDelayMs: parseInt(process.env.SYNC_PERSIST_RETRY_MAX_DELAY_MS || "2000", 10),
  persistenceRetryMaxDurationMs: parseInt(process.env.SYNC_PERSIST_RETRY_MAX_DURATION_MS || "10000", 10),
  persistenceSaveTimeoutMs: parseInt(process.env.SYNC_PERSIST_SAVE_TIMEOUT_MS || "15000", 10),
  shutdownTimeoutMs: parseInt(process.env.SYNC_SHUTDOWN_TIMEOUT_MS || "20000", 10),
  telemetry,
};

if (config.databaseUrl && !config.syncSecret) {
  throw new Error("BLOOMMD_SYNC_SECRET is required when cloud sync uses a database.");
}
if (config.databaseUrl && (config.syncSecret?.length ?? 0) < 32) {
  throw new Error("BLOOMMD_SYNC_SECRET must contain at least 32 characters when cloud sync uses a database.");
}
if (config.databaseUrl && (!config.allowedOrigins || config.allowedOrigins.length === 0)) {
  throw new Error("SYNC_ALLOWED_ORIGINS is required when cloud sync uses a database.");
}
if (!Number.isSafeInteger(config.port) || config.port < 1 || config.port > 65_535) {
  throw new Error("SYNC_PORT must be a valid TCP port.");
}
for (const [name, value] of [
  ["SYNC_MAX_ROOMS", config.maxRooms],
  ["SYNC_MAX_CLIENTS_PER_ROOM", config.maxClientsPerRoom],
  ["SYNC_MAX_MESSAGE_BYTES", config.maxMessageBytes],
  ["SYNC_PERSIST_RETRY_MAX_ATTEMPTS", config.persistenceRetryMaxAttempts],
  ["SYNC_PERSIST_RETRY_BASE_MS", config.persistenceRetryBaseMs],
  ["SYNC_PERSIST_RETRY_MAX_DELAY_MS", config.persistenceRetryMaxDelayMs],
  ["SYNC_PERSIST_RETRY_MAX_DURATION_MS", config.persistenceRetryMaxDurationMs],
  ["SYNC_PERSIST_SAVE_TIMEOUT_MS", config.persistenceSaveTimeoutMs],
  ["SYNC_SHUTDOWN_TIMEOUT_MS", config.shutdownTimeoutMs],
] as const) {
  if (!Number.isSafeInteger(value) || value! < 1) throw new Error(`${name} must be a positive integer.`);
}

const persistence = config.databaseUrl ? createDatabasePersistence(config.databaseUrl) : undefined;
const roomManager = createRoomManager(config, persistence);
const { app, websocket, drain } = createSyncServer(roomManager, config);

telemetry.event({ operation: "server.start", outcome: "success" });

let shutdownStarted = false;

async function shutdown(signal: "SIGTERM" | "SIGINT"): Promise<void> {
  if (shutdownStarted) return;
  shutdownStarted = true;
  telemetry.event({ operation: `server.drain.${signal.toLowerCase()}`, outcome: "started" });
  const result = await drain();
  const failedRooms = [...result.rooms.failedRoomKeys, ...result.rooms.timedOutRoomKeys];
  if (failedRooms.length > 0) {
    telemetry.event({ operation: "server.drain", outcome: "error", error: new Error("SYNC_SHUTDOWN_UNCONFIRMED_FLUSH") });
    process.exit(1);
  } else {
    telemetry.event({ operation: "server.drain", outcome: "success" });
    process.exit(0);
  }
}

process.once("SIGTERM", () => { void shutdown("SIGTERM"); });
process.once("SIGINT", () => { void shutdown("SIGINT"); });

export default {
  port: config.port,
  fetch: app.fetch,
  websocket,
};
