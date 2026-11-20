import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import * as Y from "yjs";
import { documentToYDoc, listConflictCopies, parseFile, planOfflineMerge, yAddNode, yDocToDocument, yRenameNode } from "@bloommd/core";
import { createMemoryOfflineStorage } from "../sync/offline-queue";
import { setOfflineStorageForTests, useMindMapStore } from "./useMindMapStore";

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
  close() {
    this.readyState = FakeWebSocket.CLOSED;
  }
  addEventListener(_type: string, listener: () => void) {
    listener();
  }
}

const globals = globalThis as unknown as { WebSocket: unknown };
let originalWebSocket: unknown;
beforeEach(() => {
  originalWebSocket = globals.WebSocket;
  globals.WebSocket = FakeWebSocket;
  FakeWebSocket.instances = [];
});
afterEach(async () => {
  await useMindMapStore.getState().disconnectSync();
  useMindMapStore.getState().setDocument(null);
  setOfflineStorageForTests(undefined);
  globals.WebSocket = originalWebSocket;
});

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));
const titles = () => [...(useMindMapStore.getState().document?.nodes.values() ?? [])].map((node) => node.title);

function serverAndQueue() {
  const server = documentToYDoc(parseFile("offline.md", MARKDOWN));
  const base = Y.encodeStateAsUpdate(server);
  const local = new Y.Doc();
  Y.applyUpdate(local, base);
  yRenameNode(local, "alpha", "Alpha-A");
  yAddNode(local, "root", "Delta");
  return { server, base, local };
}

describe("store: offline queue restore", () => {
  test("queued offline edits replace the freshly loaded document and connect with the base", async () => {
    const { base, local } = serverAndQueue();
    const storage = createMemoryOfflineStorage();
    await storage.save("local:offline-1", { state: Y.encodeStateAsUpdate(local), base, savedAt: Date.now() });
    setOfflineStorageForTests(storage);

    // The page loads the file from the server as usual, then connects.
    useMindMapStore.getState().setDocument(parseFile("offline.md", MARKDOWN));
    expect(titles()).toContain("Alpha");
    useMindMapStore.getState().connectSyncUrl("ws://test/ws/offline.md");
    await settle();

    expect(titles()).toContain("Alpha-A");
    expect(titles()).toContain("Delta");
    expect(useMindMapStore.getState().offlinePending).toBe(true);
    expect(useMindMapStore.getState().syncProvider).not.toBeNull();
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  test("without queued edits the loaded document stays", async () => {
    const { base } = serverAndQueue();
    const storage = createMemoryOfflineStorage();
    await storage.save("local:offline-1", { state: base, base, savedAt: Date.now() });
    setOfflineStorageForTests(storage);
    useMindMapStore.getState().setDocument(parseFile("offline.md", MARKDOWN));
    const before = useMindMapStore.getState().yDoc;
    useMindMapStore.getState().connectSyncUrl("ws://test/ws/offline.md");
    await settle();
    expect(useMindMapStore.getState().yDoc).toBe(before);
    expect(useMindMapStore.getState().offlinePending).toBe(false);
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  test("a disconnect while the queue loads cancels the connect", async () => {
    setOfflineStorageForTests(createMemoryOfflineStorage());
    useMindMapStore.getState().setDocument(parseFile("offline.md", MARKDOWN));
    useMindMapStore.getState().connectSyncUrl("ws://test/ws/offline.md");
    await useMindMapStore.getState().disconnectSync();
    await settle();
    expect(FakeWebSocket.instances).toHaveLength(0);
  });

  test("resolving a conflict copy adopts or discards it for the open document", async () => {
    const { server, base, local } = serverAndQueue();
    const other = new Y.Doc();
    Y.applyUpdate(other, base);
    yRenameNode(other, "alpha", "Alpha-B");
    planOfflineMerge(server, { base, local: Y.encodeStateAsUpdate(local), device: "Gerät A", at: Date.now() }).commit();
    planOfflineMerge(server, { base, local: Y.encodeStateAsUpdate(other), device: "Gerät B", at: Date.now() }).commit();
    useMindMapStore.getState().setDocument(yDocToDocument(server), server);

    const [copy] = listConflictCopies(useMindMapStore.getState().document!);
    expect(copy).toMatchObject({ title: "Alpha-A", originalId: "alpha" });
    useMindMapStore.getState().resolveConflict(copy!.id, "adopt");
    const document = useMindMapStore.getState().document!;
    expect(document.nodes.get("alpha")!.title).toBe("Alpha-A");
    expect(listConflictCopies(document)).toEqual([]);
  });
});
