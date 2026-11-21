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
 *
 * Only a real change counts. A client that connects (or reconnects) delivers its Yjs structures
 * again, which replaces a node's entry without changing its text; if that counted, the next
 * connection would take over the credit for everything and a conflict copy would name the wrong
 * device (#261).
 */
export function trackNodeAuthors(room: SyncRoom, yDoc: Y.Doc): void {
  const yNodes = yDoc.getMap<Y.Map<unknown>>("nodes");
  const yContents = yDoc.getMap<Y.Text>("nodeContents");
  const known = new Map<string, string>();
  const textOf = (id: string): string | null => {
    const node = yNodes.get(id);
    if (!node) return null;
    return JSON.stringify([node.get("title") ?? "", yContents.get(id)?.toString() ?? ""]);
  };
  for (const id of yNodes.keys()) known.set(id, textOf(id)!);

  const record = (events: Array<Y.YEvent<any>>, origin: unknown) => {
    const ids = new Set<string>();
    for (const event of events) {
      if (event.path[1] === "children") continue;
      const touched = event.path.length > 0 ? [event.path[0]] : [...((event as { keysChanged?: Set<string> }).keysChanged ?? [])];
      for (const id of touched) if (typeof id === "string") ids.add(id);
    }
    const changed: string[] = [];
    for (const id of ids) {
      const text = textOf(id);
      if (text === null) {
        known.delete(id);
        continue;
      }
      if (known.get(id) === text) continue;
      known.set(id, text);
      changed.push(id);
    }
    if (!origin || typeof origin !== "object" || !("readyState" in origin)) return;
    const state = offlineState(room);
    const device = state.devices.get(origin as ServerWebSocket<WebSocketData>);
    if (!device) return;
    for (const id of changed) state.authors.set(id, { device, at: state.now() });
  };
  yNodes.observeDeep((events, transaction) => record(events, transaction.origin));
  yContents.observeDeep((events, transaction) => record(events, transaction.origin));
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
  // Even a reconcile that fails below hands over to the ordinary sync that follows it.
  (state.reconciled ??= new WeakSet()).add(ws);
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
