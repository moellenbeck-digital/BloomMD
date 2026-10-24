export type SyncStatus = "disconnected" | "connecting" | "reconnecting" | "connected" | "failed";

export type SyncFailureKind =
  | "access-revoked"
  | "file-not-found"
  | "room-capacity"
  | "unauthorized"
  | "ticket-refresh-failed"
  | "reconnect-exhausted";

export interface SyncFailure {
  kind: SyncFailureKind;
  code?: number;
  reason?: string;
  attempts?: number;
}

/** Transaction origin for remote updates — excluded from UndoManager tracking */
export const SYNC_ORIGIN = "sync-remote" as const;

export const MSG_SYNC = 0;
export const MSG_AWARENESS = 1;

export interface AwarenessUserState {
  name: string;
  email?: string;
  color: string;
  selectedNodeId: string | null;
}

export interface AwarenessIdentity {
  name?: string | null;
  email?: string | null;
}

export const AWARENESS_COLORS = [
  "#2563EB", // blue
  "#059669", // emerald
  "#B45309", // amber
  "#DC2626", // red
  "#7C3AED", // violet
  "#DB2777", // pink
  "#0F766E", // teal
  "#C2410C", // orange
  "#0E7490", // cyan
  "#4338CA", // indigo
  "#A21CAF", // fuchsia
  "#4D7C0F", // lime
  "#BE123C", // rose
  "#0369A1", // sky
  "#6D28D9", // purple
  "#475569", // slate
] as const;
