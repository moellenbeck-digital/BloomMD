import { afterEach, expect, test } from "bun:test";
import { buildWorkspaceMindMap, parseFile, serializeToMarkdown } from "@bloommd/core/browser";
import { useMindMapStore } from "./useMindMapStore";

function workspace(count: number, headingsPerFile = 1) {
  return buildWorkspaceMindMap(Array.from({ length: count }, (_, index) => ({
    path: `file-${index}.md`, markdown: `# Topic ${index}\n\n[[file-${(index + 1) % count}]]\n`
      + Array.from({ length: headingsPerFile - 1 }, (_, heading) => `\n## Detail ${heading}\n`).join(""),
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

test("heading-heavy workspaces start compact even with fewer than 100 files", () => {
  const doc = workspace(10, 30);
  const before = JSON.stringify([...doc.nodes]);
  useMindMapStore.getState().setDocument(doc);
  expect(useMindMapStore.getState().nodes).toHaveLength(11);
  expect(useMindMapStore.getState().document!.nodes.size).toBe(311);
  expect(JSON.stringify([...doc.nodes])).toBe(before);
  expect(useMindMapStore.getState().edges.some((edge) => edge.source === "file:file-0.md" && edge.target === "file:file-1.md")).toBe(true);
  useMindMapStore.getState().toggleCollapse("file:file-0.md");
  expect(useMindMapStore.getState().nodes).toHaveLength(41);
});

test("refreshing a heading-heavy workspace preserves expansion and collapses new files", () => {
  useMindMapStore.getState().setDocument(workspace(10, 30));
  useMindMapStore.getState().toggleCollapse("file:file-0.md");
  useMindMapStore.getState().setDocument(workspace(11, 30));
  expect(useMindMapStore.getState().collapsedIds.has("file:file-0.md")).toBe(false);
  expect(useMindMapStore.getState().collapsedIds.has("file:file-10.md")).toBe(true);
  expect(useMindMapStore.getState().nodes).toHaveLength(42);
});

test("large nested workspaces show top-level folders and expand one branch at a time", () => {
  const doc = buildWorkspaceMindMap(Array.from({ length: 200 }, (_, index) => ({
    path: `section-${index % 4}/file-${index}.md`, markdown: `# Topic ${index}\n`,
  })), { source: "/temporary-vault" });
  const before = JSON.stringify([...doc.nodes]);
  useMindMapStore.getState().setDocument(doc);
  const state = useMindMapStore.getState();
  expect(state.nodes).toHaveLength(5);
  expect(state.collapsedIds.has(doc.rootId)).toBe(false);
  const folder = [...doc.nodes.values()].find((node) => node.metadata?.kind === "folder" && node.id !== doc.rootId)!;
  state.toggleCollapse(folder.id);
  expect(useMindMapStore.getState().nodes).toHaveLength(55);
  useMindMapStore.getState().setDocument(doc);
  expect(useMindMapStore.getState().collapsedIds.has(folder.id)).toBe(false);
  expect(useMindMapStore.getState().nodes).toHaveLength(55);
  expect(JSON.stringify([...doc.nodes])).toBe(before);
});


test("new files in a large workspace start collapsed without losing existing expansions", () => {
  useMindMapStore.getState().setDocument(workspace(100));
  useMindMapStore.getState().toggleCollapse("file:file-0.md");
  useMindMapStore.getState().setDocument(workspace(101));
  expect(useMindMapStore.getState().collapsedIds.has("file:file-100.md")).toBe(true);
  expect(useMindMapStore.getState().collapsedIds.has("file:file-0.md")).toBe(false);
});
