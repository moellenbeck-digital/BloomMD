import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import type { ServerWebSocket } from "bun";
import {
  SharedDocumentMirror,
  documentToYDoc,
  hashSharedDocumentMarkdown,
  parseFile,
  serializeToMarkdown,
  yDocToDocument,
  yUpdateContentDiff,
} from "../../packages/core/src/index";
import { SyncProvider } from "../../packages/ui/src/sync/SyncProvider";
import { createSyncServer } from "../../packages/sync/src/server";
import { broadcastUpdate } from "../../packages/sync/src/sync-handler";
import type { RoomDescriptor, SyncRoom, WebSocketData } from "../../packages/sync/src/types";
import { prepareFolderPublication, publishFolderPlan, scanFolderForPublication } from "../../packages/desktop/src/bun/folder-publish";
import { markFolderRevoked, type FolderShareCloud } from "../../packages/desktop/src/bun/folder-share";
import { findSharedLocalFile, sharedLocalFileInfo } from "../../packages/desktop/src/bun/shared-local-file";
import type { DesktopSettings, DesktopSharedFolderBinding } from "../../packages/desktop/src/bun/settings";

const ORIGIN = "desktop-local-file-mirror" as const;
const WORKSPACE_ID = "workspace-1";
const PROFILE_ID = "profile-1";

/** What the desktop writes to disk and uploads: the canonical serialization of a note. */
function canonical(relativePath: string, text: string): string {
  return serializeToMarkdown(parseFile(relativePath, text));
}

function note(relativePath: string, title: string, content: string): string {
  return canonical(relativePath, `# ${title}\n\n${content}`);
}

async function waitFor(predicate: () => boolean, message: string): Promise<void> {
  const deadline = Date.now() + 3_000;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error(message);
    await Bun.sleep(10);
  }
}

/** The workspace as the server knows it: flat filenames, one document id each. */
class FakeCloud implements FolderShareCloud {
  readonly docs = new Map<string, { documentId: string; markdown: string }>();
  readonly created: string[] = [];
  readonly deleted: string[] = [];
  readonly bound: string[][] = [];
  private counter = 0;

  constructor(existing: Record<string, string> = {}) {
    for (const [filename, markdown] of Object.entries(existing)) this.docs.set(filename, { documentId: `existing-${++this.counter}`, markdown });
  }

  filenames(): string[] {
    return [...this.docs.keys()].sort();
  }

  async create(filename: string, markdown: string) {
    if (this.docs.has(filename)) throw new Error(`API create failed: 409 ${filename}`);
    const documentId = `doc-${++this.counter}`;
    this.docs.set(filename, { documentId, markdown });
    this.created.push(filename);
    return { filePath: filename, storage: { documentId, version: 1 } };
  }

  async delete(filename: string): Promise<void> {
    this.deleted.push(filename);
    this.docs.delete(filename);
  }

  async recordFolderBinding(documentIds: string[]): Promise<void> {
    this.bound.push(documentIds);
  }

  async recordFolderUnbinding(): Promise<void> {}

  byDocumentId(documentId: string) {
    for (const [filename, doc] of this.docs) if (doc.documentId === documentId) return { filename, ...doc };
    return undefined;
  }
}

const awareness = {
  getStates: () => new Map(),
  on: () => undefined,
  destroy: () => undefined,
} as unknown as SyncRoom["awareness"];

function createRoom(key: string, filename: string, yDoc: SyncRoom["yDoc"]): SyncRoom {
  const room: SyncRoom = {
    key,
    filename,
    yDoc,
    clients: new Set(),
    awareness,
    awarenessClients: new Map(),
    persistTimer: null,
    persistenceTimeoutTimer: null,
    destroyTimer: null,
    isPersisting: false,
    revision: 0,
    persistenceOperation: null,
    lastPersistError: null,
  };
  yDoc.on("update", (update: Uint8Array, origin: unknown) => {
    const sender = origin instanceof Object && "readyState" in origin ? origin as ServerWebSocket<WebSocketData> : null;
    broadcastUpdate(update, room, sender);
  });
  return room;
}

