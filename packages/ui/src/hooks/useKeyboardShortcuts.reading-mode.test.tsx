import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import React from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { parseFile, serializeToMarkdown } from "@bloommd/core/browser";
import { useKeyboardShortcuts } from "./useKeyboardShortcuts";
import { useMindMapStore } from "./useMindMapStore";
import { installDom } from "../components/test-dom";

const actions = {
  onNew: () => undefined,
  onImport: () => undefined,
  onExport: () => undefined,
  onSave: () => undefined,
  onReload: () => undefined,
  onToggleFileBrowser: () => undefined,
  onToggleCommandPalette: () => undefined,
  onToggleHelp: () => undefined,
};

function Harness({ children }: { children?: React.ReactNode }) {
  useKeyboardShortcuts(actions);
  return <div id="mindmap-canvas" tabIndex={-1} data-testid="canvas">{children}</div>;
}

let root: Root | null = null;
let container: HTMLElement;

function key(target: Element, init: KeyboardEventInit & { key: string }): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
}

function mount(children?: React.ReactNode) {
  flushSync(() => root!.render(<Harness>{children}</Harness>));
}

function nodeId(title: string): string {
  return [...useMindMapStore.getState().document!.nodes.values()].find((node) => node.title === title)!.id;
}

beforeEach(() => {
  installDom();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  useMindMapStore.setState({ canvasMode: "map", readingReturn: null });
  useMindMapStore.getState().setDocument(parseFile("a.md", "# Root\n\n## Alpha\n\n## Beta\n\n## Gamma\n"));
});

afterEach(() => {
  flushSync(() => root?.unmount());
  root = null;
  useMindMapStore.getState().setDocument(null);
  useMindMapStore.setState({ canvasMode: "map", readingReturn: null });
});

describe("@t54 reading mode keyboard", () => {
  test("@t54 Alt+L enters the reading mode and leaves it again", () => {
    mount();
    const canvas = container.querySelector("#mindmap-canvas")!;
    expect(key(canvas, { key: "¬", code: "KeyL", altKey: true }).defaultPrevented).toBe(true);
    expect(useMindMapStore.getState().canvasMode).toBe("reading");
    key(canvas, { key: "¬", code: "KeyL", altKey: true });
    expect(useMindMapStore.getState().canvasMode).toBe("map");
  });

  test("@t54 Alt+L does nothing without a document or while typing", () => {
    mount(<input data-testid="field" />);
    const field = container.querySelector("input")!;
    field.focus();
    key(field, { key: "l", code: "KeyL", altKey: true });
    expect(useMindMapStore.getState().canvasMode).toBe("map");

    useMindMapStore.getState().setDocument(null);
    key(container.querySelector("#mindmap-canvas")!, { key: "l", code: "KeyL", altKey: true });
    expect(useMindMapStore.getState().canvasMode).toBe("map");
  });

  test("@t54 Esc leaves the reading mode, also from a focused button or link", () => {
    mount(<><button type="button" data-testid="back">Back</button><a href="https://example.com">x</a></>);
    useMindMapStore.getState().setCanvasMode("outline");
    useMindMapStore.getState().enterReadingMode();
    expect(key(container.querySelector("button")!, { key: "Escape" }).defaultPrevented).toBe(true);
    expect(useMindMapStore.getState().canvasMode).toBe("outline");

    useMindMapStore.getState().enterReadingMode();
    key(container.querySelector("a")!, { key: "Escape" });
    expect(useMindMapStore.getState().canvasMode).toBe("outline");
  });

  test("@t54 Esc stays inside a text field, a dialog or the help overlay", () => {
    mount(<>
      <input data-testid="field" />
      <div role="dialog"><button type="button" data-testid="in-dialog">ok</button></div>
    </>);
    useMindMapStore.getState().enterReadingMode();

    const field = container.querySelector("input")!;
    field.focus();
    key(field, { key: "Escape" });
    expect(useMindMapStore.getState().canvasMode).toBe("reading");

    key(container.querySelector("[data-testid=in-dialog]")!, { key: "Escape" });
    expect(useMindMapStore.getState().canvasMode).toBe("reading");

    const help = document.createElement("div");
    help.setAttribute("data-testid", "shortcut-help");
    document.body.appendChild(help);
    key(container.querySelector("#mindmap-canvas")!, { key: "Escape" });
    expect(useMindMapStore.getState().canvasMode).toBe("reading");
    help.remove();

    key(container.querySelector("#mindmap-canvas")!, { key: "Escape" });
    expect(useMindMapStore.getState().canvasMode).toBe("map");
  });

  test("@t54 Esc outside the reading mode keeps its old behaviour (deselect)", () => {
    mount();
    expect(useMindMapStore.getState().selectedNodeId).not.toBeNull();
    key(container.querySelector("#mindmap-canvas")!, { key: "Escape" });
    expect(useMindMapStore.getState().selectedNodeId).toBeNull();
    expect(useMindMapStore.getState().canvasMode).toBe("map");
  });

  test("@t54 node shortcuts change nothing in the background while reading", () => {
    mount();
    const canvas = container.querySelector("#mindmap-canvas")!;
    const alpha = nodeId("Alpha");
    useMindMapStore.getState().setSelectedNodeId(alpha);
    const doc = useMindMapStore.getState().document!;
    const nodeCount = doc.nodes.size;
    const before = serializeToMarkdown(doc).replace(/^updated: .*\n/m, "");
    useMindMapStore.getState().enterReadingMode();

    const events = [
      key(canvas, { key: "ArrowRight" }),
      key(canvas, { key: "ArrowLeft" }),
      key(canvas, { key: "ArrowDown" }),
      key(canvas, { key: "ArrowUp" }),
      key(canvas, { key: "Tab" }),
      key(canvas, { key: "Enter" }),
      key(canvas, { key: "Delete" }),
      key(canvas, { key: "Backspace" }),
      key(canvas, { key: "r" }),
      key(canvas, { key: "z", ctrlKey: true }),
      key(canvas, { key: "z", ctrlKey: true, shiftKey: true }),
      key(canvas, { key: "c", ctrlKey: true }),
      key(canvas, { key: "v", ctrlKey: true }),
      key(canvas, { key: "Enter", ctrlKey: true }),
      key(canvas, { key: "Enter", altKey: true }),
    ];

    // Arrows must stay with the browser so the text scrolls; nothing may be swallowed.
    expect(events.slice(0, 4).every((event) => !event.defaultPrevented)).toBe(true);
    const after = useMindMapStore.getState();
    expect(after.selectedNodeId).toBe(alpha);
    expect(after.document!.nodes.size).toBe(nodeCount);
    expect(serializeToMarkdown(after.document!).replace(/^updated: .*\n/m, "")).toBe(before);
    expect(after.editorVisible).toBe(false);
    expect(after.autoEditNodeId).toBeNull();
    expect(after.canvasMode).toBe("reading");
  });
});
