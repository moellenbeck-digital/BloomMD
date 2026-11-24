import { afterEach, expect, test } from "bun:test";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { ReactFlowProvider } from "@xyflow/react";
import { parseFile } from "@bloommd/core/browser";
import { MindMapNode } from "./MindMapNode";
import { useMindMapStore } from "../hooks/useMindMapStore";
import { installDom } from "./test-dom";

let restoreFrames: (() => void) | undefined;
let root: Root | undefined;
let restoreFocus: (() => void) | undefined;
afterEach(() => {
  if (root) flushSync(() => root?.unmount());
  restoreFocus?.();
  restoreFrames?.();
  useMindMapStore.getState().setDocument(null);
});

function mountPendingRename() {
  installDom();
  const request = globalThis.requestAnimationFrame;
  const cancel = globalThis.cancelAnimationFrame;
  restoreFrames = () => { globalThis.requestAnimationFrame = request; globalThis.cancelAnimationFrame = cancel; };
  const frames = new Map<number, FrameRequestCallback>();
  let next = 0;
  globalThis.requestAnimationFrame = (callback) => { frames.set(++next, callback); return next; };
  globalThis.cancelAnimationFrame = (id) => { frames.delete(id); };
  const doc = parseFile("focus.md", "# Root\n\n## Child\n");
  useMindMapStore.getState().setDocument(doc);
  const id = [...doc.nodes.keys()].find((key) => key !== doc.rootId)!;
  useMindMapStore.getState().setSelectedNodeId(id);
  const node = useMindMapStore.getState().nodes.find((entry) => entry.id === id)!;
  const container = document.createElement("div"); document.body.appendChild(container);
  root = createRoot(container);
  let hidden = true;
  const original = window.HTMLInputElement.prototype.focus;
  window.HTMLInputElement.prototype.focus = function (options) { if (!hidden) original.call(this, options); };
  restoreFocus = () => { window.HTMLInputElement.prototype.focus = original; };
  flushSync(() => root!.render(<ReactFlowProvider><MindMapNode id={id} data={node.data} type="mindmap" dragging={false} draggable={false} selectable isConnectable={false} deletable={false} zIndex={0} positionAbsoluteX={0} positionAbsoluteY={0} /></ReactFlowProvider>));
  flushSync(() => useMindMapStore.getState().setAutoEditNodeId(id));
  const input = container.querySelector<HTMLInputElement>("input")!;
  function reveal() {
    hidden = false;
    const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach((callback) => callback(0));
  }
  return { doc, input, reveal };
}

test("rename input receives focus after React Flow reveals a newly measured node", () => {
  const { input, reveal } = mountPendingRename();
  expect(input).not.toBeNull();
  expect(document.activeElement).not.toBe(input);
  reveal();
  expect(document.activeElement).toBe(input);
  expect(input.selectionEnd).toBe(input.value.length);
});

test("delayed rename focus cannot override a newer selection", () => {
  const { doc, input, reveal } = mountPendingRename();
  flushSync(() => useMindMapStore.getState().setSelectedNodeId(doc.rootId));
  reveal();
  expect(document.activeElement).not.toBe(input);
});