/** The real sync server with one room per cloud document, seeded from the fake cloud. */
function startSyncServer(cloud: FakeCloud, cleanups: Array<() => void>) {
  const rooms = new Map<string, SyncRoom>();
  const roomManager = {
    authorize: async () => "write" as const,
    getOrCreateRoom: async (descriptor: RoomDescriptor) => {
      const existing = rooms.get(descriptor.key);
      if (existing) return existing;
      const doc = cloud.byDocumentId(descriptor.key);
      if (!doc) throw new Error(`Unknown document ${descriptor.key}`);
      const room = createRoom(descriptor.key, doc.filename, documentToYDoc(parseFile(doc.filename, doc.markdown)));
      cleanups.push(() => room.yDoc.destroy());
      rooms.set(descriptor.key, room);
      return room;
    },
    addClient: (target: SyncRoom, ws: ServerWebSocket<WebSocketData>) => { target.clients.add(ws); },
    removeClient: (target: SyncRoom, ws: ServerWebSocket<WebSocketData>) => { target.clients.delete(ws); },
    getRooms: () => rooms,
    beginDrain: () => undefined,
    shutdown: async () => ({ flushedRooms: 0, failedRoomKeys: [], timedOutRoomKeys: [] }),
  };
  const { app, websocket } = createSyncServer(roomManager as never);
  const server = Bun.serve({ port: 0, fetch: app.fetch, websocket });
  cleanups.push(() => server.stop(true));
  return { server, rooms };
}

function rootOf(doc: SyncRoom["yDoc"]) {
  const document = yDocToDocument(doc);
  const root = document.nodes.get(document.rootId);
  if (!root) throw new Error("Document has no root node.");
  return { rootId: document.rootId, title: root.title, content: root.content };
}

