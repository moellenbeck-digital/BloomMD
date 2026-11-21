import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import * as Y from "yjs";
import * as syncProtocol from "y-protocols/sync";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";
import { documentToYDoc, parseFile, planOfflineMerge, yDocToDocument, yRenameNode, yAddNode } from "@bloommd/core";
import { SyncProvider } from "./SyncProvider";
import { MSG_DEVICE, MSG_RECONCILE, MSG_SYNC } from "./types";
import {
  createIndexedDbOfflineStorage,
  createMemoryOfflineStorage,
  docFromRecord,
  hasPendingChanges,
  hasQueuedEdits,
  offlineKey,
  resolveDeviceLabel,
} from "./offline-queue";

const MARKDOWN = `---
title: Offline
id: offline-1
created: 2026-11-20
updated: 2026-11-20
---

# Wurzel <!-- bloommd:id=root -->

## Alpha <!-- bloommd:id=alpha -->

## Beta <!-- bloommd:id=beta -->

## Gamma <!-- bloommd:id=gamma -->
`;

class FakeWebSocket {
  static OPEN = 1;
  static CONNECTING = 0;
  static CLOSED = 3;
  static instances: FakeWebSocket[] = [];
  readyState = FakeWebSocket.CONNECTING;
  binaryType = "";
  sent: Uint8Array[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: ArrayBuffer }) => void) | null = null;
  onclose: ((event: { code: number; reason?: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public url: string) {
    FakeWebSocket.instances.push(this);
  }
  send(data: Uint8Array) {
    this.sent.push(data);
  }
  close(code = 1000, reason = "") {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.({ code, reason });
  }
  open() {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.();
  }
  deliver(bytes: Uint8Array) {
    this.onmessage?.({ data: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer });
  }
}

const globals = globalThis as unknown as { WebSocket: unknown };
let originalWebSocket: unknown;
beforeEach(() => {
  originalWebSocket = globals.WebSocket;
  globals.WebSocket = FakeWebSocket;
  FakeWebSocket.instances = [];
});
afterEach(() => {
  globals.WebSocket = originalWebSocket;
});
const latest = () => FakeWebSocket.instances[FakeWebSocket.instances.length - 1]!;

function messageType(bytes: Uint8Array): number {
  return decoding.readVarUint(decoding.createDecoder(bytes));
}

function serverStep2(server: Y.Doc, clientStateVector: Uint8Array): Uint8Array {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MSG_SYNC);
  syncProtocol.writeSyncStep2(encoder, server, clientStateVector);
  return encoding.toUint8Array(encoder);
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 15));

function seed() {
  const server = documentToYDoc(parseFile("offline.md", MARKDOWN));
  const doc = new Y.Doc();
  Y.applyUpdate(doc, Y.encodeStateAsUpdate(server));
  return { server, doc };
}

