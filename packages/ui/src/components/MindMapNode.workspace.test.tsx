import { afterEach, expect, test } from "bun:test";
import React from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { ReactFlowProvider } from "@xyflow/react";
import { buildWorkspaceMindMap, fileNodeId, parseFile } from "@bloommd/core/browser";
import { MindMapNode } from "./MindMapNode";
import { Toolbar } from "./Toolbar";
import { useMindMapStore } from "../hooks/useMindMapStore";
import { PlatformProvider } from "../platform/PlatformContext";
import { createWebPlatformAdapter } from "../platform/web-adapter";
import type { WorkspaceSourceTarget } from "../utils/workspaceSource";
import { installDom, waitFor } from "./test-dom";

let root: Root | undefined;
afterEach(() => {
  if (root) flushSync(() => root?.unmount());
  root = undefined;
  useMindMapStore.getState().setDocument(null);
});

function mount(kind: "file" | "heading" | "folder", canEdit = true, reject = false) {
  installDom();
  const doc = buildWorkspaceMindMap([{ path: "team/notes.md", markdown: "# Notes\n\n## Section\n\nText\n" }]);
  useMindMapStore.getState().setDocument(doc);
  const id = kind === "file" ? fileNodeId("team/notes.md") : kind === "folder" ? doc.rootId : [...doc.nodes.values()].find((node) => node.title === "Section")!.id;
  useMindMapStore.getState().setSelectedNodeId(id);
  const node = useMindMapStore.getState().nodes.find((node) => node.id === id)!;
  const opened: WorkspaceSourceTarget[] = [];
  const created: string[] = [];
  const adapter = { ...createWebPlatformAdapter(), workspace: {
    canEdit,
    openSource: async (target: WorkspaceSourceTarget) => { if (reject) throw new Error("Missing file"); opened.push(target); },
    createEntry: (_kind: "file" | "folder", parent: string) => { created.push(parent); },
  } };
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  flushSync(() => root!.render(<PlatformProvider adapter={adapter}><ReactFlowProvider>
    <Toolbar />
    <MindMapNode id={id} data={node.data} selected={kind !== "file"} type="mindmap" dragging={false} draggable={false} selectable isConnectable={false} deletable={false} zIndex={0} positionAbsoluteX={0} positionAbsoluteY={0} />
  </ReactFlowProvider></PlatformProvider>));
  return { container, opened, created };
}

test("file card offers a visible open action; overview never advertises save/export/edit", async () => {
  const { container, opened } = mount("file");
  expect(container.textContent).toContain("Markdown-Datei");
  expect(container.textContent).toContain("team/notes.md");
  expect(container.querySelector('[data-testid="toolbar-save"]')).toBeNull();
  expect(container.querySelector('[data-testid="toolbar-export"]')).toBeNull();
  expect(container.querySelector('[aria-label="Inhalt bearbeiten"]')).toBeNull();
  container.querySelector<HTMLButtonElement>('[data-testid="workspace-open-file"]')!.click();
  await waitFor(() => opened.length === 1);
  expect(opened[0]).toEqual({ file: "team/notes.md" });
  flushSync(() => useMindMapStore.getState().setDocument(parseFile("note.md", "# Note\n")));
  expect(container.querySelector('[data-testid="toolbar-save"]')).not.toBeNull();
  expect(container.querySelector('[data-testid="toolbar-export"]')).not.toBeNull();
});

test("heading action opens its exact source; Enter provides the same path", async () => {
  const { container, opened } = mount("heading");
  const button = container.querySelector<HTMLButtonElement>('[data-testid="node-action-open-source"]')!;
  expect(button.textContent).toBe("Abschnitt bearbeiten");
  button.click();
  await waitFor(() => opened.length === 1 && !button.disabled);
  const item = container.querySelector<HTMLElement>('[role="treeitem"]')!;
  item.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  await waitFor(() => opened.length === 2);
  expect(opened[1]).toEqual(opened[0]);
  expect(opened[0]?.heading?.id).toContain("section");
});

test("viewer action promises viewing, and failures retain the current overview", async () => {
  const { container } = mount("heading", false, true);
  const before = useMindMapStore.getState().document;
  const button = container.querySelector<HTMLButtonElement>('[data-testid="node-action-open-source"]')!;
  expect(button.textContent).toBe("Abschnitt ansehen");
  button.click();
  await waitFor(() => useMindMapStore.getState().statusMessage !== null);
  expect(useMindMapStore.getState().document).toBe(before);
});

test("folder has a create action, with an accessible collapse control", () => {
  const { container, created } = mount("folder");
  expect(container.querySelector('[data-testid="node-action-open-resource"]')).toBeNull();
  expect(container.querySelector('[aria-label="Vorschau anzeigen"]')).toBeNull();
  const collapse = container.querySelector<HTMLButtonElement>('[data-testid="node-toggle-children"]')!;
  expect(collapse.getAttribute("aria-label")).toBe("Zweig einklappen");
  expect(collapse.getAttribute("aria-expanded")).toBe("true");
  const create = [...container.querySelectorAll<HTMLButtonElement>('[data-testid="node-action-toolbar"] button')].find((button) => button.textContent === "Neue Datei")!;
  create.click();
  expect(created).toEqual([""]);
});
