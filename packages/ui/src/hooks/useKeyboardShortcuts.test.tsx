import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { Window } from "happy-dom";
import React from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { buildWorkspaceMindMap, parseFile, yDeleteNode, type MindMapDocument } from "@bloommd/core/browser";
import { useKeyboardShortcuts } from "./useKeyboardShortcuts";
import { useMindMapStore } from "./useMindMapStore";

mock.module("@xyflow/react", () => ({
  Handle: (props: { type?: string }) => React.createElement("div", { "data-handle-type": props.type }),
  Position: { Left: "left", Right: "right" },
}));

const { MindMapNode } = await import("../components/MindMapNode");

const emptyActions = {
  onNew: () => undefined,
  onImport: () => undefined,
  onExport: () => undefined,
  onSave: () => undefined,
  onReload: () => undefined,
  onToggleFileBrowser: () => undefined,
  onToggleCommandPalette: () => undefined,
  onToggleHelp: () => undefined,
};

function installDom() {
  const win = new Window({ url: "https://bloommd.test/app" });
  globalThis.window = win as unknown as Window & typeof globalThis.window;
  globalThis.document = win.document as unknown as Document;
  globalThis.navigator = win.navigator as unknown as Navigator;
  globalThis.HTMLElement = win.HTMLElement as unknown as typeof HTMLElement;
  globalThis.KeyboardEvent = win.KeyboardEvent as unknown as typeof KeyboardEvent;
  globalThis.MouseEvent = win.MouseEvent as unknown as typeof MouseEvent;
  globalThis.requestAnimationFrame = (callback: FrameRequestCallback) => {
    callback(0);
    return 0;
  };
  globalThis.cancelAnimationFrame = () => undefined;
}

function createDocument(): MindMapDocument {
  return parseFile("test.md", "# Root\n\n## Existing\n");
}

function ShortcutHarness({ nodeId }: { nodeId: string }) {
  const doc = useMindMapStore((state) => state.document);
  useKeyboardShortcuts(emptyActions);

  if (!doc) return null;
  const node = doc.nodes.get(nodeId);
  if (!node) return null;

  return (
    <>
      <div id="mindmap-canvas" tabIndex={-1} />
      <MindMapNode
        id={nodeId}
        selected
        data={{
          metadata: node.metadata,
          label: node.title,
          level: node.level,
          content: node.content,
          childCount: node.children.length,
          collapsed: false,
          linkCount: 0,
        }}
      />
    </>
  );
}

function BackShortcutHarness({
  onBackToWorkspace,
  onForwardToFile,
}: {
  onBackToWorkspace?: () => boolean | void;
  onForwardToFile?: () => boolean | void;
}) {
  useKeyboardShortcuts({ ...emptyActions, onBackToWorkspace, onForwardToFile });
  return <div id="mindmap-canvas" tabIndex={-1} />;
}

function renderHarness(nodeId: string) {
  useMindMapStore.getState().setSelectedNodeId(nodeId);
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  flushSync(() => {
    root.render(<ShortcutHarness nodeId={nodeId} />);
  });
  return { container, root };
}

function AllNodesHarness({ selectedNodeId }: { selectedNodeId: string }) {
  const doc = useMindMapStore((state) => state.document);
  useKeyboardShortcuts(emptyActions);
  if (!doc) return null;

  return (
    <>
      {[...doc.nodes.entries()].map(([id, node]) => (
        <MindMapNode
          key={id}
          id={id}
          selected={id === selectedNodeId}
          data={{
            metadata: node.metadata,
          label: node.title,
            level: node.level,
            content: node.content,
            childCount: node.children.length,
            collapsed: false,
            linkCount: 0,
          }}
        />
      ))}
    </>
  );
}

function renderAllNodes(nodeId: string) {
  useMindMapStore.getState().setSelectedNodeId(nodeId);
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  flushSync(() => {
    root.render(<AllNodesHarness selectedNodeId={nodeId} />);
  });
  return { container, root };
}

async function tick() {
  await new Promise((resolve) => setTimeout(resolve, 50));
}

function dispatchCreateKey(target: HTMLElement, key: "Tab" | "Enter", repeat = false) {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    repeat,
  });
  target.dispatchEvent(event);
}