describe("offline queue provider", () => {
  test("announces the device first and sends no offline state while nothing is queued", async () => {
    const { doc } = seed();
    const storage = createMemoryOfflineStorage();
    const provider = new SyncProvider({ url: "ws://test", doc, offline: { key: "k", storage, device: "Gerät A" } });
    provider.connect();
    latest().open();
    const types = latest().sent.map(messageType);
    expect(types[0]).toBe(MSG_DEVICE);
    expect(types).not.toContain(MSG_RECONCILE);
    provider.destroy();
  });

  test("without the offline option nothing new is sent", () => {
    const provider = new SyncProvider({ url: "ws://test", doc: new Y.Doc() });
    provider.connect();
    latest().open();
    expect(latest().sent.map(messageType)).not.toContain(MSG_DEVICE);
    provider.destroy();
  });

  test("offline edits are saved with the base, survive a reload and are handed over first on reconnect", async () => {
    const { server, doc } = seed();
    const storage = createMemoryOfflineStorage();
    const pendingStates: boolean[] = [];
    const provider = new SyncProvider({
      url: "ws://test",
      doc,
      offline: { key: "k", storage, device: "Gerät A", saveDebounceMs: 1, onQueueChange: (pending) => pendingStates.push(pending) },
    });
    provider.connect();
    latest().open();
    // The server answers the handshake: from now on the local state counts as agreed.
    latest().deliver(serverStep2(server, Y.encodeStateVector(doc)));
    await settle();
    expect(storage.records.get("k")?.base).toBeTruthy();
    expect(hasQueuedEdits(storage.records.get("k")!)).toBe(false);

    // The connection drops; edits are made offline.
    latest().close(1006);
    yRenameNode(doc, "alpha", "Alpha-A");
    yAddNode(doc, "root", "Delta");
    await settle();
    const record = storage.records.get("k")!;
    expect(hasQueuedEdits(record)).toBe(true);
    expect(pendingStates.at(-1)).toBe(true);
    // The base did not move with the offline edits.
    expect(yDocToDocument(docFromRecord({ ...record, state: record.base! })).nodes.get("alpha")!.title).toBe("Alpha");
    expect(yDocToDocument(docFromRecord(record)).nodes.get("alpha")!.title).toBe("Alpha-A");
    provider.destroy();

    // A reload: a new provider on a document restored from the record reconnects.
    const restored = docFromRecord(record);
    const second = new SyncProvider({
      url: "ws://test",
      doc: restored,
      offline: { key: "k", storage, device: "Gerät A", base: record.base, saveDebounceMs: 1 },
    });
    second.connect();
    latest().open();
    const types = latest().sent.map(messageType);
    expect(types.slice(0, 2)).toEqual([MSG_DEVICE, MSG_RECONCILE]);
    // The reconcile message is what the server needs: base and full local state.
    const decoder = decoding.createDecoder(latest().sent[1]!);
    decoding.readVarUint(decoder);
    expect(decoding.readVarString(decoder)).toBe("Gerät A");
    const base = decoding.readVarUint8Array(decoder);
    const local = decoding.readVarUint8Array(decoder);
    const plan = planOfflineMerge(server, { base, local, device: "Gerät A", at: Date.now() });
    expect(plan.changed).toBe(true);
    expect(plan.conflicts).toEqual([]);
    plan.commit();
    expect(yDocToDocument(server).nodes.get("alpha")!.title).toBe("Alpha-A");
    // The ordinary handshake follows the offline state.
    expect(types[2]).toBe(MSG_SYNC);
    second.destroy();
  });

  test("a drop before the server answered the handshake keeps the edits queued", async () => {
    const { server, doc } = seed();
    const storage = createMemoryOfflineStorage();
    const provider = new SyncProvider({
      url: "ws://test",
      doc,
      reconnectBaseDelayMs: 1,
      offline: { key: "k", storage, device: "Gerät A", saveDebounceMs: 1 },
    });
    provider.connect();
    latest().open();
    latest().deliver(serverStep2(server, Y.encodeStateVector(doc)));
    latest().close(1006);
    yRenameNode(doc, "alpha", "Alpha-A");
    await settle();

    // The automatic reconnect opens; the handshake is not answered, the connection drops again.
    await new Promise((resolve) => setTimeout(resolve, 30));
    latest().open();
    expect(latest().sent.map(messageType)).toContain(MSG_RECONCILE);
    latest().close(1006);
    await settle();
    expect(hasQueuedEdits(storage.records.get("k")!)).toBe(true);
    provider.destroy();
  });

  test("a failing storage never breaks syncing", async () => {
    const { doc } = seed();
    const storage = {
      load: async () => null,
      save: async () => {
        throw new Error("quota");
      },
      clear: async () => undefined,
    };
    const provider = new SyncProvider({ url: "ws://test", doc, offline: { key: "k", storage, device: "Gerät A", saveDebounceMs: 1 } });
    provider.connect();
    latest().open();
    yRenameNode(doc, "alpha", "Alpha-A");
    await settle();
    expect(provider.getStatus()).toBe("connected");
    provider.destroy();
  });
});

describe("offline queue helpers", () => {
  test("pending changes need a base and a difference", () => {
    const { doc } = seed();
    const base = Y.encodeStateAsUpdate(doc);
    expect(hasPendingChanges(Y.encodeStateAsUpdate(doc), null)).toBe(false);
    expect(hasPendingChanges(Y.encodeStateAsUpdate(doc), base)).toBe(false);
    yRenameNode(doc, "alpha", "Alpha-A");
    expect(hasPendingChanges(Y.encodeStateAsUpdate(doc), base)).toBe(true);
  });

  test("the queue key separates workspaces", () => {
    expect(offlineKey({ workspaceId: "w1", documentId: "d1", filename: "a.md" })).toBe("w1:d1");
    expect(offlineKey({ filename: "a.md" })).toBe("local:a.md");
  });

  test("the device label is stable and can be set", () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => void values.set(key, value) };
    const generated = resolveDeviceLabel(storage);
    expect(generated).toMatch(/^Gerät /);
    expect(resolveDeviceLabel(storage)).toBe(generated);
    values.set("bloommd-device-label", "Gerät A");
    expect(resolveDeviceLabel(storage)).toBe("Gerät A");
  });

  test("no IndexedDB means no storage", () => {
    expect(createIndexedDbOfflineStorage(undefined)).toBeNull();
  });
});
