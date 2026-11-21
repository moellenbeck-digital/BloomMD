import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as Y from "yjs";
import { Awareness } from "y-protocols/awareness";
import * as encoding from "lib0/encoding";
import {
  documentToYDoc,
  listConflictCopies,
  parseFile,
  serializeToMarkdown,
  yDocToDocument,
  yRenameNode,
  yAddNode,
} from "@bloommd/core";
import { handleSyncMessage, isReadOnlyMessageAllowed, releaseAwarenessClients } from "./sync-handler";
import { MSG_DEVICE, MSG_RECONCILE, sanitizeDeviceLabel, trackNodeAuthors } from "./offline-merge";
import { createFileSnapshotStore, restoreSnapshot } from "./snapshots";
import type { SyncRoom, WebSocketData } from "./types";

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

type Ws = import("bun").ServerWebSocket<WebSocketData>;

function mockWs(sent: Uint8Array[] = []): Ws {
  return {
    sendBinary: (data: Uint8Array) => sent.push(data),
    readyState: 1,
    data: { roomName: "offline.md" },
  } as unknown as Ws;
}

function makeRoom(yDoc: Y.Doc, snapshots: ReturnType<typeof createFileSnapshotStore> | null, clock: { t: number }): SyncRoom {
  const awareness = new Awareness(yDoc);
  awareness.setLocalState(null);
  return {
    key: "offline.md",
    filename: "offline.md",
    yDoc,
    clients: new Set(),
    awareness,
    awarenessClients: new Map(),
    offline: { devices: new Map(), authors: new Map(), snapshots, now: () => clock.t },
    persistTimer: null,
    persistenceTimeoutTimer: null,
    destroyTimer: null,
    isPersisting: false,
    revision: 0,
    persistenceOperation: null,
    lastPersistError: null,
  };
}

function reconcileMessage(device: string, base: Uint8Array | null, local: Uint8Array): Uint8Array {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MSG_RECONCILE);
  encoding.writeVarString(encoder, device);
  encoding.writeVarUint8Array(encoder, base ?? new Uint8Array(0));
  encoding.writeVarUint8Array(encoder, local);
  return encoding.toUint8Array(encoder);
}

function deviceMessage(device: string): Uint8Array {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MSG_DEVICE);
  encoding.writeVarString(encoder, device);
  return encoding.toUint8Array(encoder);
}

