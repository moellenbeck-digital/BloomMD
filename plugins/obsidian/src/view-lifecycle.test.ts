// Runs in its own `bun test` process (see the test script): it mocks the "obsidian" module, which other test files may already have loaded.
import { afterEach, beforeAll, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import { readFileSync } from "node:fs";
import { act } from "preact/test-utils";
import * as client from "preact/compat/client";
import { installCanvasDom, resetPane } from "./canvas-test-env";

/**
 * Drives the real BloomMDView and the plugin's open path (`Visualize current note`) against a small
 * stand-in for Obsidian: leaves that create the view and call onOpen, a vault with the demo note and
 * the DOM helpers Obsidian adds. Every way the open can fail must end in a visible error state with
 * Back to Markdown, never in an empty pane.
 */

class FakeFile {
  extension: string;
  basename: string;
  parent: FakeFolder | null = null;
  constructor(readonly path: string) {
    const name = path.split("/").pop() ?? path;
    this.extension = name.split(".").pop() ?? "";
    this.basename = name.replace(/\.[^.]+$/, "");
  }
}
class FakeFolder {
  children: unknown[] = [];
  constructor(readonly path: string) {}
}
class FakeMarkdownView {
  file: FakeFile | null = null;
}

const demoPath = "Aufnahmen/Obsidian Demo.md";
const demoMarkdown = readFileSync(new URL("../../../test-vault/Aufnahmen/Obsidian Demo.md", import.meta.url), "utf8");

const notices: string[] = [];
const wait = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));
let failCreateRoot = false;
let main: typeof import("./main");

beforeAll(async () => {
  installCanvasDom();
  class ItemView {
    contentEl = document.createElement("div");
    app: unknown;
    constructor(public leaf: unknown) {}
    registerEvent() {}
  }
  class Plugin {}
  const Base = class {};
  mock.module("obsidian", () => ({
    ItemView,
    Plugin,
    MarkdownView: FakeMarkdownView,
    TFile: FakeFile,
    TFolder: FakeFolder,
    Notice: class {
      constructor(message: string) {
        notices.push(message);
      }
    },
    Platform: { isMobile: false, isMacOS: false },
    Component: class { load() {} unload() {} },
    MarkdownRenderer: { render: () => Promise.resolve() },
    Menu: Base,
    Modal: Base,
    SuggestModal: Base,
    FuzzySuggestModal: Base,
    PluginSettingTab: Base,
    Setting: Base,
    App: Base,
    WorkspaceLeaf: Base,
    FileSystemAdapter: Base,
    ConfirmationModal: Base,
    Keymap: { isModifier: () => false },
    editorLivePreviewField: {},
    getLanguage: () => "en",
    setIcon: () => {},
  }));
  // The canvas mount is created through react-dom/client; a test can make it fail.
  mock.module("react-dom/client", () => ({
    ...client,
    createRoot: (...args: Parameters<typeof client.createRoot>) => {
      if (failCreateRoot) throw new Error("createRoot failed");
      return client.createRoot(...args);
    },
  }));
  main = await import("./main");
});

beforeEach(() => {
  notices.length = 0;
  failCreateRoot = false;
  resetPane();
});

afterEach(() => {
  document.body.replaceChildren();
});

type FakeLeaf = { view: unknown; detached: boolean; setViewState(state: { type: string }): Promise<void>; detach(): void; loadIfDeferred(): Promise<void> };

