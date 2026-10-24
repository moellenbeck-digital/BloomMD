import { describe, expect, test } from "bun:test";
import * as Y from "yjs";
import { Awareness, encodeAwarenessUpdate } from "y-protocols/awareness";
import * as syncProtocol from "y-protocols/sync";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";
import { documentToYDoc, yDocToDocument, parseFile } from "@bloommd/core";
import { sendSyncStep1, handleSyncMessage, broadcastUpdate, broadcastAwarenessMessage, isReadOnlyMessageAllowed } from "./sync-handler";
import type { SyncRoom, WebSocketData } from "./types";

const SAMPLE_MD = `---
title: Test
id: "abc123"
created: "2026-04-01T00:00:00Z"
updated: "2026-04-01T00:00:00Z"
---

# Test

Root content.

## Child A

Content A.

## Child B

Content B.
`;

function createMockWs(sentMessages: Uint8Array[]) {
  return {
    sendBinary(data: Uint8Array) {
      sentMessages.push(data);
    },
    readyState: 1,
    data: { roomName: "test.md" },
  } as unknown as import("bun").ServerWebSocket<WebSocketData>;
}

function serverAwareness(yDoc: Y.Doc): Awareness {
  const awareness = new Awareness(yDoc);
  awareness.setLocalState(null);
  return awareness;
}

function createRoom(yDoc: Y.Doc): SyncRoom {
  return {
    key: "test.md",
    filename: "test.md",
    yDoc,
    clients: new Set(),
    awareness: serverAwareness(yDoc),
    awarenessClients: new Map(),
    persistTimer: null,
    persistenceTimeoutTimer: null,
    destroyTimer: null,
    isPersisting: false,
    revision: 0,
    persistenceOperation: null,
    lastPersistError: null,
  };
}

describe("sendSyncStep1", () => {
  test("sends a valid sync step 1 message", () => {
    const yDoc = new Y.Doc();
    const sent: Uint8Array[] = [];
    const ws = createMockWs(sent);

    sendSyncStep1(yDoc, ws);

    expect(sent).toHaveLength(1);
    const decoder = decoding.createDecoder(sent[0]!);
    const msgType = decoding.readVarUint(decoder);
    expect(msgType).toBe(0); // MSG_SYNC
  });
});

describe("read-only sync messages", () => {
  test("allows state requests and awareness but rejects document updates", () => {
    const doc = new Y.Doc();

    const step1 = encoding.createEncoder();
    encoding.writeVarUint(step1, 0);
    syncProtocol.writeSyncStep1(step1, doc);
    expect(isReadOnlyMessageAllowed(encoding.toUint8Array(step1))).toBe(true);

    const update = encoding.createEncoder();
    encoding.writeVarUint(update, 0);
    syncProtocol.writeUpdate(update, Y.encodeStateAsUpdate(doc));
    expect(isReadOnlyMessageAllowed(encoding.toUint8Array(update))).toBe(false);

    const awareness = encoding.createEncoder();
    encoding.writeVarUint(awareness, 1);
    encoding.writeVarUint8Array(awareness, new Uint8Array([1]));
    expect(isReadOnlyMessageAllowed(encoding.toUint8Array(awareness))).toBe(true);
  });
});

describe("handleSyncMessage", () => {
  test("syncs two Y.Docs via protocol messages", () => {
    // Create server doc with content
    const doc = parseFile("test.md", SAMPLE_MD);
    const serverDoc = documentToYDoc(doc);

    // Create empty client doc
    const clientDoc = new Y.Doc();

    // Step 1: Server sends SyncStep1 to client
    const serverStep1Encoder = encoding.createEncoder();
    encoding.writeVarUint(serverStep1Encoder, 0); // MSG_SYNC
    syncProtocol.writeSyncStep1(serverStep1Encoder, serverDoc);
    const serverStep1 = encoding.toUint8Array(serverStep1Encoder);

    // Client processes server's SyncStep1 and generates response
    const clientDecoder = decoding.createDecoder(serverStep1);
    decoding.readVarUint(clientDecoder); // skip MSG_SYNC
    const clientEncoder = encoding.createEncoder();
    syncProtocol.readSyncMessage(clientDecoder, clientEncoder, clientDoc, null);

    // Client also sends its own SyncStep1
    const clientStep1Encoder = encoding.createEncoder();
    encoding.writeVarUint(clientStep1Encoder, 0); // MSG_SYNC
    syncProtocol.writeSyncStep1(clientStep1Encoder, clientDoc);
    const clientStep1 = encoding.toUint8Array(clientStep1Encoder);

    // Send client's SyncStep2 to server via handleSyncMessage
    if (encoding.length(clientEncoder) > 0) {
      const wrappedEncoder = encoding.createEncoder();
      encoding.writeVarUint(wrappedEncoder, 0); // MSG_SYNC
      syncProtocol.writeSyncStep2(wrappedEncoder, clientDoc);
      const wrappedMessage = encoding.toUint8Array(wrappedEncoder);

      const serverSent: Uint8Array[] = [];
      const ws = createMockWs(serverSent);
      handleSyncMessage(serverDoc, wrappedMessage, ws);
    }

    // Server processes client's SyncStep1
    const serverSent2: Uint8Array[] = [];
    const ws2 = createMockWs(serverSent2);
    handleSyncMessage(serverDoc, clientStep1, ws2);

    // Apply server's SyncStep2 to client
    for (const msg of serverSent2) {
      const decoder = decoding.createDecoder(msg);
      decoding.readVarUint(decoder); // skip MSG_SYNC
      const encoder = encoding.createEncoder();
      syncProtocol.readSyncMessage(decoder, encoder, clientDoc, null);
    }

    // Both docs should now have the same content
    const serverResult = yDocToDocument(serverDoc);
    const clientResult = yDocToDocument(clientDoc);

    expect(clientResult.nodes.size).toBe(serverResult.nodes.size);
    expect(clientResult.rootId).toBe(serverResult.rootId);

    for (const [id, node] of serverResult.nodes) {
      const clientNode = clientResult.nodes.get(id);
      expect(clientNode).toBeDefined();
      expect(clientNode!.title).toBe(node.title);
      expect(clientNode!.content).toBe(node.content);
    }

    serverDoc.destroy();
    clientDoc.destroy();
  });
});

