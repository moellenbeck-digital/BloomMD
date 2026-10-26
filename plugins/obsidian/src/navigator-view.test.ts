// Runs in its own `bun test` process (see the test script): it mocks the "obsidian" module, which other test files may already have loaded.
import { beforeAll, describe, expect, mock, test } from "bun:test";
import { LONG_NAME, vault } from "./navigator-fixture";
import type { SourceEntry } from "./navigator-model";

/**
 * Renders the real NavigatorView against a small stand-in for Obsidian: the DOM helpers Obsidian adds
 * to elements, an ItemView base and a vault built from the shared fixture. It checks what a person
 * would see and do (rows, clicks, keys) without a running Obsidian.
 */

class FakeAbstract {
  constructor(readonly path: string, readonly name: string) {}
}
class FakeFile extends FakeAbstract {
  extension: string;
  constructor(path: string, name: string) {
    super(path, name);
    this.extension = name.split(".").pop() ?? "";
  }
}
class FakeFolder extends FakeAbstract {
  children: FakeAbstract[] = [];
}

function toFake(entry: SourceEntry): FakeAbstract {
  if (!entry.children) return new FakeFile(entry.path, entry.name);
  const folder = new FakeFolder(entry.path, entry.name);
  folder.children = entry.children.map(toFake);
  return folder;
}

function flatten(entry: FakeAbstract, into = new Map<string, FakeAbstract>()) {
  into.set(entry.path, entry);
  if (entry instanceof FakeFolder) entry.children.forEach((child) => flatten(child, into));
  return into;
}

type Handler = (...args: unknown[]) => void;

function installDomHelpers() {
  const proto = HTMLElement.prototype as unknown as Record<string, unknown>;
  const classes = (value: unknown) => (Array.isArray(value) ? value : value ? String(value).split(/\s+/) : []);
  proto.createEl = function (this: HTMLElement, tag: string, options: { cls?: string | string[]; text?: string; attr?: Record<string, string> } = {}) {
    const el = document.createElement(tag);
    classes(options.cls).forEach((name) => name && el.classList.add(name));
    if (options.text !== undefined) el.textContent = options.text;
    for (const [key, value] of Object.entries(options.attr ?? {})) el.setAttribute(key, value);
    this.appendChild(el);
    return el;
  };
  proto.createDiv = function (this: HTMLElement, options?: { cls?: string | string[]; text?: string; attr?: Record<string, string> }) {
    return (this as unknown as { createEl(tag: string, o?: unknown): HTMLElement }).createEl("div", options);
  };
  proto.createSpan = function (this: HTMLElement, options?: { cls?: string | string[]; text?: string }) {
    return (this as unknown as { createEl(tag: string, o?: unknown): HTMLElement }).createEl("span", options);
  };
  proto.empty = function (this: HTMLElement) {
    this.replaceChildren();
  };
  proto.addClass = function (this: HTMLElement, name: string) {
    this.classList.add(name);
  };
  proto.hasClass = function (this: HTMLElement, name: string) {
    return this.classList.contains(name);
  };
  proto.toggleClass = function (this: HTMLElement, name: string, on: boolean) {
    this.classList.toggle(name, on);
  };
  proto.setText = function (this: HTMLElement, text: string) {
    this.textContent = text;
  };
  proto.setCssProps = function (this: HTMLElement, props: Record<string, string>) {
    for (const [key, value] of Object.entries(props)) this.style.setProperty(key, value);
  };
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    observe() {}
    disconnect() {}
  };
}

const notices: string[] = [];
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
let NavigatorViewClass: typeof import("./navigator-view").NavigatorView;

beforeAll(async () => {
  installDomHelpers();
  class ItemView {
    contentEl = document.createElement("div");
    registered: Array<{ name: string; callback: Handler }> = [];
    constructor(public leaf: unknown) {}
    registerEvent(ref: { name: string; callback: Handler }) {
      this.registered.push(ref);
    }
    register() {}
    getState() {
      return {};
    }
    async setState() {}
  }
  mock.module("obsidian", () => ({
    ItemView,
    Keymap: { isModifier: (event: KeyboardEvent, name: string) => name === "Mod" && (event.ctrlKey || event.metaKey) },
    Notice: class {
      constructor(message: string) {
        notices.push(message);
      }
    },
    Platform: { isMobile: false, isMacOS: false },
    TFile: FakeFile,
    TFolder: FakeFolder,
    setIcon: () => {},
  }));
  ({ NavigatorView: NavigatorViewClass } = await import("./navigator-view"));
});