function dispatchKey(target: HTMLElement, key: string, options: KeyboardEventInit = {}) {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    ...options,
  });
  target.dispatchEvent(event);
  return event;
}

function nodeElement(container: HTMLElement, nodeId: string): HTMLElement | null {
  return [...container.querySelectorAll<HTMLElement>("[data-testid='mindmap-node']")]
    .find((element) => element.dataset.nodeId === nodeId) ?? null;
}

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new window.Event("input", { bubbles: true }));
}

describe("useKeyboardShortcuts node creation", () => {
  let root: Root | null = null;

  beforeEach(() => {
    installDom();
    useMindMapStore.getState().setDocument(createDocument());
  });

  afterEach(async () => {
    await new Promise((resolve) => setTimeout(resolve, 120));
    root?.unmount();
    root = null;
    useMindMapStore.getState().setDocument(null);
  });

  test("double-click renames a resource title without opening it or losing input focus", async () => {
    const doc = createDocument();
    doc.nodes.get(doc.rootId)!.metadata = { kind: "file", file: "other.md" };
    useMindMapStore.getState().setDocument(doc);
    const rendered = renderHarness(doc.rootId);
    root = rendered.root;
    const opened = mock(() => undefined);
    window.addEventListener("bloommd:open-resource", opened);
    const node = nodeElement(rendered.container, doc.rootId)!;
    node.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    await tick();
    const input = rendered.container.querySelector<HTMLInputElement>("input")!;
    expect(input).not.toBeNull();
    input.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await tick();
    expect(document.activeElement).toBe(input);
    expect(opened).not.toHaveBeenCalled();
    setInputValue(input, "Renamed resource");
    await tick();
    dispatchKey(input, "Enter");
    await tick();
    expect(useMindMapStore.getState().document!.nodes.get(doc.rootId)!.title).toBe("Renamed resource");
    expect(document.activeElement).toBe(node);
    window.removeEventListener("bloommd:open-resource", opened);
  });

  test("workspace headings offer a source file instead of a non-persistable rename", async () => {
    const doc = buildWorkspaceMindMap([{ path: "source.md", markdown: "# Source\n\n## Child\n" }]);
    useMindMapStore.getState().setDocument(doc);
    const heading = [...doc.nodes.values()].find((node) => node.title === "Child")!;
    const rendered = renderHarness(heading.id);
    root = rendered.root;
    nodeElement(rendered.container, heading.id)!.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    await tick();
    expect(rendered.container.querySelector("input")).toBeNull();
    expect(rendered.container.querySelector("[data-testid=node-action-add-child]")).toBeNull();
    const opened: string[] = [];
    const listener = (event: Event) => opened.push((event as CustomEvent<{ file: string }>).detail.file);
    window.addEventListener("bloommd:open-resource", listener);
    rendered.container.querySelector<HTMLButtonElement>("[data-testid=node-action-open-source]")!.click();
    expect(opened).toEqual(["source.md"]);
    window.removeEventListener("bloommd:open-resource", listener);
  });

  test("Shift+Tab and modified arrows do not mutate or navigate the map", async () => {
    const doc = useMindMapStore.getState().document!;
    const rendered = renderHarness(doc.rootId);
    root = rendered.root;
    const node = nodeElement(rendered.container, doc.rootId)!;
    const before = doc.nodes.size;
    expect(dispatchKey(node, "Tab", { shiftKey: true }).defaultPrevented).toBe(false);
    expect(dispatchKey(node, "ArrowRight", { altKey: true }).defaultPrevented).toBe(false);
    expect(useMindMapStore.getState().document!.nodes.size).toBe(before);
    expect(useMindMapStore.getState().selectedNodeId).toBe(doc.rootId);
  });

  test("editor formatting, link and Escape keys stay with the editor", () => {
    const onImport = mock(() => undefined);
    const onToggleCommandPalette = mock(() => undefined);
    function EditorHarness() {
      useKeyboardShortcuts({ ...emptyActions, onImport, onToggleCommandPalette });
      return <div className="mdxeditor"><div contentEditable data-testid="rich-editor" /></div>;
    }
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    flushSync(() => root!.render(<EditorHarness />));
    const editor = container.querySelector<HTMLElement>("[data-testid=rich-editor]")!;
    for (const key of ["i", "k"]) expect(dispatchKey(editor, key, { metaKey: true }).defaultPrevented).toBe(false);
    expect(dispatchKey(editor, "Escape").defaultPrevented).toBe(false);
    expect(onImport).not.toHaveBeenCalled();
    expect(onToggleCommandPalette).not.toHaveBeenCalled();
  });

  test("dialogs and IME composition do not trigger map editing", () => {
    const doc = useMindMapStore.getState().document!;
    const rendered = renderHarness(doc.rootId);
    root = rendered.root;
    const node = nodeElement(rendered.container, doc.rootId)!;
    expect(dispatchKey(node, "Enter", { isComposing: true }).defaultPrevented).toBe(false);
    rendered.container.setAttribute("role", "dialog");
    expect(dispatchKey(node, "Escape").defaultPrevented).toBe(false);
    expect(dispatchKey(node, "Tab").defaultPrevented).toBe(false);
    expect(useMindMapStore.getState().selectedNodeId).toBe(doc.rootId);
  });

  test("reveals a collapsed branch before navigating to its child", async () => {
    const doc = useMindMapStore.getState().document!;
    const childId = doc.nodes.get(doc.rootId)!.children[0]!;
    useMindMapStore.getState().toggleCollapse(doc.rootId);
    expect(useMindMapStore.getState().nodes.some((node) => node.id === childId)).toBe(false);
    const rendered = renderHarness(doc.rootId);
    root = rendered.root;
    await tick();
    dispatchKey(nodeElement(rendered.container, doc.rootId)!, "ArrowRight");
    const state = useMindMapStore.getState();
    expect(state.selectedNodeId).toBe(childId);
    expect(state.collapsedIds.has(doc.rootId)).toBe(false);
    expect(state.nodes.some((node) => node.id === childId)).toBe(true);
  });

  test("creates exactly one child when Tab starts on a focused node", async () => {
    const doc = useMindMapStore.getState().document!;
    const initialChildren = doc.nodes.get(doc.rootId)!.children.length;
    const rendered = renderHarness(doc.rootId);
    root = rendered.root;
    await tick();

    const nodeElement = rendered.container.querySelector("[data-testid='mindmap-node']") as HTMLElement | null;
    expect(nodeElement).not.toBeNull();
    nodeElement!.focus();
    dispatchCreateKey(nodeElement!, "Tab");
    await tick();

    const updated = useMindMapStore.getState().document!;
    const children = updated.nodes.get(updated.rootId)!.children;
    expect(children).toHaveLength(initialChildren + 1);
    expect(children.map((id) => updated.nodes.get(id)?.title).filter(Boolean)).toEqual(["Existing", "Neuer Node"]);
  });

  test("creates exactly one sibling when Enter starts on a focused node", async () => {
    const doc = useMindMapStore.getState().document!;
    const existingId = doc.nodes.get(doc.rootId)!.children[0]!;
    const initialChildren = doc.nodes.get(doc.rootId)!.children.length;
    const rendered = renderHarness(existingId);
    root = rendered.root;
    await tick();

    const nodeElement = rendered.container.querySelector("[data-testid='mindmap-node']") as HTMLElement | null;
    expect(nodeElement).not.toBeNull();
    nodeElement!.focus();
    dispatchCreateKey(nodeElement!, "Enter");
    await tick();

    const updated = useMindMapStore.getState().document!;
    const children = updated.nodes.get(updated.rootId)!.children;
    expect(children).toHaveLength(initialChildren + 1);
    expect(children.map((id) => updated.nodes.get(id)?.title).filter(Boolean)).toEqual(["Existing", "Neuer Node"]);
  });

  test("does not treat Enter on controls as a canvas create shortcut", async () => {
    const doc = useMindMapStore.getState().document!;
    const existingId = doc.nodes.get(doc.rootId)!.children[0]!;
    const initialChildren = doc.nodes.get(doc.rootId)!.children.length;
    const rendered = renderHarness(existingId);
    root = rendered.root;
    await tick();

    const button = document.createElement("button");
    document.body.appendChild(button);
    button.focus();
    dispatchCreateKey(button, "Enter");
    await tick();

    const updated = useMindMapStore.getState().document!;
    expect(updated.nodes.get(updated.rootId)!.children).toHaveLength(initialChildren);
  });

  test("ignores repeated structural create shortcuts", async () => {
    const doc = useMindMapStore.getState().document!;
    const initialChildren = doc.nodes.get(doc.rootId)!.children.length;
    const rendered = renderHarness(doc.rootId);
    root = rendered.root;
    await tick();

    const nodeElement = rendered.container.querySelector("[data-testid='mindmap-node']") as HTMLElement | null;
    expect(nodeElement).not.toBeNull();
    nodeElement!.focus();
    dispatchCreateKey(nodeElement!, "Tab", true);
    await tick();

    const updated = useMindMapStore.getState().document!;
    expect(updated.nodes.get(updated.rootId)!.children).toHaveLength(initialChildren);
  });

  test("keeps the click add-child flow unchanged", async () => {
    const doc = useMindMapStore.getState().document!;
    const initialChildren = doc.nodes.get(doc.rootId)!.children.length;
    const rendered = renderHarness(doc.rootId);
    root = rendered.root;
    await tick();

    const button = rendered.container.querySelector("[data-testid='node-action-add-child']") as HTMLButtonElement | null;
    expect(button).not.toBeNull();
    button!.click();
    await tick();

    const updated = useMindMapStore.getState().document!;
    expect(updated.nodes.get(updated.rootId)!.children).toHaveLength(initialChildren + 1);
  });

  test("focuses the rename field immediately after creating a child", async () => {
    const doc = useMindMapStore.getState().document!;
    const rendered = renderAllNodes(doc.rootId);
    root = rendered.root;
    await tick();

    const button = rendered.container.querySelector("[data-testid='node-action-add-child']") as HTMLButtonElement | null;
    expect(button).not.toBeNull();
    button!.click();
    await tick();

    const input = rendered.container.querySelector<HTMLInputElement>("[data-testid='node-rename-input']");
    expect(input).not.toBeNull();
    expect(document.activeElement).toBe(input);
  });

  test("waits until an offscreen new node is visible before editing its title", async () => {
    const store = useMindMapStore.getState();
    const newId = store.addChildNode(store.document!.rootId, "New")!;
    const rendered = renderAllNodes(newId);
    root = rendered.root;
    const canvas = document.createElement("div");
    canvas.id = "mindmap-canvas";
    rendered.container.prepend(canvas);
    const node = rendered.container.querySelector<HTMLElement>(`[data-node-id="${newId}"]`)!;
    Object.defineProperties(canvas, { clientWidth: { value: 1000 }, clientHeight: { value: 800 } });
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, right: 1000, bottom: 800 }) as DOMRect;
    node.getBoundingClientRect = () => ({ left: 1200, top: 100, right: 1400, bottom: 160 }) as DOMRect;

    store.requestAutoEditNode(newId);
    await tick();
    expect(rendered.container.querySelector("[data-testid='node-rename-input']")).toBeNull();

    node.getBoundingClientRect = () => ({ left: 300, top: 100, right: 500, bottom: 160 }) as DOMRect;
    await tick();
    const input = rendered.container.querySelector<HTMLInputElement>("[data-testid='node-rename-input']");
    expect(input).not.toBeNull();
    expect(document.activeElement).toBe(input);
  });

  test("only opens the latest rename request after rapid node creation", async () => {
    const store = useMindMapStore.getState();
    const doc = store.document!;
    const firstId = store.addChildNode(doc.rootId, "First")!;
    const secondId = store.addChildNode(doc.rootId, "Second")!;
    store.setSelectedNodeId(firstId);
    store.requestAutoEditNode(firstId);
    store.setSelectedNodeId(secondId);
    store.requestAutoEditNode(secondId);

    const rendered = renderAllNodes(secondId);
    root = rendered.root;
    await tick();

    const inputs = rendered.container.querySelectorAll<HTMLInputElement>("[data-testid='node-rename-input']");
    expect(inputs).toHaveLength(1);
    expect(inputs[0]?.value).toBe("Second");
    expect(inputs[0]?.closest("[data-node-id]")?.getAttribute("data-node-id")).toBe(secondId);
  });

  test("keeps the rename flow working after deleting nodes before creating a child", async () => {
    const store = useMindMapStore.getState();
    const doc = store.document!;
    const firstId = store.addChildNode(doc.rootId, "Delete me")!;
    const secondId = store.addChildNode(doc.rootId, "Delete me too")!;
    store.addChildNode(firstId, "Nested delete me")!;
    store.deleteNodeAction(firstId);
    store.deleteNodeAction(secondId);

    await tick();
    const rendered = renderAllNodes(doc.rootId);
    root = rendered.root;
    await tick();

    const button = rendered.container.querySelector("[data-testid='node-action-add-child']") as HTMLButtonElement | null;
    expect(button).not.toBeNull();
    button!.click();
    await tick();

    const input = rendered.container.querySelector<HTMLInputElement>("[data-testid='node-rename-input']");
    expect(input).not.toBeNull();
    expect(document.activeElement).toBe(input);
  });

  test("returns focus to the same node after committing inline rename", async () => {
    const doc = useMindMapStore.getState().document!;
    const existingId = doc.nodes.get(doc.rootId)!.children[0]!;
    const rendered = renderAllNodes(existingId);
    root = rendered.root;
    await tick();

    const node = nodeElement(rendered.container, existingId)!;
    node.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    await tick();
    const input = rendered.container.querySelector<HTMLInputElement>("[data-testid='node-rename-input']");
    expect(input).not.toBeNull();
    dispatchKey(input!, "Enter");
    await tick();

    expect(useMindMapStore.getState().document!.nodes.get(existingId)!.title).toBe("Existing");
    expect(document.activeElement).toBe(nodeElement(rendered.container, existingId));
  });

  test("returns focus to the same node after cancelling inline rename", async () => {
    const doc = useMindMapStore.getState().document!;
    const existingId = doc.nodes.get(doc.rootId)!.children[0]!;
    const rendered = renderAllNodes(existingId);
    root = rendered.root;
    await tick();

    const node = nodeElement(rendered.container, existingId)!;
    node.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    await tick();
    const input = rendered.container.querySelector<HTMLInputElement>("[data-testid='node-rename-input']");
    expect(input).not.toBeNull();
    setInputValue(input!, "Discarded");
    dispatchKey(input!, "Escape");
    await tick();

    expect(useMindMapStore.getState().document!.nodes.get(existingId)!.title).toBe("Existing");
    expect(document.activeElement).toBe(nodeElement(rendered.container, existingId));
  });

  test("focuses the parent after deleting a node with Backspace", async () => {
    const doc = useMindMapStore.getState().document!;
    const existingId = doc.nodes.get(doc.rootId)!.children[0]!;
    const rendered = renderAllNodes(existingId);
    root = rendered.root;
    await tick();

    const node = nodeElement(rendered.container, existingId)!;
    node.focus();
    dispatchKey(node, "Backspace");
    await tick();

    expect(useMindMapStore.getState().selectedNodeId).toBe(doc.rootId);
    expect(document.activeElement).toBe(nodeElement(rendered.container, doc.rootId));
    expect(useMindMapStore.getState().document!.nodes.has(existingId)).toBe(false);
  });

  test("undoes a newly-created node as one action and focuses its parent", async () => {
    const store = useMindMapStore.getState();
    const doc = store.document!;
    const newId = store.addChildNode(doc.rootId, "Neuer Node")!;
    store.setSelectedNodeId(newId);
    const rendered = renderAllNodes(newId);
    root = rendered.root;
    await tick();

    const node = nodeElement(rendered.container, newId)!;
    node.focus();
    dispatchKey(node, "z", { ctrlKey: true });
    await tick();

    const updated = useMindMapStore.getState();
    expect(updated.document!.nodes.has(newId)).toBe(false);
    expect(updated.selectedNodeId).toBe(doc.rootId);
    expect(document.activeElement).toBe(nodeElement(rendered.container, doc.rootId));
  });

  test("undoes a renamed new node even when rename was a separate history item", async () => {
    const store = useMindMapStore.getState();
    const doc = store.document!;
    const newId = store.addChildNode(doc.rootId, "Neuer Node")!;
    await new Promise((resolve) => setTimeout(resolve, 600));
    store.renameNode(newId, "Renamed node");
    store.setSelectedNodeId(newId);
    const rendered = renderAllNodes(newId);
    root = rendered.root;
    await tick();

    const node = nodeElement(rendered.container, newId)!;
    node.focus();
    dispatchKey(node, "z", { ctrlKey: true });
    await tick();

    const updated = useMindMapStore.getState();
    expect(updated.document!.nodes.has(newId)).toBe(false);
    expect(updated.selectedNodeId).toBe(doc.rootId);
  });

  test("falls back to the parent when the selected node is removed externally", async () => {
    const doc = useMindMapStore.getState().document!;
    const existingId = doc.nodes.get(doc.rootId)!.children[0]!;
    const rendered = renderAllNodes(existingId);
    root = rendered.root;
    await tick();

    const node = nodeElement(rendered.container, existingId)!;
    node.focus();
    const yDoc = useMindMapStore.getState().yDoc!;
    yDeleteNode(yDoc, existingId);
    await tick();

    expect(useMindMapStore.getState().selectedNodeId).toBe(doc.rootId);
    expect(document.activeElement).toBe(nodeElement(rendered.container, doc.rootId));
  });

  test("leaves native undo available in the rename input", async () => {
    const doc = useMindMapStore.getState().document!;
    const existingId = doc.nodes.get(doc.rootId)!.children[0]!;
    const rendered = renderAllNodes(existingId);
    root = rendered.root;
    await tick();

    const node = nodeElement(rendered.container, existingId)!;
    node.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    await tick();
    const input = rendered.container.querySelector<HTMLInputElement>("[data-testid='node-rename-input']")!;
    const event = dispatchKey(input, "z", { ctrlKey: true });

    expect(event.defaultPrevented).toBe(false);
  });

  test("focuses the target node during arrow navigation", async () => {
    const doc = useMindMapStore.getState().document!;
    const existingId = doc.nodes.get(doc.rootId)!.children[0]!;
    const rendered = renderAllNodes(existingId);
    root = rendered.root;
    await tick();

    const node = nodeElement(rendered.container, existingId)!;
    node.focus();
    dispatchKey(node, "ArrowLeft");
    await tick();

    expect(useMindMapStore.getState().selectedNodeId).toBe(doc.rootId);
    expect(document.activeElement).toBe(nodeElement(rendered.container, doc.rootId));
  });

  test("ignores repeated destructive key events", async () => {
    const doc = useMindMapStore.getState().document!;
    const existingId = doc.nodes.get(doc.rootId)!.children[0]!;
    const rendered = renderAllNodes(existingId);
    root = rendered.root;
    await tick();

    const node = nodeElement(rendered.container, existingId)!;
    node.focus();
    dispatchKey(node, "Delete", { repeat: true });
    await tick();

    expect(useMindMapStore.getState().document!.nodes.has(existingId)).toBe(true);
    expect(useMindMapStore.getState().selectedNodeId).toBe(existingId);
  });

  test("calls the workspace back action for Cmd/Ctrl+ArrowLeft", async () => {
    let calls = 0;
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    flushSync(() => {
      root!.render(<BackShortcutHarness onBackToWorkspace={() => { calls += 1; }} />);
    });
    await tick();

    const canvas = container.querySelector<HTMLElement>("#mindmap-canvas")!;
    canvas.focus();
    const event = dispatchKey(canvas, "ArrowLeft", { ctrlKey: true });

    expect(event.defaultPrevented).toBe(true);
    expect(calls).toBe(1);
  });

  test("calls the workspace forward action for Cmd/Ctrl+ArrowRight", async () => {
    let calls = 0;
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    flushSync(() => {
      root!.render(<BackShortcutHarness onForwardToFile={() => { calls += 1; }} />);
    });
    await tick();

    const canvas = container.querySelector<HTMLElement>("#mindmap-canvas")!;
    canvas.focus();
    const event = dispatchKey(canvas, "ArrowRight", { metaKey: true });

    expect(event.defaultPrevented).toBe(true);
    expect(calls).toBe(1);
  });

  test("does not interrupt Cmd/Ctrl+ArrowLeft while editing text", async () => {
    let calls = 0;
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    flushSync(() => {
      root!.render(<BackShortcutHarness onBackToWorkspace={() => { calls += 1; }} />);
    });
    const input = document.createElement("input");
    container.appendChild(input);
    input.focus();
    await tick();

    const event = dispatchKey(input, "ArrowLeft", { ctrlKey: true });

    expect(event.defaultPrevented).toBe(false);
    expect(calls).toBe(0);
  });
});