function setup(options: { readError?: Error; processError?: Error; setViewStateError?: Error; noMarkdownOpen?: boolean } = {}) {
  const demo = new FakeFile(demoPath);
  const folder = new FakeFolder("Aufnahmen");
  demo.parent = folder;
  folder.children = [demo];
  let content = demoMarkdown;
  const writes: string[] = [];
  const leaves: FakeLeaf[] = [];
  const revealed: unknown[] = [];
  const markdownLeaf = Object.assign(new FakeMarkdownView(), { file: demo });
  const plugin = Object.create(main.default.prototype) as InstanceType<typeof main.default> & Record<string, unknown>;
  const app = {
    vault: {
      getAbstractFileByPath: (path: string) => (path === demoPath ? demo : null),
      process: async (_file: FakeFile, change: (current: string) => string) => {
        if (options.processError) throw options.processError;
        const next = change(content);
        writes.push(next);
        content = next;
        return content;
      },
      read: async () => {
        if (options.readError) throw options.readError;
        return content;
      },
      cachedRead: async () => content,
      on: () => ({}),
    },
    metadataCache: { on: () => ({}), getFileCache: () => null, getFirstLinkpathDest: () => null, resolvedLinks: {} },
    workspace: {
      rootSplit: {},
      getLeavesOfType: (type: string) => (type === "bloommd-mindmap-view" ? leaves.filter((leaf) => !leaf.detached) : []),
      getActiveViewOfType: () => (options.noMarkdownOpen ? null : markdownLeaf),
      getMostRecentLeaf: () => (options.noMarkdownOpen ? null : { view: markdownLeaf }),
      getLeaf: () => {
        const leaf: FakeLeaf = {
          view: null,
          detached: false,
          async setViewState(state) {
            if (options.setViewStateError) throw options.setViewStateError;
            if (state.type !== "bloommd-mindmap-view") return;
            const view = new main.BloomMDView(leaf as never, plugin);
            (view as unknown as { app: unknown }).app = app;
            leaf.view = view;
            await view.onOpen();
            document.body.appendChild(view.contentEl);
          },
          detach() {
            leaf.detached = true;
          },
          async loadIfDeferred() {},
        };
        leaves.push(leaf);
        return leaf;
      },
      revealLeaf: async (leaf: unknown) => void revealed.push(leaf),
    },
  };
  Object.assign(plugin, {
    app,
    settings: { showNodeContent: true, learning: { enabled: false }, mobileAppInstalled: false },
    layouts: {},
    sharedDocumentBindings: [],
    sharedDocumentSessions: new Map(),
    agent: { changedNodes: async () => new Set<string>() },
    saveData: async () => {},
  });
  const opened: unknown[] = [];
  plugin.openMarkdownFile = (async (file: unknown) => void opened.push(file)) as never;
  return { plugin, app, demo, leaves, revealed, opened, writes, content: () => content, setContent: (next: string) => void (content = next), openView: () => leaves[0]?.view as InstanceType<typeof main.BloomMDView> | undefined };
}

const settle = async () => act(() => wait(120));
const alertOf = (el: HTMLElement) => el.querySelector('[role="alert"]');
const buttonOf = (el: HTMLElement, label: string) => [...el.querySelectorAll("button")].find((button) => button.textContent === label) as HTMLButtonElement | undefined;
const nodesOf = (el: HTMLElement) => el.querySelectorAll(".react-flow__node").length;
const silenced = async <T>(run: () => Promise<T>) => {
  const spy = spyOn(console, "error").mockImplementation(() => {});
  try {
    return await run();
  } finally {
    spy.mockRestore();
  }
};

