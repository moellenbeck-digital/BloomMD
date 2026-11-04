import { afterEach, beforeAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { act } from "preact/test-utils";
import { createCanvasMount, renderMountFailure, type CanvasHeading, type CanvasMount, type CanvasProps } from "./canvas";
import { ensureHeadingIds, parseHeadingTree, type MarkdownHeadingNode } from "./markdown-document";

/**
 * Renders the real canvas (React Flow, error boundary) the way the Obsidian view mounts it, in
 * the same DOM and renderer the release bundle uses. Covers what the parser-level tests cannot:
 * what a person sees after `Visualize current note`, and that every failure leaves a way back.
 */

const demoPath = new URL("../../../test-vault/Aufnahmen/Obsidian Demo.md", import.meta.url);

function toHeadings(nodes: MarkdownHeadingNode[]): CanvasHeading[] {
  const result: CanvasHeading[] = [];
  const walk = (node: MarkdownHeadingNode, parentId: string | null) => {
    result.push({ id: node.id, parentId, level: node.level, title: node.title, content: node.content, children: node.children.map((child) => child.id), kind: "heading" });
    node.children.forEach((child) => walk(child, node.id));
  };
  nodes.forEach((node) => walk(node, null));
  return result;
}

function demoHeadings() {
  const tree = parseHeadingTree(ensureHeadingIds(readFileSync(demoPath, "utf8")).markdown);
  return { headings: toHeadings(tree), rootId: tree[0]!.id };
}

const calls: string[] = [];
const noop = new Proxy({}, {
  get: (_target, name) => (name === "openMarkdown" ? () => calls.push("back") : name === "reloadNote" ? undefined : () => Promise.resolve(null)),
});

/** Headings that throw when the canvas reads them, i.e. inside React's render, not while props are built. */
const throwingHeadings = () => new Proxy([], { get: () => { throw new Error("boom in render"); } }) as unknown as CanvasHeading[];

function props(overrides: Partial<CanvasProps> = {}): CanvasProps {
  const { headings, rootId } = demoHeadings();
  return {
    filePath: "Aufnahmen/Obsidian Demo.md",
    headings,
    rootId,
    files: [{ path: "Aufnahmen/Obsidian Demo.md", title: "Obsidian Demo" }],
    resources: [],
    backlinks: [],
    layout: { positions: {}, collapsed: [] },
    canUndo: false,
    canRedo: false,
    showNodeContent: true,
    actions: noop as unknown as CanvasProps["actions"],
    ...overrides,
  };
}

const wait = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));
let paneSize = { width: 800, height: 600 };
/** Stands in for the browser telling React Flow its pane was laid out or resized. */
const observers = new Set<{ notify(): void }>();
const resizePane = (size: { width: number; height: number }) => {
  paneSize = size;
  act(() => observers.forEach((observer) => observer.notify()));
};
let container: HTMLElement;
let mount: CanvasMount | null = null;

beforeAll(() => {
  const proto = HTMLElement.prototype as unknown as Record<string, unknown>;
  proto.createDiv = function (this: HTMLElement) {
    return document.createElement("div");
  };
  (globalThis as { createDiv?: () => HTMLElement }).createDiv = () => document.createElement("div");
  Object.assign(globalThis, {
    requestAnimationFrame: (callback: FrameRequestCallback) => setTimeout(() => callback(Date.now()), 0),
    cancelAnimationFrame: (handle: ReturnType<typeof setTimeout>) => clearTimeout(handle),
  });
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    constructor(private readonly callback: (entries: Array<{ target: Element }>) => void) {
      observers.add(this);
    }
    notify() {
      this.deliver([]);
    }
    observe(target: Element) {
      // Like a browser, report the element once right after it is observed.
      queueMicrotask(() => this.deliver([{ target }]));
    }
    unobserve() {}
    disconnect() {
      observers.delete(this);
    }
    private deliver(entries: Array<{ target: Element }>) {
      try {
        this.callback(entries);
      } catch {
        // Observers of single nodes expect entries; only the pane and node observers matter here.
      }
    }
  };
  // happy-dom has no layout: the map pane gets the size the test sets, like a leaf Obsidian has
  // laid out; every other element (the nodes) measures as a small box.
  for (const [property, key, small] of [["offsetWidth", "width", 150], ["offsetHeight", "height", 40], ["clientWidth", "width", 150], ["clientHeight", "height", 40]] as const) {
    Object.defineProperty(HTMLElement.prototype, property, {
      configurable: true,
      get(this: HTMLElement) {
        return this.classList.contains("bloommd-flow-wrap") || this.classList.contains("react-flow") ? paneSize[key] : small;
      },
    });
  }
});

afterEach(() => {
  act(() => mount?.unmount());
  mount = null;
  container?.remove();
  calls.length = 0;
  paneSize = { width: 800, height: 600 };
});

async function show(next: CanvasProps) {
  container ??= document.createElement("div");
  if (!container.isConnected) document.body.appendChild(container);
  mount ??= createCanvasMount(container);
  act(() => mount!.render(next));
  await act(() => wait(60));
  return container;
}

