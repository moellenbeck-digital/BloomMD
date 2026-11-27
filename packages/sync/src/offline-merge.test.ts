import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as Y from "yjs";
import { Awareness } from "y-protocols/awareness";
import * as encoding from "lib0/encoding";
import {
  FileStore,
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
import { createSyncTelemetry, type SyncTelemetry } from "./observability";
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
    // Every client seeds its own Y.Doc from the file, and the seeds differ (the frontmatter dates
    // are set per load). B's handshake answer (SyncStep2) travels slowly and reaches the server
    // after A's merge but before B's own reconcile.
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
      room.offline!.devices.set(wsOld, "Gerät B");
      const a = documentToYDoc(parseFile("offline.md", MARKDOWN.replace("updated: 2026-11-20", "updated: 2026-11-21")));
      const b = documentToYDoc(parseFile("offline.md", MARKDOWN.replace("updated: 2026-11-20", "updated: 2026-11-22")));
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

  test("a handshake answer without reconcile cannot change a node, one after a reconcile is applied as sent", () => {
    const { server, room, wsA, wsB, a, b } = scenario();
    const handshake = (from: Y.Doc) => {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, 0);
      encoding.writeVarUint(encoder, 1);
      encoding.writeVarUint8Array(encoder, Y.encodeStateAsUpdate(from, Y.encodeStateVector(server)));
      return encoding.toUint8Array(encoder);
    };
    // A's reconcile failed (broken payload): the ordinary sync that follows it must still merge.
    const broken = encoding.createEncoder();
    encoding.writeVarUint(broken, MSG_RECONCILE);
    encoding.writeVarUint(broken, 99);
    handleSyncMessage(server, encoding.toUint8Array(broken), wsA, room);
    handleSyncMessage(server, handshake(a), wsA, room);
    expect(yDocToDocument(server).nodes.get("alpha")!.title).toBe("Alpha-A");
    // B announced no reconcile: its edit does not arrive this way, and A's stays.
    handleSyncMessage(server, handshake(b), wsB, room);
    expect(yDocToDocument(server).nodes.get("alpha")!.title).toBe("Alpha-A");
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

  describe("version history of the file (#261)", () => {
    function withHistory(telemetry?: SyncTelemetry) {
      const s = scenario();
      const files = new FileStore({ baseDir: join(dir, "notes"), backupsEnabled: false });
      s.room.offline!.history = (filename, versions, at) => files.addBackups(filename, versions, at);
      const merge = (device: string, ws: Ws, base: Uint8Array | null, doc: Y.Doc) => {
        handleSyncMessage(s.server, reconcileMessage(device, base, Y.encodeStateAsUpdate(doc)), ws, s.room, telemetry);
      };
      const settle = () => s.room.offline!.historyPending ?? Promise.resolve();
      return { ...s, files, merge, settle };
    }
    const titlesOf = (markdown: string) => [...parseFile("offline.md", markdown).nodes.values()].map((node) => node.title);

    test("a merge with a conflict adds two entries: the server's version, then the device's as the newer one", async () => {
      const { base, files, merge, settle, wsA, wsB, a, b } = withHistory();
      merge("Gerät A", wsA, base, a);
      await settle();
      // The first merge has no conflict: nothing in the history.
      expect(await files.listBackups("offline.md")).toHaveLength(0);
      merge("Gerät B", wsB, base, b);
      await settle();

      const revisions = await files.listBackups("offline.md");
      expect(revisions).toHaveLength(2);
      expect(revisions.every((revision) => revision.source === "local")).toBe(true);
      const [device, server] = await Promise.all(revisions.map((revision) => files.readBackup("offline.md", revision.id)));
      expect(titlesOf(server!)).toEqual(expect.arrayContaining(["Alpha-A", "Delta"]));
      expect(titlesOf(server!)).not.toContain("Alpha-B");
      expect(titlesOf(device!)).toContain("Alpha-B");
      expect(titlesOf(device!)).not.toContain("Delta");
    });

    test("an entry can be restored and the replaced version lands in the history", async () => {
      const { base, files, merge, settle, wsA, wsB, a, b } = withHistory();
      const { writeFileSync, mkdirSync } = await import("node:fs");
      mkdirSync(join(dir, "notes"), { recursive: true });
      writeFileSync(join(dir, "notes", "offline.md"), serializeToMarkdown(yDocToDocument(replica(a))));
      merge("Gerät A", wsA, base, a);
      merge("Gerät B", wsB, base, b);
      await settle();
      const [device] = await files.listBackups("offline.md");
      await files.restoreBackup("offline.md", device!.id);
      expect(titlesOf(readFileSync(join(dir, "notes", "offline.md"), "utf8"))).toContain("Alpha-B");
      expect(await files.listBackups("offline.md")).toHaveLength(3);
    });

    test("no base or no change: no entry; repeated delivery: no further entries", async () => {
      const { server, base, files, merge, settle, room, wsA, wsB, a, b } = withHistory();
      // No base: the client brings its whole state, nothing was to be compared.
      merge("Gerät A", wsA, null, a);
      // No change: a client that only brings what the room already has.
      merge("Gerät C", mockWs(), base, replica(server));
      await settle();
      expect(await files.listBackups("offline.md")).toHaveLength(0);

      merge("Gerät B", wsB, base, b);
      await settle();
      const afterConflict = await files.listBackups("offline.md");
      expect(afterConflict).toHaveLength(2);
      for (const device of ["Gerät B", "Gerät A", "Gerät B"]) merge(device, device === "Gerät A" ? wsA : wsB, base, device === "Gerät A" ? a : b);
      await settle();
      expect(await files.listBackups("offline.md")).toEqual(afterConflict);
      expect(room.offline!.historyPending).toBeDefined();
    });

    test("a failing history write does not stop the merge; it is reported as telemetry", async () => {
      const events: string[] = [];
      const telemetry = createSyncTelemetry({ write: (line: string) => events.push(line) });
      const { server, base, room, merge, settle, wsA, wsB, a, b } = withHistory(telemetry);
      room.offline!.history = async () => {
        throw new Error("EACCES");
      };
      merge("Gerät A", wsA, base, a);
      merge("Gerät B", wsB, base, b);
      await settle();
      expect(yDocToDocument(server).nodes.get("alpha")!.title).toBe("Alpha-B");
      expect(listConflictCopies(yDocToDocument(server))).toHaveLength(1);
      expect(events.join("\n")).toContain("offline.history");
    });

    test("a room without history writer (cloud) merges as before", async () => {
      const { server, base, room, wsA, wsB, a, b } = scenario();
      expect(room.offline!.history ?? null).toBeNull();
      handleSyncMessage(server, reconcileMessage("Gerät A", base, Y.encodeStateAsUpdate(a)), wsA, room);
      handleSyncMessage(server, reconcileMessage("Gerät B", base, Y.encodeStateAsUpdate(b)), wsB, room);
      expect(listConflictCopies(yDocToDocument(server))).toHaveLength(1);
      expect(room.offline!.historyPending).toBeUndefined();
    });
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
