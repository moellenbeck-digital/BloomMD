import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Window } from "happy-dom";
import type { Root } from "react-dom/client";
import { FileStore } from "@bloommd/core";
import { isWorkspaceMindMap, parseFile } from "@bloommd/core/browser";

// React DOM decides at import time whether `input` events exist, so a DOM must be installed before
// react-dom is loaded; hence the dynamic imports.
let win = new Window({ url: "https://bloommd.test/desktop" });
globalThis.window = win as unknown as typeof window;
globalThis.document = win.document as unknown as Document;
globalThis.localStorage = win.localStorage;
globalThis.navigator = win.navigator as unknown as Navigator;
globalThis.HTMLElement = win.HTMLElement as unknown as typeof HTMLElement;
globalThis.HTMLInputElement = win.HTMLInputElement as unknown as typeof HTMLInputElement;
globalThis.HTMLSelectElement = win.HTMLSelectElement as unknown as typeof HTMLSelectElement;
globalThis.requestAnimationFrame = (callback) => setTimeout(() => callback(0), 0) as unknown as number;
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);

const React = await import("react");
const { act } = React;
const { createRoot } = await import("react-dom/client");
const ui = await import("@bloommd/ui");

let directory: string;
let disk: FileStore;
let root: Root | null = null;
let container: HTMLDivElement;
let createdFilename = "";
let createdMarkdown = "";
// Disk reads the App started and the test did not wait for; they must finish before the directory is removed.
const pendingDiskReads = new Set<Promise<unknown>>();
function tracked<T>(read: Promise<T>): Promise<T> {
  pendingDiskReads.add(read);
  const forget = () => pendingDiskReads.delete(read);
  read.then(forget, forget);
  return read;
}
const actEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };

// The real App, Toolbar and dialog run; only canvas rendering and native RPC are replaced.
mock.module("@bloommd/ui", () => ({
  ...ui,
  MindMapCanvas: () => React.createElement("div", { id: "mindmap-canvas", tabIndex: 0 }),
  ResizableEditor: () => null,
}));
mock.module("./rpc", () => ({
  listMindmaps: async () => ({ files: await tracked(disk.list()) }),
  openWorkspace: async () => {
    const doc = await tracked(disk.readWorkspaceMindMap());
    return { ...doc, nodes: Object.fromEntries(doc.nodes) };
  },
  openMindmap: async (filename: string) => {
    const doc = await tracked(disk.read(filename));
    return { ...doc, nodes: Object.fromEntries(doc.nodes) };
  },
  createMindmap: async (filename: string, markdown: string) => {
    const doc = parseFile(join(directory, filename), markdown);
    await disk.write(doc);
    createdFilename = filename;
    createdMarkdown = markdown;
    return { ...doc, nodes: Object.fromEntries(doc.nodes) };
  },
  listTemplates: async () => ({ templates: await tracked(disk.readTemplates()) }),
  listFolders: async () => ({ folders: await tracked(disk.listFolders()) }),
  chooseDirectory: async () => ({ path: directory }),
  consumeExternalFile: async () => ({ kind: "folder", filename: null }),
  getConnectionMode: async () => ({ type: "local" }),
  listConnectionProfiles: async () => ({ profiles: [], active: { type: "local" } }),
  getSharedDocument: async () => ({ sharedDocument: null }),
  getBuildInfo: async () => null,
  getUpdateState: async () => ({ local: { channel: "dev" }, update: {} }),
  setApplicationLocale: async () => {},
  recordE2EState: async () => {},
  serializeMindmap: async () => ({ markdown: "" }),
  saveMindmap: async () => ({ success: true }),
  onFileChanged: () => {}, onConnectionModeChanged: () => {}, onExternalFileOpened: () => {}, onAboutRequested: () => {}, onUpdateStatus: () => {},
  chooseResourceFile: () => {}, importFile: () => {}, createFolder: () => {}, deleteMindmap: () => {}, renameMindmap: () => {},
  saveConnectionProfile: () => {}, connectProfile: () => {}, useLocalConnection: () => {}, deleteConnectionProfile: () => {}, setConnectionProfileWorkspace: () => {},
  listRemoteWorkspaces: () => {}, selectRemoteWorkspace: () => {}, getSyncTicket: () => {}, getSharedSyncTicket: () => {}, listProfileWorkspaces: () => {},
  shareLocalMindmap: () => {}, unshareLocalMindmap: () => {}, updateSharedDocumentBinding: () => {}, readResource: () => {}, fetchLinkPreview: () => {}, openExternalUrl: () => {},
  submitFeedback: () => {}, checkForUpdate: () => {}, downloadUpdate: () => {}, applyUpdate: () => {},
}));
const { App } = await import("./App");