const nodeTitles = () => [...container.querySelectorAll(".react-flow__node")].map((node) => node.textContent ?? "");
const button = (label: string) => [...container.querySelectorAll("button")].find((candidate) => candidate.textContent === label) as HTMLButtonElement | undefined;
const alert = () => container.querySelector('[role="alert"]');

describe("canvas runtime: the demo note", () => {
  test("renders as a mind map with the root and every heading branch", async () => {
    await show(props());
    expect(alert()).toBeNull();
    const titles = nodeTitles();
    expect(titles).toHaveLength(8);
    expect(titles[0]).toContain("Obsidian Demo");
    for (const branch of ["Projekt", "Quellen", "Struktur", "Recording Check"]) expect(titles.some((title) => title.includes(branch))).toBe(true);
    for (const leaf of ["Zielgruppe", "Map", "Markdown"]) expect(titles.some((title) => title.includes(leaf))).toBe(true);
  });

  test("shows the toolbar with Back to Markdown next to the map", async () => {
    await show(props());
    expect(container.querySelector('[aria-label="Back to Markdown"]')).not.toBeNull();
  });
});

describe("canvas runtime: failures always leave a way back", () => {
  test("a render error inside the canvas shows the error state with Back to Markdown", async () => {
    const broken = props({ headings: throwingHeadings() });
    const consoleError = console.error;
    console.error = () => {};
    try {
      await show(broken);
    } finally {
      console.error = consoleError;
    }
    expect(alert()?.textContent).toContain("boom in render");
    act(() => button("Back to Markdown")!.click());
    expect(calls).toEqual(["back"]);
    expect(nodeTitles()).toEqual([]);
  });

  test("the error state clears when another note is shown", async () => {
    const broken = props({ headings: throwingHeadings() });
    const consoleError = console.error;
    console.error = () => {};
    try {
      await show(broken);
    } finally {
      console.error = consoleError;
    }
    expect(alert()).not.toBeNull();
    await show(props({ filePath: "Other.md" }));
    expect(alert()).toBeNull();
    expect(nodeTitles()).toHaveLength(8);
  });

  test("a load error from the view is shown instead of the map, with Back to Markdown and Try again", async () => {
    let reloaded = 0;
    const actions = new Proxy(noop, { get: (target, name) => (name === "reloadNote" ? () => { reloaded += 1; } : (target as Record<string | symbol, unknown>)[name]) }) as unknown as CanvasProps["actions"];
    await show(props({ loadError: "Vault is locked", actions }));
    expect(alert()?.textContent).toContain("Vault is locked");
    expect(nodeTitles()).toEqual([]);
    act(() => button("Try again")!.click());
    expect(reloaded).toBe(1);
    act(() => button("Back to Markdown")!.click());
    expect(calls).toEqual(["back"]);
  });

  test("without a retry action the load error offers only the way back", async () => {
    await show(props({ loadError: "Vault is locked" }));
    expect(button("Try again")).toBeUndefined();
    expect(button("Back to Markdown")).toBeDefined();
  });

  test("a map without headings offers Back to Markdown", async () => {
    await show(props({ headings: [], rootId: "" }));
    expect(container.textContent).toContain("No Markdown headings found");
    act(() => button("Back to Markdown")!.click());
    expect(calls).toEqual(["back"]);
  });

  test("a view without a note says so and offers Back to Markdown", async () => {
    await show(props({ filePath: "", headings: [], rootId: "" }));
    expect(container.textContent).toContain("No note is open in this map");
    act(() => button("Back to Markdown")!.click());
    expect(calls).toEqual(["back"]);
  });

  test("the plain-DOM fallback for a failed mount carries the message and Back to Markdown", () => {
    const host = document.createElement("div");
    host.appendChild(document.createElement("span"));
    renderMountFailure(host, "createRoot failed", () => calls.push("back"));
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("createRoot failed");
    expect(host.querySelector("span")).toBeNull();
    (host.querySelector("button") as HTMLButtonElement).click();
    expect(calls).toEqual(["back"]);
  });
});

describe("canvas runtime: first fit waits for a measured pane", () => {
  const viewportTransform = () => (container.querySelector(".react-flow__viewport") as HTMLElement | null)?.style.transform ?? "";

  test("a pane that is still 0×0 is not fitted; the map fits once it has a size", async () => {
    paneSize = { width: 0, height: 0 };
    await show(props());
    await act(() => wait(300));
    const before = viewportTransform();
    // Still React Flow's default viewport: nothing was fitted into the unmeasured pane.
    expect(before).toBe("translate(30px,30px) scale(0.9)");
    resizePane({ width: 800, height: 600 });
    // The fit animates; wait until it has settled on a real viewport.
    for (let waited = 0; waited < 2000 && (viewportTransform() === before || viewportTransform().includes("NaN")); waited += 50) await act(() => wait(50));
    expect(viewportTransform()).not.toBe(before);
    expect(viewportTransform()).not.toContain("NaN");
  });
});
