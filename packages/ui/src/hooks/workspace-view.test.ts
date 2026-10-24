import { afterEach, expect, test } from "bun:test";
import { buildWorkspaceMindMap, parseFile, serializeToMarkdown } from "@bloommd/core/browser";
import { useMindMapStore } from "./useMindMapStore";

function workspace(count: number) {
  return buildWorkspaceMindMap(Array.from({ length: count }, (_, index) => ({
    path: `file-${index}.md`, markdown: `# Topic ${index}\n\n[[file-${(index + 1) % count}]]\n`,
  })), { source: "/temporary-vault" });
}

afterEach(() => useMindMapStore.getState().setDocument(null));

test("workspace edits cannot create changes that will never be persisted", () => {
  const doc = workspace(1);
  const store = useMindMapStore.getState();
  store.setDocument(doc);
  const before = JSON.stringify([...doc.nodes]);
  const fileId = "file:file-0.md";
  expect(store.addChildNode(fileId, "Unsaved child")).toBeNull();
  store.renameNode(fileId, "Unsaved title");
  store.updateNodeContent(fileId, "Unsaved content");
  store.deleteNodeAction(fileId);
  expect(JSON.stringify([...useMindMapStore.getState().document!.nodes])).toBe(before);
  expect(useMindMapStore.getState().readOnly).toBe(true);

  // Storage permission refreshes must not unlock a derived document.
  store.setStorageMetadata(undefined);
  expect(useMindMapStore.getState().readOnly).toBe(true);
});

test("opening a source file after the workspace enables persistable edits", () => {
  const store = useMindMapStore.getState();
  store.setDocument(workspace(1));
  const doc = parseFile("digitaler-avatar.md", "# Digitaler Avatar\n");
  store.setDocument(doc);
  expect(useMindMapStore.getState().readOnly).toBe(false);
  for (const title of ["Rolle", "Name", "Icon"]) store.addChildNode(doc.rootId, title);
  const markdown = serializeToMarkdown(useMindMapStore.getState().document!);
  const restored = parseFile(doc.filePath, markdown);
  expect([...restored.nodes.values()].map((node) => node.title)).toEqual(["Digitaler Avatar", "Rolle", "Name", "Icon"]);
});

test("large workspace starts on file level with cross-links and can expand headings", () => {
  const doc = workspace(100);
  useMindMapStore.getState().setDocument(doc);
  const state = useMindMapStore.getState();
  expect(state.nodes).toHaveLength(101);
  expect(state.document!.nodes.size).toBe(201);
  expect(state.edges.some((edge) => edge.source === "file:file-0.md" && edge.target === "file:file-1.md")).toBe(true);
  state.toggleCollapse("file:file-0.md");
  expect(useMindMapStore.getState().nodes).toHaveLength(102);
  useMindMapStore.getState().setDocument(doc);
  expect(useMindMapStore.getState().collapsedIds.has("file:file-0.md")).toBe(false);
});

test("small workspaces retain their expanded initial view", () => {
  useMindMapStore.getState().setDocument(workspace(3));
  expect(useMindMapStore.getState().nodes).toHaveLength(7);
});


test("new files in a large workspace start collapsed without losing existing expansions", () => {
  useMindMapStore.getState().setDocument(workspace(100));
  useMindMapStore.getState().toggleCollapse("file:file-0.md");
  useMindMapStore.getState().setDocument(workspace(101));
  expect(useMindMapStore.getState().collapsedIds.has("file:file-100.md")).toBe(true);
  expect(useMindMapStore.getState().collapsedIds.has("file:file-0.md")).toBe(false);
});