async function waitFor(condition: () => boolean) {
  const deadline = Date.now() + 3000;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("Timed out waiting for desktop flow");
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 5)); });
  }
}
const byId = <T extends HTMLElement>(id: string) => container.querySelector<T>(`[data-testid="${id}"]`);
async function click(id: string) {
  const element = byId<HTMLButtonElement>(id);
  expect(element).not.toBeNull();
  await act(async () => { element!.click(); });
}
async function setValue(element: HTMLInputElement | HTMLSelectElement, value: string, event: "input" | "change") {
  await act(async () => {
    const prototype = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(element, value);
    element.dispatchEvent(new win.Event(event, { bubbles: true }) as unknown as Event);
  });
}

beforeEach(async () => {
  actEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
  directory = await mkdtemp(join(tmpdir(), "bloommd-template-flow-"));
  disk = new FileStore({ baseDir: directory, backupsEnabled: false });
  await disk.write(parseFile(join(directory, "existing.md"), "# Existing\n"));
  createdFilename = "";
  createdMarkdown = "";
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root!.render(React.createElement(App)); });
  await waitFor(() => isWorkspaceMindMap(ui.useMindMapStore.getState().document) && Boolean(byId("toolbar-create-from-template")));
});
afterEach(async () => {
  await act(async () => { root?.unmount(); });
  root = null;
  ui.useMindMapStore.getState().setDocument(null);
  actEnvironment.IS_REACT_ACT_ENVIRONMENT = false;
  await Promise.allSettled([...pendingDiskReads]);
  await rm(directory, { recursive: true, force: true });
});

test("Neu aus Vorlage creates a file from a built-in template and opens it", async () => {
  await click("toolbar-create-from-template");
  await waitFor(() => Boolean(byId("create-entry-dialog")));
  const select = byId<HTMLSelectElement>("create-entry-template")!;
  expect(select.value).toBe("");
  await setValue(select, "cornell", "change");
  await setValue(byId<HTMLInputElement>("create-entry-name")!, "Biologie 1", "input");
  await click("create-entry-submit");
  await waitFor(() => createdFilename === "Biologie 1.md");

  const doc = parseFile("Biologie 1.md", createdMarkdown);
  expect(doc.frontmatter.title).toBe("Biologie 1");
  expect([...doc.nodes.values()].map((node) => node.title)).toEqual(["Biologie 1", "Stichwörter", "Notizen", "Zusammenfassung"]);
  expect(createdMarkdown).not.toContain("{{");
  // The store adds node ids when it writes the file, so compare the structure, not the text.
  const onDisk = parseFile("Biologie 1.md", await readFile(join(directory, "Biologie 1.md"), "utf8"));
  expect([...onDisk.nodes.values()].map((node) => node.title)).toEqual(["Biologie 1", "Stichwörter", "Notizen", "Zusammenfassung"]);
  await waitFor(() => !isWorkspaceMindMap(ui.useMindMapStore.getState().document));
});

test("the template list includes own templates from Vorlagen/, filled with title and date", async () => {
  await mkdir(join(directory, "Vorlagen"));
  await writeFile(join(directory, "Vorlagen", "Wochenplan.md"), "# {{title}}\n\nStand {{date}} {{andere}}\n");
  await click("toolbar-create-from-template");
  await waitFor(() => Boolean(byId("create-entry-dialog")));
  await waitFor(() => (byId<HTMLSelectElement>("create-entry-template")?.options.length ?? 0) === 7);
  const select = byId<HTMLSelectElement>("create-entry-template")!;
  expect(Array.from(select.options).at(-1)?.textContent).toBe("Wochenplan");
  await setValue(select, "custom:Vorlagen/Wochenplan.md", "change");
  await setValue(byId<HTMLInputElement>("create-entry-name")!, "KW 44", "input");
  await click("create-entry-submit");
  await waitFor(() => createdFilename === "KW 44.md");
  expect(createdMarkdown).toMatch(/# KW 44\n\nStand \d{4}-\d{2}-\d{2} \{\{andere\}\}\n$/);
});

test("without a template the new file is the usual blank one", async () => {
  await click("toolbar-create-from-template");
  await waitFor(() => Boolean(byId("create-entry-dialog")));
  await setValue(byId<HTMLInputElement>("create-entry-name")!, "Leer", "input");
  await click("create-entry-submit");
  await waitFor(() => createdFilename === "Leer.md");
  const doc = parseFile("Leer.md", createdMarkdown);
  expect([...doc.nodes.values()].map((node) => node.title)).toEqual(["Leer"]);
});