describe("broadcastUpdate", () => {
  test("sends update to all clients except sender", () => {
    const yDoc = new Y.Doc();
    const room = createRoom(yDoc);

    const sent1: Uint8Array[] = [];
    const sent2: Uint8Array[] = [];
    const sent3: Uint8Array[] = [];
    const ws1 = createMockWs(sent1);
    const ws2 = createMockWs(sent2);
    const ws3 = createMockWs(sent3);

    room.clients.add(ws1);
    room.clients.add(ws2);
    room.clients.add(ws3);

    // Create a dummy update
    const update = Y.encodeStateAsUpdate(yDoc);
    broadcastUpdate(update, room, ws1); // ws1 is sender

    expect(sent1).toHaveLength(0); // sender excluded
    expect(sent2).toHaveLength(1);
    expect(sent3).toHaveLength(1);

    yDoc.destroy();
  });

  test("sends to all clients when sender is null", () => {
    const yDoc = new Y.Doc();
    const room = createRoom(yDoc);

    const sent1: Uint8Array[] = [];
    const sent2: Uint8Array[] = [];
    const ws1 = createMockWs(sent1);
    const ws2 = createMockWs(sent2);

    room.clients.add(ws1);
    room.clients.add(ws2);

    const update = Y.encodeStateAsUpdate(yDoc);
    broadcastUpdate(update, room, null);

    expect(sent1).toHaveLength(1);
    expect(sent2).toHaveLength(1);

    yDoc.destroy();
  });
});

describe("broadcastAwarenessMessage", () => {
  test("relays awareness update to all clients except sender", () => {
    const yDoc = new Y.Doc();
    const room = createRoom(yDoc);

    const sent1: Uint8Array[] = [];
    const sent2: Uint8Array[] = [];
    const sent3: Uint8Array[] = [];
    const ws1 = createMockWs(sent1);
    const ws2 = createMockWs(sent2);
    const ws3 = createMockWs(sent3);

    room.clients.add(ws1);
    room.clients.add(ws2);
    room.clients.add(ws3);

    const dummyUpdate = new Uint8Array([1, 2, 3, 4]);
    broadcastAwarenessMessage(dummyUpdate, room, ws1);

    expect(sent1).toHaveLength(0); // sender excluded
    expect(sent2).toHaveLength(1);
    expect(sent3).toHaveLength(1);

    // Verify message starts with MSG_AWARENESS=1
    const decoder = decoding.createDecoder(sent2[0]!);
    const msgType = decoding.readVarUint(decoder);
    expect(msgType).toBe(1); // MSG_AWARENESS

    yDoc.destroy();
  });
});

describe("handleSyncMessage with awareness", () => {
  test("routes MSG_AWARENESS to broadcastAwarenessMessage", () => {
    const yDoc = new Y.Doc();
    const room = createRoom(yDoc);

    const senderSent: Uint8Array[] = [];
    const otherSent: Uint8Array[] = [];
    const sender = createMockWs(senderSent);
    const other = createMockWs(otherSent);

    room.clients.add(sender);
    room.clients.add(other);

    // A real client update: a separate peer with its own client id, encoded like the browser does.
    const peerDoc = new Y.Doc();
    const clientAwareness = new Awareness(peerDoc);
    clientAwareness.setLocalState({ name: "Peer", color: "#FF6B35", selectedNodeId: null });
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, 1); // MSG_AWARENESS
    encoding.writeVarUint8Array(encoder, encodeAwarenessUpdate(clientAwareness, [peerDoc.clientID]));
    const message = encoding.toUint8Array(encoder);

    handleSyncMessage(yDoc, message, sender, room);

    expect(senderSent).toHaveLength(0); // sender doesn't get it back
    expect(otherSent).toHaveLength(1); // other client receives it
    // The room mirrors presence so a later joiner sees this client immediately.
    expect(room.awareness.getStates().has(peerDoc.clientID)).toBe(true);

    clientAwareness.destroy();
    peerDoc.destroy();
    yDoc.destroy();
  });

  test("drops a malformed awareness update instead of relaying it", () => {
    const yDoc = new Y.Doc();
    const room = createRoom(yDoc);
    const otherSent: Uint8Array[] = [];
    const sender = createMockWs([]);
    const other = createMockWs(otherSent);
    room.clients.add(sender);
    room.clients.add(other);

    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, 1);
    encoding.writeVarUint8Array(encoder, new Uint8Array([10, 20, 30]));

    expect(() => handleSyncMessage(yDoc, encoding.toUint8Array(encoder), sender, room)).not.toThrow();
    expect(otherSent).toHaveLength(0);

    yDoc.destroy();
  });
});
