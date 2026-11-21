import type * as Y from "yjs";
import type { ServerWebSocket } from "bun";
import * as syncProtocol from "y-protocols/sync";
import { applyAwarenessUpdate, encodeAwarenessUpdate, removeAwarenessStates } from "y-protocols/awareness";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";
import type { SyncRoom, WebSocketData } from "./types";
import type { SyncTelemetry } from "./observability";
import { repairHandshake, snapshotNodes } from "./handshake-guard";
import { handleDeviceMessage, handleReconcileMessage, MSG_DEVICE, MSG_RECONCILE, releaseDevice } from "./offline-merge";

const MSG_SYNC = 0;
const MSG_AWARENESS = 1;
const SYNC_STEP_1 = 0;

export function isReadOnlyMessageAllowed(message: Uint8Array) {
  try {
    const decoder = decoding.createDecoder(message);
    const messageType = decoding.readVarUint(decoder);
    if (messageType === MSG_AWARENESS) return true;
    if (messageType !== MSG_SYNC) return false;
    return decoding.readVarUint(decoder) === SYNC_STEP_1;
  } catch {
    return false;
  }
}

export function sendSyncStep1(
  yDoc: Y.Doc,
  ws: ServerWebSocket<WebSocketData>,
): void {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MSG_SYNC);
  syncProtocol.writeSyncStep1(encoder, yDoc);
  ws.sendBinary(encoding.toUint8Array(encoder));
}

export function handleSyncMessage(
  yDoc: Y.Doc,
  message: Uint8Array,
  ws: ServerWebSocket<WebSocketData>,
  room?: SyncRoom,
  telemetry?: SyncTelemetry,
  correlationId?: string,
): void {
  const decoder = decoding.createDecoder(message);
  const messageType = decoding.readVarUint(decoder);

  if (messageType === MSG_SYNC) {
    // A handshake answer of a connection that sent no offline reconcile may not change a node.
    const guardsHandshake =
      Boolean(room) &&
      decoding.peekVarUint(decoder) === syncProtocol.messageYjsSyncStep2 &&
      !room!.offline?.reconciled?.has(ws);
    const nodesBefore = guardsHandshake ? snapshotNodes(yDoc) : null;
    const authorsBefore = guardsHandshake && room!.offline ? new Map(room!.offline.authors) : null;
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MSG_SYNC);
    syncProtocol.readSyncMessage(decoder, encoder, yDoc, ws);
    if (nodesBefore) {
      const repaired = repairHandshake(yDoc, nodesBefore);
      if (repaired.length > 0) {
        // The answer was not an edit, so the device that sent it is not the author of what it touched.
        for (const id of repaired) {
          const previous = authorsBefore?.get(id);
          if (previous) room!.offline!.authors.set(id, previous);
          else room!.offline?.authors.delete(id);
        }
        telemetry?.event({ operation: "sync.handshake.repair", outcome: "success", roomKey: room!.key, correlationId });
      }
    }

    if (encoding.length(encoder) > 1) {
      ws.sendBinary(encoding.toUint8Array(encoder));
    }
  } else if (messageType === MSG_DEVICE && room) {
    try {
      handleDeviceMessage(room, ws, decoder);
    } catch {
      telemetry?.increment("sync_messages_dropped_total");
    }
  } else if (messageType === MSG_RECONCILE && room) {
    handleReconcileMessage(room, ws, decoder, telemetry, correlationId);
  } else if (messageType === MSG_AWARENESS && room) {
    const update = decoding.readVarUint8Array(decoder);
    // Mirror into the room state first so a later joiner sees this client without waiting for its
    // next move, then relay the delta to everyone already connected.
    try {
      // Ownership is attributed by the room's awareness update listener, keyed on this connection.
      applyAwarenessUpdate(room.awareness, update, ws);
    } catch (error) {
      // A malformed presence update must not take down the room or reach the other clients.
      telemetry?.increment("sync_messages_dropped_total");
      telemetry?.event({ operation: "awareness.update", outcome: "dropped", roomKey: room.key, correlationId, error });
      return;
    }
    broadcastAwarenessMessage(update, room, ws);
  }
}

export function broadcastUpdate(
  update: Uint8Array,
  room: SyncRoom,
  sender: ServerWebSocket<WebSocketData> | null,
): void {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MSG_SYNC);
  syncProtocol.writeUpdate(encoder, update);
  const message = encoding.toUint8Array(encoder);

  for (const client of room.clients) {
    if (client !== sender) {
      client.sendBinary(message);
    }
  }
}

export function broadcastAwarenessMessage(
  awarenessUpdate: Uint8Array,
  room: SyncRoom,
  sender: ServerWebSocket<WebSocketData>,
): void {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MSG_AWARENESS);
  encoding.writeVarUint8Array(encoder, awarenessUpdate);
  const message = encoding.toUint8Array(encoder);

  for (const client of room.clients) {
    if (client !== sender) {
      client.sendBinary(message);
    }
  }
}

/** Sends the full room presence to a client that just joined. */
export function sendAwarenessStates(room: SyncRoom, ws: ServerWebSocket<WebSocketData>): void {
  const clientIds = [...room.awareness.getStates().keys()];
  if (clientIds.length === 0) return;
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MSG_AWARENESS);
  encoding.writeVarUint8Array(encoder, encodeAwarenessUpdate(room.awareness, clientIds));
  ws.sendBinary(encoding.toUint8Array(encoder));
}

/** Drops the presence entries a disconnecting client owned and tells the remaining clients. */
export function releaseAwarenessClients(room: SyncRoom, ws: ServerWebSocket<WebSocketData>): void {
  releaseDevice(room, ws);
  const owned = room.awarenessClients.get(ws);
  room.awarenessClients.delete(ws);
  if (!owned || owned.size === 0) return;
  removeAwarenessStates(room.awareness, [...owned], "server");
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MSG_AWARENESS);
  encoding.writeVarUint8Array(encoder, encodeAwarenessUpdate(room.awareness, [...owned]));
  const message = encoding.toUint8Array(encoder);
  for (const client of room.clients) {
    if (client !== ws) client.sendBinary(message);
  }
}