describe("published folder ↔ cloud documents ↔ sync integration", () => {
  const cleanups: Array<() => void> = [];
  const folders: string[] = [];

  afterEach(async () => {
    while (cleanups.length > 0) cleanups.pop()?.();
    while (folders.length > 0) await rm(folders.pop() as string, { recursive: true, force: true });
  });

  /** A folder with every kind of file the publication must tell apart. */
  async function createFolder(): Promise<{ folderPath: string; markdown: Record<string, string> }> {
    const folderPath = await mkdtemp(join(tmpdir(), "bloommd-folder-share-"));
    folders.push(folderPath);
    const markdown = {
      "a.md": note("a.md", "Alpha", "Alpha body."),
      "sub/b.md": note("sub/b.md", "Beta", "Beta body in a subfolder."),
      "taken.md": note("taken.md", "Taken", "Local text of a name the workspace already has."),
      "skip/c.md": note("skip/c.md", "Skipped", "The person excluded this folder."),
      ".hidden/d.md": note(".hidden/d.md", "Hidden", "Dot folders stay local."),
    };
    for (const [relativePath, text] of Object.entries(markdown)) {
      await mkdir(join(folderPath, relativePath.split("/").slice(0, -1).join("/") || "."), { recursive: true });
      await writeFile(join(folderPath, relativePath), text);
    }
    await writeFile(join(folderPath, "notes.txt"), "not Markdown");
    await symlink(join(folderPath, "a.md"), join(folderPath, "linked.md"));
    return { folderPath, markdown };
  }

  async function publish(folderPath: string, cloud: FakeCloud, strategy: "keep-cloud" | "suffix" = "keep-cloud") {
    const files = await scanFolderForPublication(folderPath);
    const { plan } = prepareFolderPublication({
      files,
      excluded: ["skip"],
      strategy,
      existingCloudFilenames: cloud.filenames(),
      alreadyPublished: new Set(),
      alreadyShared: new Set(),
    });
    const confirmed = plan.items.filter((item) => item.status === "upload").map((item) => item.relativePath);
    const result = await publishFolderPlan({
      plan,
      confirmed,
      workspaceId: WORKSPACE_ID,
      readMarkdown: async (relativePath) => canonical(relativePath, await readFile(join(folderPath, relativePath), "utf-8")),
      cloud,
    });
    const folder: DesktopSharedFolderBinding = {
      id: "folder-1",
      folderPath,
      profileId: PROFILE_ID,
      workspaceId: WORKSPACE_ID,
      strategy,
      excluded: ["skip"],
      publishedAt: "2026-11-04T00:00:00.000Z",
      files: result.published,
      state: "connected",
      knownPaths: files.map((file) => file.relativePath),
      splitRenames: [],
    };
    return { plan, result, folder };
  }

  const cloudWithTakenName = () => new FakeCloud({ "taken.md": note("taken.md", "Taken", "The cloud copy that must survive.") });

  test("publishes only confirmed Markdown, one binding per file, and keeps everything else local", async () => {
    const { folderPath, markdown } = await createFolder();
    const cloud = cloudWithTakenName();

    const { plan, result, folder } = await publish(folderPath, cloud);

    expect(plan.items.map((item) => [item.relativePath, item.status])).toEqual([
      ["a.md", "upload"],
      ["skip/c.md", "excluded"],
      ["sub/b.md", "upload"],
      ["taken.md", "conflict"],
    ]);
    expect(result.published.map((file) => file.relativePath)).toEqual(["a.md", "sub/b.md"]);
    expect(cloud.created).toEqual(["a.md", "sub__b.md"]);
    expect(cloud.filenames()).toEqual(["a.md", "sub__b.md", "taken.md"]);
    for (const file of folder.files) {
      expect(file.binding).toMatchObject({ workspaceId: WORKSPACE_ID, connectionState: "connected", lastKnownCloudVersion: 1 });
      expect(file.binding.lastAcknowledgedMarkdownHash).toBe(hashSharedDocumentMarkdown(markdown[file.relativePath as keyof typeof markdown] as string));
      expect(cloud.docs.get(file.binding.cloudFilename)?.documentId).toBe(file.binding.documentId);
    }
    expect(cloud.bound).toEqual([folder.files.map((file) => file.binding.documentId)]);

    // Nothing of the excluded, hidden, non-Markdown or linked files reached the workspace.
    const uploaded = [...cloud.docs.values()].map((doc) => doc.markdown).join("\n");
    expect(uploaded).not.toContain("The person excluded this folder.");
    expect(uploaded).not.toContain("Dot folders stay local.");
    expect(uploaded).not.toContain("not Markdown");
    expect(cloud.filenames()).not.toContain("linked.md");
    // The cloud side of the binding never carries the local path.
    expect(JSON.stringify(folder.files.map((file) => file.binding))).not.toContain(folderPath);
  });

  test("a name taken in the workspace is never overwritten: kept as a conflict, or uploaded under another name", async () => {
    const keep = await createFolder();
    const keepCloud = cloudWithTakenName();
    const kept = await publish(keep.folderPath, keepCloud, "keep-cloud");
    expect(kept.result.published.map((file) => file.relativePath)).not.toContain("taken.md");
    expect(keepCloud.docs.get("taken.md")?.markdown).toContain("The cloud copy that must survive.");
    expect(keepCloud.deleted).toEqual([]);

    const suffix = await createFolder();
    const suffixCloud = cloudWithTakenName();
    const suffixed = await publish(suffix.folderPath, suffixCloud, "suffix");
    expect(suffixed.result.published.find((file) => file.relativePath === "taken.md")?.binding.cloudFilename).toBe("taken-local.md");
    expect(suffixCloud.docs.get("taken.md")?.markdown).toContain("The cloud copy that must survive.");
    expect(suffixCloud.docs.get("taken-local.md")?.markdown).toContain("Local text of a name the workspace already has.");
    expect(suffixCloud.deleted).toEqual([]);
  });

  test("the open file of a published folder resolves to the same shared-document info as a single shared file", async () => {
    const { folderPath } = await createFolder();
    const { folder } = await publish(folderPath, cloudWithTakenName());
    const profiles: DesktopSettings["profiles"] = [{ id: PROFILE_ID, name: "Team", url: "https://bloommd.test", tokenRef: "token-1" }];
    const settings: DesktopSettings = { profiles, sharedFolderBindings: [folder] };
    const nested = folder.files.find((file) => file.relativePath === "sub/b.md");
    if (!nested) throw new Error("sub/b.md was not published.");

    const match = findSharedLocalFile(settings, folderPath, "sub/b.md");
    expect(match?.kind).toBe("folder");
    if (!match) throw new Error("sub/b.md is not found.");
    const { folderShare, ...folderInfo } = sharedLocalFileInfo(settings, match, "sub/b.md");
    expect(folderShare).toEqual({ id: "folder-1", folderName: basename(folderPath) });

    const singleSettings: DesktopSettings = {
      profiles,
      sharedDocumentBindings: [{ localFilename: "sub/b.md", profileId: PROFILE_ID, binding: nested.binding }],
    };
    const single = findSharedLocalFile(singleSettings, folderPath, "sub/b.md");
    expect(single?.kind).toBe("file");
    if (!single) throw new Error("single share is not found.");
    expect(folderInfo).toEqual(sharedLocalFileInfo(singleSettings, single, "sub/b.md"));

    // Only published files belong to the share: the excluded, the conflicting and a foreign path do not.
    for (const other of ["skip/c.md", "taken.md", "notes.txt", "../outside.md"]) {
      expect(findSharedLocalFile(settings, folderPath, other)).toBeUndefined();
    }
    // A file shared on its own wins over a folder share of the same path; nothing is mirrored twice.
    const both = findSharedLocalFile({ ...settings, sharedDocumentBindings: singleSettings.sharedDocumentBindings }, folderPath, "sub/b.md");
    expect(both?.kind).toBe("file");
  });

  /** One published file as the desktop runs it: real file on disk, mirror, Y.Doc and sync provider. */
  async function connectFile(input: {
    folder: DesktopSharedFolderBinding;
    relativePath: string;
    serverUrl: string;
    cleanups: Array<() => void>;
  }) {
    const entry = input.folder.files.find((file) => file.relativePath === input.relativePath);
    if (!entry) throw new Error(`${input.relativePath} was not published.`);
    const path = join(input.folder.folderPath, input.relativePath);
    const desktopDoc = documentToYDoc(parseFile(input.relativePath, await readFile(path, "utf-8")));
    input.cleanups.push(() => desktopDoc.destroy());
    const calls = { published: 0 };
    const mirror = new SharedDocumentMirror({
      binding: entry.binding,
      hashMarkdown: hashSharedDocumentMarkdown,
      file: {
        readMarkdown: () => readFile(path, "utf-8"),
        writeMarkdown: (markdownValue) => writeFile(path, markdownValue),
      },
      publishLocalMarkdown: async (markdownValue, expectedCloudVersion) => {
        calls.published += 1;
        documentToYDoc(parseFile(input.relativePath, markdownValue), desktopDoc, ORIGIN);
        return { kind: "acknowledged", cloudVersion: expectedCloudVersion };
      },
    });
    let lastRemoteUpdateAt = Date.now();
    desktopDoc.on("update", (_update: Uint8Array, origin: unknown) => {
      if (origin === ORIGIN) return;
      lastRemoteUpdateAt = Date.now();
      void mirror.applyRemoteMarkdown(serializeToMarkdown(yDocToDocument(desktopDoc)), entry.binding.lastKnownCloudVersion);
    });
    const statuses: string[] = [];
    const provider = new SyncProvider({
      url: `${input.serverUrl}/ws/${entry.binding.documentId}`,
      doc: desktopDoc,
      onStatusChange: (status) => statuses.push(status),
      resyncIntervalMs: 10_000,
      connectionTimeoutMs: 10_000,
    });
    input.cleanups.push(() => provider.destroy());
    provider.connect();
    await waitFor(() => statuses.includes("connected"), `Provider for ${input.relativePath} did not connect.`);
    // The first sync is over once the provider has been quiet for a moment, so a local save cannot race it.
    const settled = () => waitFor(() => Date.now() - lastRemoteUpdateAt > 150, `${input.relativePath} did not finish its first sync.`);
    return { mirror, path, calls, documentId: entry.binding.documentId, settled };
  }

  test("changes flow both ways for files of a published folder, in the folder root and in a subfolder, without a watcher echo", async () => {
    const { folderPath } = await createFolder();
    const cloud = cloudWithTakenName();
    const { folder } = await publish(folderPath, cloud);
    const { server, rooms } = startSyncServer(cloud, cleanups);
    const serverUrl = server.url.toString().replace(/^http/, "ws").replace(/\/$/, "");

    for (const relativePath of ["a.md", "sub/b.md"]) {
      const file = await connectFile({ folder, relativePath, serverUrl, cleanups });
      const room = rooms.get(file.documentId);
      if (!room) throw new Error(`No room for ${relativePath}.`);
      await waitFor(() => room.clients.size === 1, `${relativePath} did not join its room.`);
      await file.settled();

      // Local → cloud: the watcher saw a save that is already on disk.
      const local = note(relativePath, `Local ${relativePath}`, "Written by the desktop file watcher.");
      await writeFile(file.path, local);
      expect(await file.mirror.handleLocalMarkdown(local)).toEqual({ kind: "published", cloudVersion: 1 });
      await waitFor(() => rootOf(room.yDoc).title === `Local ${relativePath}`, `${relativePath}: local update did not reach the sync room.`);

      // Cloud → local: a second participant edits the same document.
      const { rootId, content } = rootOf(room.yDoc);
      yUpdateContentDiff(room.yDoc, rootId, content, "Written by another collaborator.");
      await waitFor(() => rootOf(room.yDoc).content.includes("another collaborator"), "Collaborator edit missing on the server.");
      let mirrored = "";
      const deadline = Date.now() + 3_000;
      while (!mirrored.includes("Written by another collaborator.") && Date.now() < deadline) {
        mirrored = await readFile(file.path, "utf-8");
        await Bun.sleep(10);
      }
      expect(mirrored).toContain("Written by another collaborator.");

      // The write above comes back as a watcher event and must not become a second cloud mutation.
      expect(await file.mirror.handleLocalMarkdown(mirrored)).toEqual({ kind: "echo" });
      expect(file.calls.published).toBe(1);
    }

    // Documents of other files were not touched, and the conflicting name still has its cloud text.
    expect(cloud.docs.get("taken.md")?.markdown).toContain("The cloud copy that must survive.");
    expect([...rooms.keys()].length).toBe(2);
  });

  test("after the access is revoked nothing syncs any more and every local file stays complete and unchanged", async () => {
    const { folderPath, markdown } = await createFolder();
    const cloud = cloudWithTakenName();
    const { folder } = await publish(folderPath, cloud);
    const { server, rooms } = startSyncServer(cloud, cleanups);
    const serverUrl = server.url.toString().replace(/^http/, "ws").replace(/\/$/, "");
    const file = await connectFile({ folder, relativePath: "sub/b.md", serverUrl, cleanups });
    const room = rooms.get(file.documentId);
    if (!room) throw new Error("No room for sub/b.md.");
    await waitFor(() => room.clients.size === 1, "sub/b.md did not join its room.");
    await file.settled();

    const before = Object.fromEntries(await Promise.all(Object.keys(markdown).map(async (relativePath) => [relativePath, await readFile(join(folderPath, relativePath), "utf-8")])));
    const publishedBefore = (await scanFolderForPublication(folderPath)).map((entry) => entry.relativePath);

    // The server ends the access: the folder share stops and so does the running mirror of the open file.
    const stopped = markFolderRevoked(folder);
    expect(stopped.state).toBe("revoked");
    expect(stopped.files.map((entry) => entry.relativePath)).toEqual(folder.files.map((entry) => entry.relativePath));
    expect(stopped.files.every((entry) => entry.binding.connectionState === "revoked")).toBe(true);
    expect(stopped.files.map((entry) => entry.binding.cloudFilename)).toEqual(folder.files.map((entry) => entry.binding.cloudFilename));
    expect((await file.mirror.markAccessRevoked()).connectionState).toBe("revoked");

    // A collaborator keeps editing: the local file does not follow.
    const { rootId, content } = rootOf(room.yDoc);
    yUpdateContentDiff(room.yDoc, rootId, content, "Written after the access was revoked.");
    await Bun.sleep(150);
    expect(await readFile(file.path, "utf-8")).toBe(before["sub/b.md"] as string);
    expect(await file.mirror.applyRemoteMarkdown(note("sub/b.md", "Beta", "Written after the access was revoked."), 2)).toEqual({ kind: "revoked" });
    expect(await readFile(file.path, "utf-8")).toBe(before["sub/b.md"] as string);

    // A local edit stays local: no publish, the cloud copy keeps its text.
    const edited = note("sub/b.md", "Beta", "Edited locally after the revocation.");
    await writeFile(file.path, edited);
    expect(await file.mirror.handleLocalMarkdown(edited)).toEqual({ kind: "revoked" });
    expect(file.calls.published).toBe(0);
    expect(rootOf(room.yDoc).title).toBe("Beta");
    expect(await readFile(file.path, "utf-8")).toBe(edited);

    // Nothing was deleted anywhere: all other local files are byte-identical, the folder lists the same files, the cloud keeps its documents.
    for (const [relativePath, text] of Object.entries(before)) {
      if (relativePath === "sub/b.md") continue;
      expect(await readFile(join(folderPath, relativePath), "utf-8")).toBe(text);
    }
    expect((await scanFolderForPublication(folderPath)).map((entry) => entry.relativePath)).toEqual(publishedBefore);
    expect(cloud.deleted).toEqual([]);
    expect(cloud.filenames()).toEqual(["a.md", "sub__b.md", "taken.md"]);
  });
});
