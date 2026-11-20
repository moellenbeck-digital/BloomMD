import type * as Y from "yjs";
import type { ServerWebSocket } from "bun";
import * as decoding from "lib0/decoding";
import { planOfflineMerge, serializeToMarkdown, UNKNOWN_DEVICE } from "@bloommd/core";
import type { OfflineRoomState, SyncRoom, WebSocketData } from "./types";
import type { SyncTelemetry } from "./observability";

/** Client announces the label of its device (varString), once per connection. */
export const MSG_DEVICE = 2;
/** Client brings its offline state before the normal sync: device, base, full local state. */
export const MSG_RECONCILE = 3;

const MAX_DEVICE_LENGTH = 40;

/** A device label ends up in a node title, so it may not contain the frame characters. */
export function sanitizeDeviceLabel(value: string): string {
  const cleaned = value.replace(/[()\u0000-\u001f]/g, "").replace(/\s+/g, " ").trim().slice(0, MAX_DEVICE_LENGTH).trim();
  return cleaned || UNKNOWN_DEVICE;
}

export function offlineState(room: SyncRoom): OfflineRoomState {
  room.offline ??= { devices: new Map(), authors: new Map(), snapshots: null, now: () => Date.now() };
  return room.offline;
}

export function handleDeviceMessage(room: SyncRoom, ws: ServerWebSocket<WebSocketData>, decoder: decoding.Decoder): void {
  offlineState(room).devices.set(ws, sanitizeDeviceLabel(decoding.readVarString(decoder)));
}

export function releaseDevice(room: SyncRoom, ws: ServerWebSocket<WebSocketData>): void {
  room.offline?.devices.delete(ws);
}

/**
 * Records who last changed a node's title or content. Called for transactions that a client sent;
 * the result names the device of a conflict copy.
 */
export function trackNodeAuthors(room: SyncRoom, yDoc: Y.Doc): void {
  const record = (events: Array<Y.YEvent<any>>, origin: unknown) => {
    if (!origin || typeof origin !== "object" || !("readyState" in origin)) return;
    const state = offlineState(room);
    const device = state.devices.get(origin as ServerWebSocket<WebSocketData>);
    if (!device) return;
    for (const event of events) {
      if (event.path[1] === "children") continue;
      const ids = event.path.length > 0 ? [event.path[0]] : [...((event as { keysChanged?: Set<string> }).keysChanged ?? [])];
      for (const id of ids) {
        if (typeof id === "string") state.authors.set(id, { device, at: state.now() });
      }
    }
  };
  yDoc.getMap("nodes").observeDeep((events, transaction) => record(events, transaction.origin));
  yDoc.getMap("nodeContents").observeDeep((events, transaction) => record(events, transaction.origin));
}

/**
 * Merges the offline state of one client into the room (rule A): snapshot of both starting versions
 * first, then the CRDT merge with the conflict copies. Repeated delivery changes nothing.
 * A message that cannot be read or merged falls back to the ordinary sync that follows it.
 */
export function handleReconcileMessage(
  room: SyncRoom,
  ws: ServerWebSocket<WebSocketData>,
  decoder: decoding.Decoder,
  telemetry?: SyncTelemetry,
  correlationId?: string,
): void {
  const state = offlineState(room);
  try {
    const device = sanitizeDeviceLabel(decoding.readVarString(decoder));
    state.devices.set(ws, device);
    const base = decoding.readVarUint8Array(decoder);
    const local = decoding.readVarUint8Array(decoder);
    const at = state.now();
    const plan = planOfflineMerge(room.yDoc, {
      base: base.length > 0 ? base : null,
      local,
      device,
      at,
      authors: state.authors,
    });
    if (!plan.changed) return;
    if (base.length > 0 && state.snapshots) {
      try {
        state.snapshots.save({
          roomKey: room.key,
          filename: room.filename,
          at,
          device,
          conflictNodeIds: plan.conflicts.map((conflict) => conflict.nodeId),
          serverMarkdown: serializeToMarkdown(plan.serverDocument),
          clientMarkdown: serializeToMarkdown(plan.localDocument),
        });
      } catch (error) {
        // The merge must not be lost because the snapshot could not be written; make it visible.
        telemetry?.event({ operation: "offline.snapshot", outcome: "error", roomKey: room.key, correlationId, error });
      }
    }
    const { conflictCopyIds } = plan.commit(ws);
    telemetry?.event({
      operation: conflictCopyIds.length > 0 ? "offline.merge.conflict" : "offline.merge",
      outcome: "success",
      roomKey: room.key,
      correlationId,
    });
  } catch (error) {
    telemetry?.increment("sync_messages_dropped_total");
    telemetry?.event({ operation: "offline.merge", outcome: "error", roomKey: room.key, correlationId, error });
  }
}
