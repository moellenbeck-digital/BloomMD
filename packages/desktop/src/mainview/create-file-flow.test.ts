import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import { mkdtemp, readFile, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import React from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { Window } from "happy-dom";
import { FileStore } from "@bloommd/core";
import { isWorkspaceMindMap, parseFile, serializeToMarkdown, type MindMapDocument } from "@bloommd/core/browser";
import * as ui from "@bloommd/ui";

// Exercise the real App, Toolbar and Yjs store; only canvas rendering and native RPC are replaced.
mock.module("@bloommd/ui", () => ({
  ...ui,
  MindMapCanvas: () => React.createElement("div", { id: "mindmap-canvas", tabIndex: 0 }),
  ResizableEditor: () => null,
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
function wire(doc: MindMapDocument) { return { ...doc, nodes: Object.fromEntries(doc.nodes) }; }
let directory: string;
let disk: FileStore;
let fileChanged: (filename: string) => void;
let delayedWorkspace: ReturnType<typeof deferred<ReturnType<typeof wire>>> | null;
let workspaceReadStarted = false;
let delayedCreation: ReturnType<typeof deferred<void>> | null = null;
let createWritten = false;
let workspaceReads = 0;
let createdFilename = "";
let saves = 0;
let openedFiles = 0;
let root: Root | null = null;
let container: HTMLDivElement;
let win: Window;
const pendingLists = new Set<Promise<unknown>>();

mock.module("./rpc", () => ({
  listMindmaps: async () => {
    const request = disk.list();
    pendingLists.add(request);
    try { return { files: await request }; }
    finally { pendingLists.delete(request); }
  },
  openWorkspace: async () => {
    workspaceReads += 1;
    const snapshot = wire(await disk.readWorkspaceMindMap());
    if (delayedWorkspace) {
      workspaceReadStarted = true;
      return delayedWorkspace.promise;
    }
    return snapshot;
  },
  openMindmap: async (filename: string) => { openedFiles += 1; return wire(await disk.read(filename)); },
  createMindmap: async (filename: string, markdown: string) => {
    const doc = parseFile(join(directory, filename), markdown);
    await disk.write(doc);
    createdFilename = filename;
    createWritten = true;
    if (delayedCreation) await delayedCreation.promise;
    return wire(doc);
  },
  serializeMindmap: async (doc: ReturnType<typeof wire>) => ({ markdown: serializeToMarkdown({ ...doc, nodes: new Map(Object.entries(doc.nodes)) }) }),
  saveMindmap: async (path: string, markdown: string) => {
    await disk.write(parseFile(path, markdown));
    saves += 1;
    return { success: true };
  },
  renameMindmap: async (oldFilename: string, newFilename: string) => {
    await rename(join(directory, oldFilename), join(directory, newFilename));
    createdFilename = newFilename;
    return { success: true, newFilename, newFilePath: join(directory, newFilename) };
  },
  onFileChanged: (callback: typeof fileChanged) => { fileChanged = callback; },
  chooseDirectory: async () => ({ path: directory }),
  consumeExternalFile: async () => ({ kind: "folder", filename: null }),
  getConnectionMode: async () => ({ type: "local" }),
  listConnectionProfiles: async () => ({ profiles: [], active: { type: "local" } }),
  listFolders: async () => ({ folders: [] }),
  listTemplates: async () => ({ templates: [] }),
  getSharedDocument: async () => ({ sharedDocument: null }),
  getBuildInfo: async () => null,
  getUpdateState: async () => ({ local: { channel: "dev" }, update: {} }),
  setApplicationLocale: async () => {},
  recordE2EState: async () => {},
  onConnectionModeChanged: () => {}, onExternalFileOpened: () => {}, onAboutRequested: () => {}, onUpdateStatus: () => {},
  chooseResourceFile: () => {}, importFile: () => {}, createFolder: () => {}, deleteMindmap: () => {},
  saveConnectionProfile: () => {}, connectProfile: () => {}, useLocalConnection: () => {}, deleteConnectionProfile: () => {}, setConnectionProfileWorkspace: () => {},
  listRemoteWorkspaces: () => {}, selectRemoteWorkspace: () => {}, getSyncTicket: () => {}, getSharedSyncTicket: () => {}, listProfileWorkspaces: () => {},
  shareLocalMindmap: () => {}, unshareLocalMindmap: () => {}, updateSharedDocumentBinding: () => {}, readResource: () => {}, fetchLinkPreview: () => {}, openExternalUrl: () => {},
  submitFeedback: () => {}, checkForUpdate: () => {}, downloadUpdate: () => {}, applyUpdate: () => {},
}));
const { App } = await import("./App");

async function waitFor(condition: () => boolean) {
  const deadline = Date.now() + 2000;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("Timed out waiting for desktop flow");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
function click(id: string) {
  const button = container.querySelector<HTMLButtonElement>(`[data-testid="${id}"]`);
  expect(button).not.toBeNull();
  flushSync(() => button!.click());
}
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "bloommd-create-flow-"));
  disk = new FileStore({ baseDir: directory, backupsEnabled: false });
  await disk.write(parseFile(join(directory, "existing.md"), "# Existing\n"));
  ui.useMindMapStore.getState().setStatusMessage(null);
  delayedWorkspace = null;
  workspaceReadStarted = false;
  delayedCreation = null;
  createWritten = false;
  workspaceReads = 0;
  createdFilename = "";
  saves = 0;
  openedFiles = 0;
  win = new Window({ url: "https://bloommd.test/desktop" });
  globalThis.window = win as unknown as typeof window;
  globalThis.document = win.document as unknown as Document;
  globalThis.localStorage = win.localStorage;
  globalThis.navigator = win.navigator as unknown as Navigator;
  globalThis.HTMLElement = win.HTMLElement as unknown as typeof HTMLElement;
  globalThis.requestAnimationFrame = (callback) => setTimeout(() => callback(0), 0) as unknown as number;
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  flushSync(() => root!.render(React.createElement(App)));
  await waitFor(() => isWorkspaceMindMap(ui.useMindMapStore.getState().document) && Boolean(container.querySelector('[data-testid="toolbar-new"]')));
});
afterEach(async () => {
  if (root) flushSync(() => root?.unmount());
  root = null;
  ui.useMindMapStore.getState().setDocument(null);
  await Promise.all(pendingLists);
  await rm(directory, { recursive: true, force: true });
  await win.happyDOM.close();
});

test("folder → create file → nodes → save keeps the file active despite a late workspace refresh", async () => {
  delayedWorkspace = deferred();
  const staleWorkspace = wire(await disk.readWorkspaceMindMap());
  fileChanged("existing.md");
  await waitFor(() => workspaceReadStarted);
  click("toolbar-new");
  await waitFor(() => Boolean(createdFilename) && !isWorkspaceMindMap(ui.useMindMapStore.getState().document));
  delayedWorkspace.resolve(staleWorkspace);
  await new Promise((resolve) => setTimeout(resolve, 30));
  expect(isWorkspaceMindMap(ui.useMindMapStore.getState().document)).toBe(false);
  const store = ui.useMindMapStore.getState();
  const doc = store.document!;
  flushSync(() => {
    for (const title of ["Rolle", "Name", "Icon"]) expect(store.addChildNode(doc.rootId, title)).not.toBeNull();
  });
  click("toolbar-save");
  await waitFor(() => saves === 1 && Boolean(container.querySelector("[data-testid=toolbar-save] .lucide-check")));
  const markdown = await readFile(join(directory, createdFilename), "utf8");
  const restored = parseFile(createdFilename, markdown);
  expect([...restored.nodes.values()].map((node) => node.title)).toEqual([doc.frontmatter.title, "Rolle", "Name", "Icon"]);
});

test("a delayed watcher notification for the newly created file preserves nodes entered before saving", async () => {
  click("toolbar-new");
  await waitFor(() => Boolean(createdFilename) && !isWorkspaceMindMap(ui.useMindMapStore.getState().document));
  const store = ui.useMindMapStore.getState();
  const doc = store.document!;
  flushSync(() => {
    for (const title of ["Rolle", "Name", "Icon"]) store.addChildNode(doc.rootId, title);
  });
  fileChanged(createdFilename);
  await waitFor(() => openedFiles > 0);
  await new Promise((resolve) => setTimeout(resolve, 30));
  expect(ui.useMindMapStore.getState().document!.nodes.size).toBe(4);
  click("toolbar-save");
  await waitFor(() => saves === 1 && Boolean(container.querySelector("[data-testid=toolbar-save] .lucide-check")));
  const markdown = await readFile(join(directory, createdFilename), "utf8");
  expect([...parseFile(createdFilename, markdown).nodes.values()].map((node) => node.title)).toEqual([doc.frontmatter.title, "Rolle", "Name", "Icon"]);
});

test("a watcher event between creating the file on disk and receiving the RPC response cannot reopen the workspace", async () => {
  delayedCreation = deferred<void>();
  click("toolbar-new");
  await waitFor(() => createWritten);
  const previousReads = workspaceReads;
  fileChanged(createdFilename);
  await new Promise((resolve) => setTimeout(resolve, 30));
  expect(workspaceReads).toBe(previousReads);
  delayedCreation.resolve();
  await waitFor(() => !isWorkspaceMindMap(ui.useMindMapStore.getState().document));
  expect(ui.useMindMapStore.getState().document!.filePath).toBe(join(directory, createdFilename));
  expect(ui.useMindMapStore.getState().readOnly).toBe(false);
});

test("actual external edits still reload a clean document but cannot overwrite unsaved nodes", async () => {
  click("toolbar-new");
  await waitFor(() => Boolean(createdFilename) && !isWorkspaceMindMap(ui.useMindMapStore.getState().document));
  const doc = ui.useMindMapStore.getState().document!;
  const filePath = doc.filePath;
  const external = parseFile(filePath, serializeToMarkdown(doc) + "\n## External\n");
  await disk.write(external);
  fileChanged(createdFilename);
  await waitFor(() => ui.useMindMapStore.getState().document!.nodes.size === 2);
  flushSync(() => ui.useMindMapStore.getState().addChildNode(doc.rootId, "Local unsaved"));
  const externallyChanged = parseFile(filePath, serializeToMarkdown(external) + "\n## Another external edit\n");
  await disk.write(externallyChanged);
  fileChanged(createdFilename);
  await waitFor(() => Boolean(ui.useMindMapStore.getState().statusMessage));
  const current = ui.useMindMapStore.getState().document!;
  const currentRoot = current.nodes.get(current.rootId)!;
  expect(current.nodes.size).toBe(3);
  expect(currentRoot.title).toBe(doc.frontmatter.title);
  expect(currentRoot.children.map((id) => current.nodes.get(id)!.title)).toEqual(["External", "Local unsaved"]);
  expect(saves).toBe(0);
  const onDisk = parseFile(filePath, await readFile(filePath, "utf8"));
  expect([...onDisk.nodes.values()].map((node) => node.title)).toEqual([doc.frontmatter.title, "External", "Another external edit"]);
});

test("choose an empty folder → create file → add nodes → save writes every heading", async () => {
  await rm(join(directory, "existing.md"));
  click("file-browser-toggle");
  click("change-folder");
  await waitFor(() => Boolean(container.querySelector('[data-testid="empty-workspace"]')));
  click("toolbar-new");
  await waitFor(() => Boolean(createdFilename) && Boolean(ui.useMindMapStore.getState().document));
  const store = ui.useMindMapStore.getState();
  const doc = store.document!;
  flushSync(() => {
    for (const title of ["Rolle", "Name", "Icon"]) expect(store.addChildNode(doc.rootId, title)).not.toBeNull();
  });
  click("toolbar-save");
  await waitFor(() => saves === 1 && Boolean(container.querySelector("[data-testid=toolbar-save] .lucide-check")));
  const restored = await disk.read(createdFilename);
  expect([...restored.nodes.values()].map((node) => node.title)).toEqual([doc.frontmatter.title, "Rolle", "Name", "Icon"]);
});