async function openView(active: string | null = null) {
  const rootFolder = toFake(vault) as FakeFolder;
  const byPath = flatten(rootFolder);
  const opened: string[] = [];
  const maps: string[] = [];
  let mapTarget: { kind: "file" | "folder"; path: string } | null = null;
  const handlers = new Map<string, Handler>();
  const app = {
    vault: {
      getRoot: () => rootFolder,
      getName: () => "My vault",
      getAbstractFileByPath: (path: string) => byPath.get(path) ?? null,
      on: (name: string, callback: Handler) => ({ name: `vault:${name}`, callback }),
    },
    workspace: {
      on: (name: string, callback: Handler) => {
        handlers.set(name, callback);
        return { name: `workspace:${name}`, callback };
      },
      getActiveFile: () => (active ? byPath.get(active) : null),
      getMostRecentLeaf: () => null,
      rootSplit: {},
      setActiveLeaf: () => {},
    },
  };
  const host = {
    openNote: async (file: { path: string }) => void opened.push(file.path),
    openMapFor: async (target: { path: string }) => {
      maps.push(target.path);
      mapTarget = { kind: byPath.get(target.path) instanceof FakeFolder ? "folder" : "file", path: target.path };
    },
    mapTarget: () => mapTarget,
    focusMapView: () => true,
  };
  const view = new NavigatorViewClass({} as never, host);
  (view as unknown as { app: unknown }).app = app;
  await view.onOpen();
  const el = view.contentEl;
  const rows = (area: "tree" | "list") => [...el.querySelectorAll(`.bloommd-nav-pane-${area} .bloommd-nav-row`)] as HTMLElement[];
  const labels = (area: "tree" | "list") => rows(area).map((row) => row.querySelector(".bloommd-nav-label")?.textContent);
  const pane = (area: "tree" | "list") => el.querySelector(`[data-area="${area}"]`) as HTMLElement;
  const press = (area: "tree" | "list", key: string, init: KeyboardEventInit = {}) =>
    pane(area).dispatchEvent(new (document.defaultView as unknown as { KeyboardEvent: typeof KeyboardEvent }).KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init }));
  const click = (row: HTMLElement) => row.dispatchEvent(new (document.defaultView as unknown as { MouseEvent: typeof MouseEvent }).MouseEvent("click", { bubbles: true }));
  return { view, el, rows, labels, pane, press, click, opened, maps, handlers };
}

describe("navigator view", () => {
  test("shows the vault as a tree of folders and the notes of the selected folder in a separate list", async () => {
    const { labels, el } = await openView();
    expect(labels("tree")).toEqual(["My vault", "Archive", "Projects"]);
    expect(labels("list")).toEqual(["Home"]);
    expect(el.querySelector(".bloommd-nav-pane-list .bloommd-nav-pane-title")?.textContent).toBe("Notes in My vault (1)");
    expect(el.querySelector('[data-area="tree"]')?.getAttribute("tabindex")).toBe("0");
    expect(el.querySelector('[data-area="list"]')?.getAttribute("tabindex")).toBe("0");
  });

  test("clicking a folder shows its notes; the arrow keys open nested folders", async () => {
    const { rows, labels, press, click } = await openView();
    click(rows("tree")[2]!);
    expect(labels("list")).toEqual(["Notes"]);
    press("tree", "ArrowRight");
    expect(labels("tree")).toEqual(["My vault", "Archive", "Projects", "Alpha", "Beta"]);
    press("tree", "ArrowDown");
    expect(labels("list")).toEqual(["Notes", "Plan 2", "Plan 10"]);
  });

  test("Enter in the list opens the selected note", async () => {
    const { press, opened } = await openView();
    press("tree", "ArrowRight");
    press("list", "Enter");
    expect(opened).toEqual(["Home.md"]);
  });

  test("clicking a note opens it", async () => {
    const { rows, click, opened } = await openView();
    click(rows("tree")[2]!);
    click(rows("list")[0]!);
    expect(opened).toEqual(["Projects/Notes.md"]);
  });

  test("the active note is revealed on open: folders open, folder and note selected", async () => {
    const path = `Projects/Alpha/Deep/${LONG_NAME}`;
    const { labels, rows } = await openView(path);
    expect(labels("tree")).toContain("Deep");
    expect(rows("tree").find((row) => row.classList.contains("is-selected"))?.getAttribute("title")).toBe("Projects/Alpha/Deep");
    expect(labels("list")).toEqual([LONG_NAME.replace(/\.md$/, "")]);
    expect(rows("list")[0]?.getAttribute("title")).toBe(path);
  });

  test("the file-open event follows the active note", async () => {
    const { handlers, labels, view } = await openView();
    handlers.get("file-open")!({ path: "Projects/Beta/Notes.md", extension: "md" });
    expect(labels("list")).toEqual(["Notes"]);
    expect(view.getState()).toMatchObject({ folder: "Projects/Beta" });
  });

  test("the M key opens the map of the selected note and the header tells map and browsing context apart", async () => {
    const { press, maps, el } = await openView();
    press("tree", "ArrowRight");
    press("list", "m");
    await settle();
    expect(maps).toEqual(["Home.md"]);
    expect(el.querySelector(".bloommd-nav-context-browse")?.textContent).toBe("Browsing: My vault › Home");
    expect(el.querySelector(".bloommd-nav-context-map")?.textContent).toBe("Map: note Home");
  });

  test("the whole vault is not turned into a map", async () => {
    const { press, maps } = await openView();
    press("tree", "m");
    await settle();
    expect(maps).toEqual([]);
    expect(notices.at(-1)).toContain("whole vault");
  });

  test("Back returns to the previously opened folder", async () => {
    const { rows, click, labels, el } = await openView();
    click(rows("tree")[2]!);
    expect(labels("list")).toEqual(["Notes"]);
    (el.querySelector('button[aria-label="Back"]') as HTMLButtonElement).click();
    expect(labels("list")).toEqual(["Home"]);
  });

  test("renders only the rows in view for a large folder", async () => {
    const many: SourceEntry = {
      path: "/",
      name: "Vault",
      children: Array.from({ length: 5000 }, (_, index) => ({ path: `n${index}.md`, name: `n${index}.md`, extension: "md" })),
    };
    const rootFolder = toFake(many) as FakeFolder;
    const { view } = await openView();
    (view as unknown as { app: { vault: { getRoot(): unknown } } }).app.vault.getRoot = () => rootFolder;
    (view as unknown as { refreshVault(): void }).refreshVault();
    const rendered = view.contentEl.querySelectorAll(".bloommd-nav-pane-list .bloommd-nav-row").length;
    expect(rendered).toBeGreaterThan(0);
    expect(rendered).toBeLessThan(60);
  });
});
