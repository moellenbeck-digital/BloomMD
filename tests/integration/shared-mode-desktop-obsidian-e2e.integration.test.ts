import { afterEach, describe, expect, test } from "bun:test";
import {
  SharedDocumentMirror,
  WorkspaceSyncClient,
  documentToYDoc,
  hashSharedDocumentMarkdown,
  parseFile,
  serializeToMarkdown,
  signSyncTicket,
  yDocToDocument,
  yUpdateContentDiff,
  type SharedDocumentBinding,
} from "../../packages/core/src/index";
import { SyncProvider } from "../../packages/ui/src/sync/SyncProvider";
import { ObsidianSharedDocumentSession } from "../../plugins/obsidian/src/shared-document";
import { createSyncServer } from "../../packages/sync/src/server";
import { broadcastUpdate } from "../../packages/sync/src/sync-handler";
import type { SyncRoom, WebSocketData } from "../../packages/sync/src/types";
import type { ServerWebSocket } from "bun";
import { Awareness } from "y-protocols/awareness";

const SYNC_SECRET = "shared-mode-e2e-sync-secret-with-enough-entropy";
const DOCUMENT_ID = "shared-document-1";
const WORKSPACE_ID = "shared-workspace-1";
const FILENAME = "shared.md";
const DESKTOP_LOCAL_FILE_MIRROR_ORIGIN = "desktop-shared-mode-e2e" as const;

function markdown(title: string, content = ""): string {
  return serializeToMarkdown(parseFile(FILENAME, `# ${title}\n\n${content}`));
}

function binding(markdownValue: string): SharedDocumentBinding {
  return {
    schemaVersion: 1,
    workspaceId: WORKSPACE_ID,
    documentId: DOCUMENT_ID,
    cloudFilename: FILENAME,
    lastAcknowledgedMarkdownHash: hashSharedDocumentMarkdown(markdownValue),
    lastKnownCloudVersion: 1,
    connectionState: "connected",
  };
}

function ticketUrl(serverUrl: string, userId: string, permission: "read" | "write" = "write"): string {
  const ticket = signSyncTicket({
    userId,
    workspaceId: WORKSPACE_ID,
    documentId: DOCUMENT_ID,
    filename: FILENAME,
    permission,
    exp: Math.floor(Date.now() / 1000) + 60,
  }, SYNC_SECRET);
  const url = new URL(serverUrl);
  url.protocol = "ws:";
  url.pathname = `/ws/${DOCUMENT_ID}`;
  url.searchParams.set("ticket", ticket);
  return url.toString();
}

async function waitFor(predicate: () => boolean, message: string): Promise<void> {
  const deadline = Date.now() + 4_000;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error(message);
    await Bun.sleep(10);
  }
}

