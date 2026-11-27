import { afterEach, expect, test } from "bun:test";
import { buildWorkspaceMindMap } from "@bloommd/core/browser";
import { useMindMapStore } from "./useMindMapStore";

afterEach(() => useMindMapStore.getState().setDocument(null));

test("revealing a hidden search result opens only its ancestors and leaves Markdown unchanged", () => {
  const doc = buildWorkspaceMindMap([
    { path: "Team/note.md", markdown: "# Plan\n## Hidden target\nKeep this text." },
    { path: "Other/note.md", markdown: "# Other\n## Leave folded" },
  ]);
  const store = useMindMapStore;
  store.getState().setDocument(doc);
  const target = [...doc.nodes.values()].find((node) => node.title === "Hidden target")!;
  const other = [...doc.nodes.values()].find((node) => node.title === "Other" && node.metadata?.kind === "folder")!;
  store.getState().toggleCollapse(other.id);
  let parent = target.parentId;
  while (parent && parent !== doc.rootId) {
    store.getState().toggleCollapse(parent);
    parent = doc.nodes.get(parent)?.parentId ?? null;
  }
  store.getState().setFocusNodeId(other.id);
  store.getState().setCanvasMode("outline");
  const before = JSON.stringify([...store.getState().document!.nodes]);
  store.getState().revealNode(target.id);
  const result = store.getState();
  expect(result.selectedNodeId).toBe(target.id);
  expect(result.canvasMode).toBe("map");
  expect(result.focusNodeId).toBeNull();
  expect(result.nodes.some((node) => node.id === target.id)).toBe(true);
  expect(result.collapsedIds.has(other.id)).toBe(true);
  expect(result.editorVisible).toBe(false);
  expect(JSON.stringify([...result.document!.nodes])).toBe(before);
  expect(result.editRevision).toBe(0);
  result.revealNode("missing");
  expect(store.getState().selectedNodeId).toBe(target.id);
});