describe("Visualize current note", () => {
  test("renders the demo note as a mind map: root plus its heading branches", async () => {
    const { plugin, openView, revealed } = setup();
    await plugin.visualizeCurrentNote();
    await settle();
    const view = openView()!;
    expect(alertOf(view.contentEl)).toBeNull();
    expect(nodesOf(view.contentEl)).toBe(8);
    expect(view.contentEl.textContent).toContain("Obsidian Demo");
    expect(revealed).toHaveLength(1);
  });

  test("a failing load shows the error state with Back to Markdown instead of an empty pane", async () => {
    const { plugin, openView, opened, demo } = setup({ readError: new Error("Vault is read-only") });
    await silenced(() => plugin.visualizeCurrentNote());
    await settle();
    const view = openView()!;
    expect(alertOf(view.contentEl)?.textContent).toContain("Vault is read-only");
    expect(nodesOf(view.contentEl)).toBe(0);
    act(() => buttonOf(view.contentEl, "Back to Markdown")!.click());
    await settle();
    expect(opened).toEqual([demo]);
  });

  test("Try again loads the note again and replaces the error with the map", async () => {
    const env = setup({ readError: new Error("Vault is read-only") });
    await silenced(() => env.plugin.visualizeCurrentNote());
    await settle();
    const view = env.openView()!;
    expect(alertOf(view.contentEl)).not.toBeNull();
    env.app.vault.read = async () => demoMarkdown;
    act(() => buttonOf(view.contentEl, "Try again")!.click());
    await settle();
    expect(alertOf(view.contentEl)).toBeNull();
    expect(nodesOf(view.contentEl)).toBe(8);
  });

  test("a view that cannot be created reports it in a notice and leaves no empty pane behind", async () => {
    const { plugin, leaves } = setup({ setViewStateError: new Error("no view for you") });
    await silenced(() => plugin.visualizeCurrentNote());
    expect(notices.join("\n")).toContain("no view for you");
    expect(leaves.every((leaf) => leaf.detached)).toBe(true);
  });

  test("uses a restored deferred leaf instead of splitting another one", async () => {
    const { plugin, app, leaves } = setup();
    // A map restored with the workspace: its view is only created once the leaf is loaded.
    const restored: FakeLeaf = { view: null, detached: false, setViewState: async () => {}, detach() {}, loadIfDeferred: async () => {} };
    restored.loadIfDeferred = async () => {
      const view = new main.BloomMDView(restored as never, plugin);
      (view as unknown as { app: unknown }).app = app;
      restored.view = view;
      await view.onOpen();
      document.body.appendChild(view.contentEl);
    };
    leaves.push(restored);
    await plugin.visualizeCurrentNote();
    await settle();
    expect(leaves).toHaveLength(1);
    expect(nodesOf((restored.view as InstanceType<typeof main.BloomMDView>).contentEl)).toBe(8);
  });
});

describe("opening the view", () => {
  test("a mount that cannot be created leaves the message and Back to Markdown in the pane", async () => {
    failCreateRoot = true;
    const { plugin, openView, opened, demo } = setup();
    await silenced(() => plugin.visualizeCurrentNote());
    await settle();
    const view = openView()!;
    expect(alertOf(view.contentEl)?.textContent).toContain("createRoot failed");
    act(() => buttonOf(view.contentEl, "Back to Markdown")!.click());
    await settle();
    expect(opened).toEqual([demo]);
  });

  test("an error while rendering the first frame is shown instead of leaving the pane empty", async () => {
    const { plugin, openView } = setup();
    plugin.markdownFiles = (() => { throw new Error("file list broke"); }) as never;
    await silenced(() => plugin.visualizeCurrentNote());
    await settle();
    expect(alertOf(openView()!.contentEl)?.textContent).toContain("file list broke");
    expect(buttonOf(openView()!.contentEl, "Back to Markdown")).toBeDefined();
  });

  test("a view without a note says so; Back to Markdown goes to the note open elsewhere", async () => {
    const { plugin, openView, opened, demo } = setup();
    await plugin.app.workspace.getLeaf().setViewState({ type: "bloommd-mindmap-view" });
    await settle();
    const view = openView()!;
    expect(view.contentEl.textContent).toContain("No note is open in this map");
    act(() => buttonOf(view.contentEl, "Back to Markdown")!.click());
    await settle();
    expect(opened).toEqual([demo]);
  });

  test("with no Markdown note open anywhere, Back to Markdown closes the empty map", async () => {
    const { plugin, leaves, openView } = setup({ noMarkdownOpen: true });
    await plugin.app.workspace.getLeaf().setViewState({ type: "bloommd-mindmap-view" });
    await settle();
    act(() => buttonOf(openView()!.contentEl, "Back to Markdown")!.click());
    await settle();
    expect(leaves[0]!.detached).toBe(true);
  });

  test("a note without headings offers Back to Markdown", async () => {
    const { plugin, openView, demo } = setup();
    await plugin.visualizeCurrentNote();
    await settle();
    const view = openView()!;
    view.setNote(demo as never, "Just text, no headings.\n");
    await settle();
    expect(view.contentEl.textContent).toContain("No Markdown headings found");
    expect(buttonOf(view.contentEl, "Back to Markdown")).toBeDefined();
  });
});