describe("Shared Mode Desktop ↔ Web ↔ Obsidian", () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    while (cleanups.length > 0) cleanups.pop()?.();
  });

  test("keeps one explicitly shared local file coherent across Desktop, Web and Obsidian with presence, viewer enforcement, and revocation", async () => {
    const initialMarkdown = markdown("Shared plan", "Initial local content.");
    const serverDoc = documentToYDoc(parseFile(FILENAME, initialMarkdown));
    const awareness = new Awareness(serverDoc);
    awareness.setLocalState(null);
    const room: SyncRoom = {
      key: DOCUMENT_ID,
      filename: FILENAME,
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

    const permissions = new Map<string, "read" | "write">([
      ["desktop-user", "write"],
      ["web-user", "write"],
      ["obsidian-user", "write"],
    ]);
    const roomManager = {
      authorize: async (descriptor: { userId?: string }) => {
        const permission = descriptor.userId ? permissions.get(descriptor.userId) : null;
        if (!permission) throw new Error("workspace membership revoked");
        return permission;
      },
      getOrCreateRoom: async () => room,
      addClient: (target: SyncRoom, ws: ServerWebSocket<WebSocketData>) => { target.clients.add(ws); },
      removeClient: (target: SyncRoom, ws: ServerWebSocket<WebSocketData>) => { target.clients.delete(ws); },
      getRooms: () => new Map([[room.key, room]]),
      beginDrain: () => undefined,
      shutdown: async () => ({ flushedRooms: 0, failedRoomKeys: [], timedOutRoomKeys: [] }),
    };
    const { app, websocket } = createSyncServer(roomManager as never, { syncSecret: SYNC_SECRET });
    const server = Bun.serve({ port: 0, fetch: app.fetch, websocket });
    cleanups.push(() => server.stop(true));
    cleanups.push(() => serverDoc.destroy());
    cleanups.push(() => awareness.destroy());

    let desktopMarkdown = initialMarkdown;
    const desktopDoc = documentToYDoc(parseFile(FILENAME, initialMarkdown));
    cleanups.push(() => desktopDoc.destroy());
    const desktopMirror = new SharedDocumentMirror({
      binding: binding(initialMarkdown),
      hashMarkdown: hashSharedDocumentMarkdown,
      file: {
        readMarkdown: async () => desktopMarkdown,
        writeMarkdown: async (nextMarkdown) => { desktopMarkdown = nextMarkdown; },
      },
      publishLocalMarkdown: async (nextMarkdown, expectedCloudVersion) => {
        documentToYDoc(parseFile(FILENAME, nextMarkdown), desktopDoc, DESKTOP_LOCAL_FILE_MIRROR_ORIGIN);
        return { kind: "acknowledged" as const, cloudVersion: expectedCloudVersion };
      },
    });
    desktopDoc.on("update", (_update: Uint8Array, origin: unknown) => {
      if (origin === DESKTOP_LOCAL_FILE_MIRROR_ORIGIN) return;
      const remoteMarkdown = serializeToMarkdown(yDocToDocument(desktopDoc));
      void desktopMirror.applyRemoteMarkdown(remoteMarkdown, 1);
    });
    const desktopProvider = new SyncProvider({
      url: ticketUrl(server.url.toString(), "desktop-user"),
      doc: desktopDoc,
      awarenessIdentity: { name: "Desktop local owner" },
      resyncIntervalMs: 10_000,
      connectionTimeoutMs: 10_000,
    });
    cleanups.push(() => desktopProvider.destroy());
    desktopProvider.connect();

    let vaultMarkdown = initialMarkdown;
    let obsidianBinding = binding(initialMarkdown);
    const obsidianRequests: Array<{ url: string; method?: string; body?: unknown }> = [];
    const obsidianClient = new WorkspaceSyncClient({
      baseUrl: server.url.toString(),
      accessToken: "obsidian-test-token",
      fetchImpl: async (input, init) => {
        const url = String(input);
        obsidianRequests.push({
          url,
          method: init?.method,
          body: init?.body ? JSON.parse(String(init.body)) : undefined,
        });
        const response = (body: unknown) => new Response(JSON.stringify(body), {
          headers: { "Content-Type": "application/json" },
        });
        if (url.includes("/api/workspaces")) {
          return response({
            workspace: { id: WORKSPACE_ID, name: "Shared team", slug: "shared-team", kind: "team", role: "editor" },
            workspaces: [],
          });
        }
        if (url.includes(`/api/mindmaps/${FILENAME}`)) {
          return response({ storage: { documentId: DOCUMENT_ID, version: 1 } });
        }
        if (url.includes("/api/shared-documents/audit")) return response({ recorded: true });
        if (!url.includes("/api/sync-ticket")) return new Response(JSON.stringify({ error: "unexpected request" }), { status: 500 });
        return new Response(JSON.stringify({
          websocketUrl: ticketUrl(server.url.toString(), "obsidian-user"),
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
          permission: "write",
        }), { headers: { "Content-Type": "application/json" } });
      },
    });
    let obsidianProvider: SyncProvider | null = null;
    const obsidianSession = await ObsidianSharedDocumentSession.bindExisting({
      file: { path: "Private/Vault/Shared plan.md", basename: "Shared plan" },
      serverUrl: server.url.toString(),
      accessToken: "obsidian-test-token",
      workspaceId: WORKSPACE_ID,
      cloudFilename: FILENAME,
      vault: {
        readMarkdown: async () => vaultMarkdown,
        writeMarkdown: async (_file, nextMarkdown) => { vaultMarkdown = nextMarkdown; },
      },
      createClient: () => obsidianClient,
      createProvider: (input) => {
        obsidianProvider = new SyncProvider({
          ...input,
          awarenessIdentity: { name: "Obsidian vault collaborator" },
          resyncIntervalMs: 10_000,
          connectionTimeoutMs: 10_000,
        });
        return obsidianProvider;
      },
      onBindingChange: (nextBinding) => { obsidianBinding = nextBinding; },
    });
    cleanups.push(() => obsidianSession.disconnect());
    expect(obsidianBinding).toMatchObject({ workspaceId: WORKSPACE_ID, cloudFilename: FILENAME, documentId: DOCUMENT_ID });
    expect(obsidianRequests.some((request) => request.url.endsWith("/api/mindmaps") && request.method === "POST")).toBe(false);
    expect(JSON.stringify(obsidianRequests)).not.toContain("Private/Vault");

    const webDoc = documentToYDoc(parseFile(FILENAME, initialMarkdown));
    cleanups.push(() => webDoc.destroy());
    const webProvider = new SyncProvider({
      url: ticketUrl(server.url.toString(), "web-user"),
      doc: webDoc,
      awarenessIdentity: { name: "Web collaborator" },
      resyncIntervalMs: 10_000,
      connectionTimeoutMs: 10_000,
    });
    cleanups.push(() => webProvider.destroy());
    webProvider.connect();

    await waitFor(
      () => desktopProvider.getStatus() === "connected" && webProvider.getStatus() === "connected" && room.clients.size === 3,
      "All three explicit Shared Mode clients did not connect.",
    );
    await waitFor(
      () => {
        const names = [...webProvider.getAwarenessStatesForTest().values()]
          .map((state) => state?.name);
        return names.includes("Desktop local owner") && names.includes("Obsidian vault collaborator");
      },
      "The Web collaborator did not receive Desktop and Obsidian presence.",
    );
    expect(obsidianProvider?.getStatus()).toBe("connected");

    const desktopChange = markdown("Shared plan", "Created in the Desktop local file.");
    desktopMarkdown = desktopChange;
    await desktopMirror.handleLocalMarkdown(desktopChange);
    await waitFor(
      () => serializeToMarkdown(yDocToDocument(webDoc)).includes("Created in the Desktop local file.")
        && vaultMarkdown.includes("Created in the Desktop local file."),
      "A Desktop local-file update did not reach Web and Obsidian.",
    );

    const webDocument = yDocToDocument(webDoc);
    yUpdateContentDiff(webDoc, webDocument.rootId, webDocument.nodes.get(webDocument.rootId)?.content ?? "", "Updated by the Web collaborator.");
    await waitFor(
      () => desktopMarkdown.includes("Updated by the Web collaborator.") && vaultMarkdown.includes("Updated by the Web collaborator."),
      "A Web update did not reach both explicit local mirrors.",
    );

    const obsidianChange = markdown("Shared plan", "Written in the explicitly shared Obsidian note.");
    vaultMarkdown = obsidianChange;
    await obsidianSession.handleVaultModify(obsidianChange);
    await waitFor(
      () => desktopMarkdown.includes("Written in the explicitly shared Obsidian note.")
        && serializeToMarkdown(yDocToDocument(webDoc)).includes("Written in the explicitly shared Obsidian note."),
      "An Obsidian vault update did not reach Desktop and Web.",
    );

    permissions.set("viewer-user", "read");
    const viewerDoc = documentToYDoc(parseFile(FILENAME, initialMarkdown));
    cleanups.push(() => viewerDoc.destroy());
    const viewerProvider = new SyncProvider({
      url: ticketUrl(server.url.toString(), "viewer-user", "write"),
      doc: viewerDoc,
      awarenessIdentity: { name: "Read-only reviewer" },
      resyncIntervalMs: 10_000,
      connectionTimeoutMs: 10_000,
    });
    cleanups.push(() => viewerProvider.destroy());
    viewerProvider.connect();
    await waitFor(
      () => viewerProvider.getStatus() === "connected" && room.clients.size === 4,
      "The read-only collaborator did not connect to the shared document.",
    );
    const viewerDocument = yDocToDocument(viewerDoc);
    yUpdateContentDiff(
      viewerDoc,
      viewerDocument.rootId,
      viewerDocument.nodes.get(viewerDocument.rootId)?.content ?? "",
      "This viewer edit must never reach the shared document.",
    );
    await Bun.sleep(100);
    expect(serializeToMarkdown(yDocToDocument(serverDoc))).not.toContain("This viewer edit must never reach the shared document.");

    permissions.delete("obsidian-user");
    const revokedLocalChange = markdown("Shared plan", "This Obsidian change must remain local after revocation.");
    vaultMarkdown = revokedLocalChange;
    await obsidianSession.handleVaultModify(revokedLocalChange);
    await waitFor(
      () => obsidianBinding.connectionState === "revoked",
      "The revoked Obsidian member was not marked revoked after its next sync mutation.",
    );
    await Bun.sleep(50);

    expect(serializeToMarkdown(yDocToDocument(serverDoc))).not.toContain("must remain local after revocation");
    expect(vaultMarkdown).toContain("must remain local after revocation");
    expect(desktopProvider.getStatus()).toBe("connected");
  });
});
