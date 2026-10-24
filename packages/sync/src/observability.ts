import { createHmac, randomUUID } from "node:crypto";

export type SyncMetricName =
  | "sync_active_rooms"
  | "sync_active_clients"
  | "sync_degraded_rooms"
  | "sync_room_operations_in_flight"
  | "sync_pending_persistence_rooms"
  | "sync_messages_total"
  | "sync_messages_dropped_total"
  | "sync_persistence_errors_total"
  | "sync_persistence_retries_total"
  | "sync_persistence_recoveries_total"
  | "sync_room_flush_errors_total";

export type SyncHistogramName =
  | "sync_broadcast_duration_ms"
  | "sync_message_duration_ms"
  | "sync_persistence_duration_ms"
  | "sync_room_flush_duration_ms";

export interface SyncTelemetryEvent {
  operation: string;
  outcome: "started" | "success" | "error" | "dropped" | "retry" | "recovered";
  durationMs?: number;
  retry?: number;
  roomKey?: string;
  correlationId?: string;
  error?: unknown;
}

export interface SyncTelemetrySnapshot {
  counters: Record<string, number>;
  gauges: Record<string, number>;
  histograms: Record<string, { count: number; sum: number }>;
}

export interface SyncTelemetry {
  correlationId(): string;
  event(event: SyncTelemetryEvent): void;
  increment(name: SyncMetricName, value?: number): void;
  setGauge(name: Extract<SyncMetricName, `sync_active_${string}` | "sync_degraded_rooms" | "sync_room_operations_in_flight" | "sync_pending_persistence_rooms">, value: number): void;
  observe(name: SyncHistogramName, durationMs: number): void;
  snapshot(): SyncTelemetrySnapshot;
  prometheus(): string;
}

export interface SyncTelemetryOptions {
  /** Test hook. Production logs one JSON object per technical event to stdout. */
  write?: (line: string) => void;
  /** Process-local HMAC key. It is never logged or returned by the metrics endpoint. */
  contextKey?: string;
  now?: () => number;
}

const metricHelp: Record<SyncMetricName, string> = {
  sync_active_rooms: "Currently loaded sync rooms.",
  sync_active_clients: "Currently connected sync clients.",
  sync_degraded_rooms: "Currently degraded rooms with an unconfirmed persistence error.",
  sync_room_operations_in_flight: "Currently running room persistence operations.",
  sync_pending_persistence_rooms: "Rooms with one debounced persistence revision waiting to run.",
  sync_messages_total: "Processed WebSocket sync messages.",
  sync_messages_dropped_total: "Dropped or rejected WebSocket sync messages.",
  sync_persistence_errors_total: "Persistence operations that ended in an error.",
  sync_persistence_retries_total: "Safe persistence retries attempted.",
  sync_persistence_recoveries_total: "Persistence operations recovered after a prior error.",
  sync_room_flush_errors_total: "Final room flushes that failed or timed out.",
};

const histogramHelp: Record<SyncHistogramName, string> = {
  sync_broadcast_duration_ms: "Duration of Yjs update broadcasts in milliseconds.",
  sync_message_duration_ms: "Duration of WebSocket message authorization and processing in milliseconds.",
  sync_persistence_duration_ms: "Duration of persistence attempts in milliseconds.",
  sync_room_flush_duration_ms: "Duration of room flushes during shutdown in milliseconds.",
};

const safeErrorClasses = new Set([
  "Error",
  "TypeError",
  "RangeError",
  "SyntaxError",
  "SyncRetryablePersistenceError",
  "SyncPersistenceCommitUnknownError",
  "SyncPersistenceTimeoutError",
  "SyncPersistenceAuthorizationError",
  "SyncPersistenceValidationError",
  "SyncPersistenceCorruptionError",
  "SyncDocumentVersionConflictError",
  "SyncRoomCapacityError",
  "SyncRoomBusyError",
  "SyncRoomShutdownTimeoutError",
  "SyncServerDrainingError",
  "SyncNodeConflictError",
]);