function replica(server: Y.Doc): Y.Doc {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, Y.encodeStateAsUpdate(server));
  return doc;
}

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "bloommd-snapshots-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("offline merge on the server", () => {
  function scenario() {
    const server = documentToYDoc(parseFile("offline.md", MARKDOWN));
    const base = Y.encodeStateAsUpdate(server);
    const clock = { t: Date.UTC(2026, 10, 20, 16, 25) };
    const store = createFileSnapshotStore(join(dir, ".snapshots"));
    const room = makeRoom(server, store, clock);
    trackNodeAuthors(room, server);
    const wsA = mockWs();
    const wsB = mockWs();
    const a = replica(server);
    const b = replica(server);
    yRenameNode(a, "alpha", "Alpha-A");
    yAddNode(a, "root", "Delta");
    yRenameNode(b, "alpha", "Alpha-B");
    return { server, base, clock, store, room, wsA, wsB, a, b };
  }

  test("A then B: conflict copy, Delta, snapshots with both starting versions", () => {
    const { server, base, clock, store, room, wsA, wsB, a, b } = scenario();

    handleSyncMessage(server, reconcileMessage("Gerät A", base, Y.encodeStateAsUpdate(a)), wsA, room);
    clock.t += 6 * 60_000;
    handleSyncMessage(server, reconcileMessage("Gerät B", base, Y.encodeStateAsUpdate(b)), wsB, room);

    const doc = yDocToDocument(server);
    expect(doc.nodes.get("alpha")!.title).toBe("Alpha-B");
    expect([...doc.nodes.values()].filter((node) => node.title === "Delta")).toHaveLength(1);
    const copies = listConflictCopies(doc);
    expect(copies).toHaveLength(1);
    expect(copies[0]).toMatchObject({ title: "Alpha-A", device: "Gerät A", time: "2026-11-20 17:31".replace("17:31", "17:25") });

    // Two snapshots (first merge without conflict, second with one); the second holds both versions.
    const snapshots = store.list("offline.md");
    expect(snapshots).toHaveLength(2);
    expect(snapshots[0]!.conflictNodeIds).toEqual([]);
    expect(snapshots[1]!.conflictNodeIds).toEqual(["alpha"]);
    const second = store.read("offline.md", snapshots[1]!.id)!;
    expect(second.server).toContain("## Alpha-A");
    expect(second.server).toContain("## Delta");
    expect(second.client).toContain("## Alpha-B");
    // The first snapshot is the original room and the first client's version.
    const first = store.read("offline.md", snapshots[0]!.id)!;
    expect(first.server).toContain("## Alpha ");
    expect(first.client).toContain("## Alpha-A");
  });

  test("the snapshot exists before the merge changed the room", () => {
    const { server, base, store, room, wsA, a } = scenario();
    let serverTitleWhenSaved = "";
    const original = store.save.bind(store);
    store.save = (input) => {
      serverTitleWhenSaved = yDocToDocument(server).nodes.get("alpha")!.title;
      return original(input);
    };
    room.offline!.snapshots = store;
    handleSyncMessage(server, reconcileMessage("Gerät A", base, Y.encodeStateAsUpdate(a)), wsA, room);
    expect(serverTitleWhenSaved).toBe("Alpha");
    expect(yDocToDocument(server).nodes.get("alpha")!.title).toBe("Alpha-A");
  });

  test("repeated delivery creates no second snapshot, copy or node", () => {
    const { server, base, store, room, wsA, wsB, a, b } = scenario();
    const messages = [
      reconcileMessage("Gerät A", base, Y.encodeStateAsUpdate(a)),
      reconcileMessage("Gerät B", base, Y.encodeStateAsUpdate(b)),
    ];
    handleSyncMessage(server, messages[0]!, wsA, room);
    handleSyncMessage(server, messages[1]!, wsB, room);
    const before = serializeToMarkdown(yDocToDocument(server)).replace(/^updated: .*$/m, "");
    for (const [index, message] of [messages[1]!, messages[0]!, messages[1]!, messages[1]!].entries()) {
      handleSyncMessage(server, message, index % 2 ? wsA : wsB, room);
    }
    expect(serializeToMarkdown(yDocToDocument(server)).replace(/^updated: .*$/m, "")).toBe(before);
    expect(store.list("offline.md")).toHaveLength(2);
    expect(listConflictCopies(yDocToDocument(server))).toHaveLength(1);
  });

  test("a connection that only delivers known structures does not take over the authorship (#261)", () => {
    // A client built on another Yjs history replaces the node entries without changing any text.
    // Which side wins depends on random client ids, so repeat it.
    for (let run = 0; run < 20; run++) {
      const { server, base, room, wsA, wsB, a } = scenario();
      handleSyncMessage(server, reconcileMessage("Gerät A", base, Y.encodeStateAsUpdate(a)), wsA, room);
      room.offline!.devices.set(wsB, "Gerät B");
      Y.applyUpdate(server, Y.encodeStateAsUpdate(documentToYDoc(yDocToDocument(server))), wsB);
      expect(room.offline!.authors.get("alpha")?.device).toBe("Gerät A");
      expect(room.offline!.authors.get("gamma")?.device).not.toBe("Gerät B");
    }
  });

  test("a seed that arrives late from an older connection does not hide the first client's merge (#261)", () => {
    // Every client seeds its own Y.Doc from the file. B's handshake answer (SyncStep2) travels
    // slowly and reaches the server after A's merge but before B's own reconcile.
    const step2 = (from: Y.Doc, stateVector: Uint8Array) => {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, 0);
      encoding.writeVarUint(encoder, 1);
      encoding.writeVarUint8Array(encoder, Y.encodeStateAsUpdate(from, stateVector));
      return encoding.toUint8Array(encoder);
    };
    // The outcome used to depend on random client ids; repeat it.
    for (let run = 0; run < 40; run++) {
      const server = documentToYDoc(parseFile("offline.md", MARKDOWN));
      const room = makeRoom(server, null, { t: Date.UTC(2026, 10, 20, 16, 25) });
      trackNodeAuthors(room, server);
      const wsA = mockWs();
      const wsB = mockWs();
      const wsOld = mockWs();
      const a = documentToYDoc(parseFile("offline.md", MARKDOWN));
      const b = documentToYDoc(parseFile("offline.md", MARKDOWN));
      Y.applyUpdate(a, Y.encodeStateAsUpdate(server));
      Y.applyUpdate(server, Y.encodeStateAsUpdate(a), wsA);
      const serverBeforeB = Y.encodeStateVector(server);
      Y.applyUpdate(b, Y.encodeStateAsUpdate(server));
      const lateStep2 = step2(b, serverBeforeB);
      const baseA = Y.encodeStateAsUpdate(a);
      const baseB = Y.encodeStateAsUpdate(b);
      yRenameNode(a, "beta", "Beta-A");
      yRenameNode(b, "beta", "Beta-B");

      handleSyncMessage(server, reconcileMessage("Gerät A", baseA, Y.encodeStateAsUpdate(a)), wsA, room);
      handleSyncMessage(server, lateStep2, wsOld, room);
      handleSyncMessage(server, reconcileMessage("Gerät B", baseB, Y.encodeStateAsUpdate(b)), wsB, room);

      const doc = yDocToDocument(server);
      expect(doc.nodes.get("beta")!.title).toBe("Beta-B");
      expect(listConflictCopies(doc).map((copy) => `${copy.title}/${copy.device}`)).toEqual(["Beta-A/Gerät A"]);
    }
  });

  test("a live edit by a named device is the author of the copy later", () => {
    const { server, base, room, wsA, wsB, b } = scenario();
    const live = replica(server);
    yRenameNode(live, "alpha", "Alpha-Live");
    handleSyncMessage(server, deviceMessage("Gerät A"), wsA, room);
    // Live edits arrive as ordinary sync updates from the connection of device A.
    Y.applyUpdate(server, Y.encodeStateAsUpdate(live, Y.encodeStateVector(server)), wsA);
    handleSyncMessage(server, reconcileMessage("Gerät B", base, Y.encodeStateAsUpdate(b)), wsB, room);
    expect(listConflictCopies(yDocToDocument(server))[0]).toMatchObject({ title: "Alpha-Live", device: "Gerät A" });
  });

  test("restoring a snapshot writes both starting versions as files", () => {
    const { server, base, store, room, wsA, wsB, a, b } = scenario();
    handleSyncMessage(server, reconcileMessage("Gerät A", base, Y.encodeStateAsUpdate(a)), wsA, room);
    handleSyncMessage(server, reconcileMessage("Gerät B", base, Y.encodeStateAsUpdate(b)), wsB, room);
    const conflictSnapshot = store.list("offline.md").find((meta) => meta.conflictNodeIds.length > 0)!;
    const files = restoreSnapshot(store, "offline.md", conflictSnapshot.id, dir, "offline.md");
    const titles = (path: string) => [...parseFile(path, readFileSync(path, "utf8")).nodes.values()].map((node) => node.title);
    expect(titles(files.server)).toContain("Alpha-A");
    expect(titles(files.server)).toContain("Delta");
    expect(titles(files.client)).toContain("Alpha-B");
    expect(readdirSync(dir).filter((name) => name.endsWith(".md"))).toHaveLength(2);
    // Restoring twice never overwrites a file.
    expect(() => restoreSnapshot(store, "offline.md", conflictSnapshot.id, dir, "offline.md")).toThrow();
    expect(() => restoreSnapshot(store, "offline.md", "../etc", dir, "offline.md")).toThrow();
  });

  test("a broken offline message does not break the room; ordinary sync still merges", () => {
    const { server, room, wsA } = scenario();
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MSG_RECONCILE);
    encoding.writeVarString(encoder, "Gerät A");
    encoding.writeVarUint8Array(encoder, new Uint8Array(0));
    encoding.writeVarUint8Array(encoder, new Uint8Array([1, 2, 3]));
    expect(() => handleSyncMessage(server, encoding.toUint8Array(encoder), wsA, room)).not.toThrow();
    expect(yDocToDocument(server).nodes.get("alpha")!.title).toBe("Alpha");
  });

  test("a room without snapshot store merges and read-only clients may not send offline state", () => {
    const { server, base, room, wsA, a } = scenario();
    room.offline!.snapshots = null;
    handleSyncMessage(server, reconcileMessage("Gerät A", base, Y.encodeStateAsUpdate(a)), wsA, room);
    expect(yDocToDocument(server).nodes.get("alpha")!.title).toBe("Alpha-A");
    expect(isReadOnlyMessageAllowed(reconcileMessage("x", null, new Uint8Array(0)))).toBe(false);
    expect(isReadOnlyMessageAllowed(deviceMessage("x"))).toBe(false);
  });

  test("device labels cannot break the conflict title frame", () => {
    expect(sanitizeDeviceLabel("  Mein (Laptop)\n 2 ")).toBe("Mein Laptop 2");
    expect(sanitizeDeviceLabel("()")).toBe("unbekanntes Gerät");
    expect(sanitizeDeviceLabel("x".repeat(100))).toHaveLength(40);
  });

  test("disconnecting forgets the device", () => {
    const { room, wsA } = scenario();
    handleSyncMessage(room.yDoc, deviceMessage("Gerät A"), wsA, room);
    expect(room.offline!.devices.get(wsA)).toBe("Gerät A");
    releaseAwarenessClients(room, wsA);
    expect(room.offline!.devices.has(wsA)).toBe(false);
  });
});