/** What the map shows for the note: the headings with the ids the canvas works with. */
type Headings = Array<{ id: string; title: string; kind: string }>;
type Actions = {
  renameNode(id: string, title: string, expectedTitle: string): Promise<boolean>;
  undo(selectedId: string | null): Promise<string | null>;
};
const propsOf = (view: unknown) => (view as { canvasProps(): { headings: Headings; actions: Actions; canUndo: boolean } }).canvasProps();
const headingIds = (markdown: string) => [...markdown.matchAll(/^#{1,6} .*<!-- bloommd:id=([0-9a-f]+) -->$/gm)].map((match) => match[1]);

describe("opening a map leaves the note as it is", () => {
  test("Visualize current note (and the M key / header button path) does not write to the note", async () => {
    const { plugin, writes, content, openView, demo } = setup();
    await plugin.visualizeCurrentNote();
    await settle();
    expect(openView()!.contentEl.textContent).toContain("Obsidian Demo");
    expect(writes).toEqual([]);
    expect(content()).toBe(demoMarkdown);

    // The navigator opens a map of a note through the same load: byte-identical again.
    await plugin.openMapFor(demo as never);
    await settle();
    expect(writes).toEqual([]);
    expect(content()).toBe(demoMarkdown);
    expect(nodesOf(openView()!.contentEl)).toBe(8);
  });

  test("a change made outside BloomMD while the map is open is read, not rewritten", async () => {
    const { plugin, writes, content, setContent, openView, demo } = setup();
    await plugin.visualizeCurrentNote();
    await settle();
    const changed = `${demoMarkdown}\n## Neu von aussen\n`;
    setContent(changed);
    await openView()!.handleFileChange(demo as never);
    await settle();
    expect(writes).toEqual([]);
    expect(content()).toBe(changed);
    expect(propsOf(openView()).headings.some((heading) => heading.title === "Neu von aussen")).toBe(true);
  });

  test("the ids the map shows are the same every time the note is opened", async () => {
    const { plugin, openView } = setup();
    await plugin.visualizeCurrentNote();
    await settle();
    const first = propsOf(openView()).headings.map((heading) => heading.id);
    await plugin.visualizeCurrentNote();
    await settle();
    expect(propsOf(openView()).headings.map((heading) => heading.id)).toEqual(first);
    expect(new Set(first).size).toBe(first.length);
  });

  test("the first edit writes the ids the map already showed; undo keeps them", async () => {
    const { plugin, writes, content, openView } = setup();
    await plugin.visualizeCurrentNote();
    await settle();
    const shown = propsOf(openView()).headings.filter((heading) => heading.kind === "heading");
    const project = shown.find((heading) => heading.title === "Projekt")!;
    expect(writes).toEqual([]);

    expect(await propsOf(openView()).actions.renameNode(project.id, "Vorhaben", "Projekt")).toBe(true);
    await settle();
    expect(writes).toHaveLength(1);
    const written = content();
    expect(written).toContain("## Vorhaben <!-- bloommd:id=");
    expect(headingIds(written)).toEqual(shown.map((heading) => heading.id));
    expect(propsOf(openView()).headings.filter((heading) => heading.kind === "heading").map((heading) => heading.id)).toEqual(shown.map((heading) => heading.id));
    expect(propsOf(openView()).canUndo).toBe(true);

    const focus = await propsOf(openView()).actions.undo(project.id);
    await settle();
    expect(focus).toBe(project.id);
    expect(content()).toContain("## Projekt <!-- bloommd:id=");
    expect(headingIds(content())).toEqual(shown.map((heading) => heading.id));
  });
});
