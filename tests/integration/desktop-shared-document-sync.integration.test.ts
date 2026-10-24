import { afterEach, describe, expect, test } from "bun:test";
import {
  SharedDocumentMirror,
  documentToYDoc,
  hashSharedDocumentMarkdown,
  parseFile,
  serializeToMarkdown,
  yUpdateContentDiff,
  yDocToDocument,
  type SharedDocumentBinding,
} from "../../packages/core/src/index";
import { SyncProvider } from "../../packages/ui/src/sync/SyncProvider";
import type { ServerWebSocket } from "bun";
import { createSyncServer } from "../../packages/sync/src/server";
import { broadcastUpdate } from "../../packages/sync/src/sync-handler";
import type { SyncRoom, WebSocketData } from "../../packages/sync/src/types";

const DESKTOP_LOCAL_FILE_MIRROR_ORIGIN = "desktop-local-file-mirror" as const;

function markdown(title: string, content = ""): string {
  return serializeToMarkdown(parseFile("shared.md", `# ${title}\n\n${content}`));
}

function binding(markdownValue: string): SharedDocumentBinding {
  return {
    schemaVersion: 1,
    workspaceId: "workspace-1",
    documentId: "document-1",
    cloudFilename: "shared.md",
    lastAcknowledgedMarkdownHash: hashSharedDocumentMarkdown(markdownValue),
    lastKnownCloudVersion: 1,
    connectionState: "connected",
  };
}

async function waitFor(predicate: () => boolean, message: string): Promise<void> {
  const deadline = Date.now() + 3_000;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error(message);
    await Bun.sleep(10);
  }
}

describe("desktop shared document ↔ sync integration", () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    while (cleanups.length > 0) cleanups.pop()?.();
  });

  test("mirrors local and remote Markdown through the real sync provider without a watcher echo mutation", async () => {
    const initialMarkdown = markdown("Initial", "Initial body.");
    const serverDoc = documentToYDoc(parseFile("shared.md", initialMarkdown));
    // Presence is orthogonal to document mirroring. This minimal room-aware adapter keeps the
    // integration test focused on the real WebSocket/Yjs document path without adding a root
    // test dependency on the sync package's awareness implementation.
    const awareness = {
      getStates: () => new Map(),
      on: () => undefined,
      destroy: () => undefined,
    };
    const room: SyncRoom = {
      key: "shared.md",
      filename: "shared.md",
      yDoc: serverDoc,
      clients: new Set(),
      awareness: awareness as SyncRoom["awareness"],
      awarenessClients: new Map(),
      persistTimer: null,
      persistenceTimeoutTimer: null,
      destroyTimer: null,
      isPersisting: false,
      revision: 0,
      persistenceOperation: null,
      lastPersistError: null,
    };
    serverDoc.on("update", (update: Uint8Array, origin: unknown) => {
      const sender = origin instanceof Object && "readyState" in origin
        ? origin as ServerWebSocket<WebSocketData>
        : null;
      broadcastUpdate(update, room, sender);
    });
    const roomManager = {
      authorize: async () => "write" as const,
      getOrCreateRoom: async () => room,
      addClient: (target: SyncRoom, ws: ServerWebSocket<WebSocketData>) => { target.clients.add(ws); },
      removeClient: (target: SyncRoom, ws: ServerWebSocket<WebSocketData>) => { target.clients.delete(ws); },
      getRooms: () => new Map([[room.key, room]]),
      beginDrain: () => undefined,
      shutdown: async () => ({ flushedRooms: 0, failedRoomKeys: [], timedOutRoomKeys: [] }),
    };
    const { app, websocket } = createSyncServer(roomManager as never);
    const server = Bun.serve({ port: 0, fetch: app.fetch, websocket });
    cleanups.push(() => server.stop(true));
    cleanups.push(() => serverDoc.destroy());

    const desktopDoc = documentToYDoc(parseFile("shared.md", initialMarkdown));
    cleanups.push(() => desktopDoc.destroy());
    let localFileMarkdown = initialMarkdown;
    let localPublishCalls = 0;
    const mirror = new SharedDocumentMirror({
      binding: binding(initialMarkdown),
      hashMarkdown: hashSharedDocumentMarkdown,
      file: {
        readMarkdown: async () => localFileMarkdown,
        writeMarkdown: async (nextMarkdown) => { localFileMarkdown = nextMarkdown; },
      },
      publishLocalMarkdown: async (nextMarkdown, expectedCloudVersion) => {
        localPublishCalls += 1;
        documentToYDoc(parseFile("shared.md", nextMarkdown), desktopDoc, DESKTOP_LOCAL_FILE_MIRROR_ORIGIN);
        return { kind: "acknowledged", cloudVersion: expectedCloudVersion };
      },
    });
    desktopDoc.on("update", (_update: Uint8Array, origin: unknown) => {
      if (origin === DESKTOP_LOCAL_FILE_MIRROR_ORIGIN) return;
      const remoteMarkdown = serializeToMarkdown(yDocToDocument(desktopDoc));
      void mirror.applyRemoteMarkdown(remoteMarkdown, 1);
    });

    const statuses: string[] = [];
    const endpoint = server.url.toString().replace(/^http/, "ws").replace(/\/$/, "/ws/shared.md");
    const provider = new SyncProvider({
      url: endpoint,
      doc: desktopDoc,
      onStatusChange: (status) => statuses.push(status),
      resyncIntervalMs: 10_000,
      connectionTimeoutMs: 10_000,
    });
    cleanups.push(() => provider.destroy());
    provider.connect();
    await waitFor(() => statuses.includes("connected") && room.clients.size === 1, "Desktop provider did not connect to sync server.");

    const localMarkdown = markdown("Local update", "Written by the desktop file watcher.");
    // A watcher only notifies after the user has already saved this Markdown to disk.
    localFileMarkdown = localMarkdown;
    expect(await mirror.handleLocalMarkdown(localMarkdown)).toEqual({ kind: "published", cloudVersion: 1 });
    await waitFor(
      () => yDocToDocument(serverDoc).nodes.get(yDocToDocument(serverDoc).rootId)?.title === "Local update",
      "Local Markdown update did not reach the sync Y.Doc.",
    );

    const serverDocument = yDocToDocument(serverDoc);
    const serverRoot = serverDocument.nodes.get(serverDocument.rootId);
    if (!serverRoot) throw new Error("Sync room has no root node.");
    yUpdateContentDiff(serverDoc, serverDocument.rootId, serverRoot.content, "Written by another collaborator.");
    await waitFor(
      () => localFileMarkdown.includes("Written by another collaborator."),
      "Remote Yjs update was not mirrored into the local Markdown file.",
    );

    expect(await mirror.handleLocalMarkdown(localFileMarkdown)).toEqual({ kind: "echo" });
    expect(localPublishCalls).toBe(1);
  });
});