function safeErrorClass(error: unknown): string | undefined {
  if (!(error instanceof Error)) return error === undefined ? undefined : "UnknownError";
  return safeErrorClasses.has(error.name) ? error.name : "UnknownError";
}

function finiteDuration(value: number): number {
  return Number.isFinite(value) && value >= 0 ? Math.round(value * 1000) / 1000 : 0;
}

/**
 * Server-only structured telemetry. It intentionally accepts no user, filename, Markdown, token
 * or request payload fields. A process-local HMAC makes a room traceable inside operations while
 * keeping the source room identifier out of logs and metrics.
 */
export function createSyncTelemetry(options: SyncTelemetryOptions = {}): SyncTelemetry {
  const write = options.write ?? ((line: string) => console.log(line));
  const contextKey = options.contextKey ?? randomUUID();
  const now = options.now ?? Date.now;
  const counters = new Map<string, number>();
  const gauges = new Map<string, number>();
  const histograms = new Map<string, { count: number; sum: number }>();

  function roomContext(roomKey: string | undefined): string | undefined {
    if (!roomKey) return undefined;
    return createHmac("sha256", contextKey).update(roomKey).digest("hex").slice(0, 16);
  }

  function event(input: SyncTelemetryEvent): void {
    const output = {
      timestamp: new Date(now()).toISOString(),
      component: "sync",
      operation: input.operation,
      outcome: input.outcome,
      ...(input.durationMs === undefined ? {} : { durationMs: finiteDuration(input.durationMs) }),
      ...(input.retry === undefined ? {} : { retry: input.retry }),
      ...(input.roomKey === undefined ? {} : { room: roomContext(input.roomKey) }),
      ...(input.correlationId === undefined ? {} : { correlationId: input.correlationId }),
      ...(safeErrorClass(input.error) === undefined ? {} : { errorClass: safeErrorClass(input.error) }),
    };
    write(JSON.stringify(output));
  }

  function increment(name: SyncMetricName, value = 1): void {
    counters.set(name, (counters.get(name) ?? 0) + value);
  }

  function setGauge(name: Extract<SyncMetricName, `sync_active_${string}` | "sync_degraded_rooms" | "sync_room_operations_in_flight" | "sync_pending_persistence_rooms">, value: number): void {
    gauges.set(name, Math.max(0, Math.round(value)));
  }

  function observe(name: SyncHistogramName, durationMs: number): void {
    const current = histograms.get(name) ?? { count: 0, sum: 0 };
    current.count += 1;
    current.sum += finiteDuration(durationMs);
    histograms.set(name, current);
  }

  function snapshot(): SyncTelemetrySnapshot {
    return {
      counters: Object.fromEntries(counters),
      gauges: Object.fromEntries(gauges),
      histograms: Object.fromEntries(histograms),
    };
  }

  function prometheus(): string {
    const lines: string[] = [];
    for (const name of Object.keys(metricHelp) as SyncMetricName[]) {
      lines.push(`# HELP ${name} ${metricHelp[name]}`, `# TYPE ${name} ${name.startsWith("sync_active_") || name === "sync_degraded_rooms" || name === "sync_room_operations_in_flight" || name === "sync_pending_persistence_rooms" ? "gauge" : "counter"}`, `${name} ${name in Object.fromEntries(gauges) ? gauges.get(name) ?? 0 : counters.get(name) ?? 0}`);
    }
    for (const name of Object.keys(histogramHelp) as SyncHistogramName[]) {
      const value = histograms.get(name) ?? { count: 0, sum: 0 };
      lines.push(`# HELP ${name} ${histogramHelp[name]}`, `# TYPE ${name} summary`, `${name}_count ${value.count}`, `${name}_sum ${value.sum}`);
    }
    return `${lines.join("\n")}\n`;
  }

  return { correlationId: randomUUID, event, increment, setGauge, observe, snapshot, prometheus };
}
