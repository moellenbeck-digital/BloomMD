import { afterEach, describe, expect, test } from "bun:test";
import { WorkspaceSyncClient, documentToYDoc, parseFile, serializeToMarkdown, yDocToDocument, yUpdateContentDiff } from "../../packages/core/src/index";
import { ObsidianSharedDocumentSession } from "../../plugins/obsidian/src/shared-document";
import type { ServerWebSocket } from "bun";
import { createSyncServer } from "../../packages/sync/src/server";
import { broadcastUpdate } from "../../packages/sync/src/sync-handler";
import type { SyncRoom, WebSocketData } from "../../packages/sync/src/types";

function markdown(title: string, content = ""): string {
  return serializeToMarkdown(parseFile("Research.md", `# ${title}\n\n${content}`));
}

async function waitFor(
  predicate: () => boolean,
  message: string,
  diagnostics: () => string = () => "",
): Promise<void> {
  // The real WebSocket/Yjs round trip can be delayed on a loaded CI runner.
  // Keep this integration test end-to-end, but give the scheduler enough room
  // and report the observed state if it still cannot converge.
  const deadline = Date.now() + 10_000;
  while (!predicate()) {
    if (Date.now() >= deadline) {
      const details = diagnostics();
      throw new Error(details.length > 0 ? `${message} ${details}` : message);
    }
    await Bun.sleep(10);
  }
}

describe("Obsidian shared document ↔ sync integration", () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    while (cleanups.length > 0) cleanups.pop()?.();
  });

  test("mirrors an explicitly shared vault note through the real Yjs sync server without disclosing its vault path", { timeout: 15_000 }, async () => {
    const initialMarkdown = markdown("Research", "Initial vault content.");
    const serverDoc = documentToYDoc(parseFile("Research.md", initialMarkdown));
    const awareness = { getStates: () => new Map(), on: () => undefined, destroy: () => undefined };
    const room: SyncRoom = {
      key: "Research.md", filename: "Research.md", yDoc: serverDoc, clients: new Set(),
      awareness: awareness as SyncRoom["awareness"], awarenessClients: new Map(), persistTimer: null,
      persistenceTimeoutTimer: null, destroyTimer: null, isPersisting: false, revision: 0,
      persistenceOperation: null, lastPersistError: null,
    };
    serverDoc.on("update", (update: Uint8Array, origin: unknown) => {
      const sender = origin instanceof Object && "readyState" in origin ? origin as ServerWebSocket<WebSocketData> : null;
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

    let localMarkdown = initialMarkdown;
    const requests: Array<{ url: string; body?: unknown }> = [];
    const syncStatuses: string[] = [];
    const websocketUrl = server.url.toString().replace(/^http/u, "ws").replace(/\/$/u, "/ws/Research.md");
    const session = await ObsidianSharedDocumentSession.share({
      file: { path: "Private/Client-A/Research.md", basename: "Research" },
      vault: {
        readMarkdown: async () => localMarkdown,
        writeMarkdown: async (_file, markdownValue) => { localMarkdown = markdownValue; },
      },
      serverUrl: "https://bloommd.app",
      accessToken: "bloom_pat_test",
      workspaceId: "workspace-1",
      createClient: (_serverUrl, _accessToken) => new WorkspaceSyncClient({
        baseUrl: "https://bloommd.app",
        accessToken: "bloom_pat_test",
        fetchImpl: async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = String(input);
          requests.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
          const response = (body: unknown) => new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
          if (url.includes("/api/workspaces")) return response({ workspace: { id: "workspace-1", name: "Team", slug: "team", kind: "team", role: "editor" }, workspaces: [] });
          if (url.endsWith("/api/mindmaps")) return response({ filePath: "Research.md" });
          if (url.includes("/api/sync-ticket")) return response({ websocketUrl, expiresAt: "2026-09-13T10:00:00.000Z", permission: "write" });
          return response({ storage: { documentId: "document-1", version: 1 } });
        },
      }),
      onBindingChange: async () => undefined,
      onStatusChange: (status) => { syncStatuses.push(status); },
    });
    cleanups.push(() => session.disconnect());
    await waitFor(
      () => syncStatuses.includes("connected") && room.clients.size === 1,
      "Obsidian session did not complete its sync connection.",
      () => `Observed clients: ${room.clients.size}; statuses: ${syncStatuses.join(",") || "none"}.`,
    );
    expect(JSON.stringify(requests)).not.toContain("Private/Client-A");

    localMarkdown = markdown("Research", "Changed in the Obsidian vault.");
    await session.handleVaultModify(localMarkdown);
    await waitFor(
      () => yDocToDocument(serverDoc).nodes.get(yDocToDocument(serverDoc).rootId)?.content.includes("Changed in the Obsidian vault.") ?? false,
      "Local Obsidian Markdown did not reach the sync Y.Doc.",
      () => `Server document: ${JSON.stringify(yDocToDocument(serverDoc))}.`,
    );

    const remoteDocument = yDocToDocument(serverDoc);
    yUpdateContentDiff(serverDoc, remoteDocument.rootId, remoteDocument.nodes.get(remoteDocument.rootId)?.content ?? "", "Written by a collaborator.");
    await waitFor(
      () => localMarkdown.includes("Written by a collaborator."),
      "Remote Yjs content was not mirrored into the vault Markdown.",
      () => `Vault Markdown: ${JSON.stringify(localMarkdown)}. Sync clients: ${room.clients.size}.`,
    );
  });
});
