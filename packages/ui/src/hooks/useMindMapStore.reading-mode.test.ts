import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { parseFile, serializeToMarkdown } from "@bloommd/core/browser";
import { useMindMapStore } from "./useMindMapStore";

const MARKDOWN = "# Root\n\nIntro\n\n## Alpha\n\nAlpha text\n\n### Deep\n\nDeep text\n\n## Beta\n\nBeta text\n";

function open(path = "a.md", markdown = MARKDOWN) {
  useMindMapStore.getState().setDocument(parseFile(path, markdown));
  return useMindMapStore.getState().document!;
}

/** `serializeToMarkdown` stamps `updated` on every call; the comparison is about the content. */
function sourceOf(doc: Parameters<typeof serializeToMarkdown>[0]): string {
  return serializeToMarkdown(doc).replace(/^updated: .*\n/m, "");
}

function nodeIdByTitle(title: string): string {
  const doc = useMindMapStore.getState().document!;
  return [...doc.nodes.values()].find((node) => node.title === title)!.id;
}

beforeEach(() => {
  useMindMapStore.setState({ canvasMode: "map", readingReturn: null, mapViewport: null, restoreViewport: null });
});

afterEach(() => {
  useMindMapStore.getState().setDocument(null);
  useMindMapStore.setState({ canvasMode: "map", readingReturn: null });
});

describe("@t54 reading mode: mode switch", () => {
  test("@t54 enter and exit restore the previous mode, selection and focus", () => {
    open();
    const alpha = nodeIdByTitle("Alpha");
    const store = useMindMapStore.getState();
    store.setCanvasMode("outline");
    store.setSelectedNodeId(alpha);
    store.setFocusNodeId(alpha);

    useMindMapStore.getState().enterReadingMode();
    expect(useMindMapStore.getState().canvasMode).toBe("reading");

    useMindMapStore.getState().exitReadingMode();
    const after = useMindMapStore.getState();
    expect(after.canvasMode).toBe("outline");
    expect(after.selectedNodeId).toBe(alpha);
    expect(after.focusNodeId).toBe(alpha);
    expect(after.readingReturn).toBeNull();
  });

  test("@t54 setCanvasMode('reading') enters the reading mode and remembers where it came from", () => {
    open();
    useMindMapStore.getState().setCanvasMode("presentation");
    useMindMapStore.getState().setCanvasMode("reading");
    expect(useMindMapStore.getState().readingReturn?.mode).toBe("presentation");
    useMindMapStore.getState().exitReadingMode();
    expect(useMindMapStore.getState().canvasMode).toBe("presentation");
  });

  test("@t54 entering twice keeps the first return state", () => {
    open();
    useMindMapStore.getState().setCanvasMode("outline");
    useMindMapStore.getState().enterReadingMode();
    useMindMapStore.getState().enterReadingMode();
    expect(useMindMapStore.getState().readingReturn?.mode).toBe("outline");
  });

  test("@t54 the map position comes back to the exact viewport once", () => {
    open();
    useMindMapStore.getState().setMapViewport({ x: 120, y: -40, zoom: 1.4 });
    useMindMapStore.getState().enterReadingMode();
    expect(useMindMapStore.getState().readingReturn?.viewport).toEqual({ x: 120, y: -40, zoom: 1.4 });
    useMindMapStore.getState().exitReadingMode();
    expect(useMindMapStore.getState().canvasMode).toBe("map");
    expect(useMindMapStore.getState().restoreViewport).toEqual({ x: 120, y: -40, zoom: 1.4 });

    // Any other mode change drops the one-shot, so a later map mount fits the whole map again.
    useMindMapStore.getState().setCanvasMode("outline");
    expect(useMindMapStore.getState().restoreViewport).toBeNull();
  });

  test("@t54 the open editor panel is closed while reading and comes back afterwards", () => {
    open();
    const alpha = nodeIdByTitle("Alpha");
    useMindMapStore.getState().setSelectedNodeId(alpha);
    useMindMapStore.getState().setEditorVisible(true);
    useMindMapStore.getState().enterReadingMode();
    expect(useMindMapStore.getState().editorVisible).toBe(false);

    useMindMapStore.getState().setEditorVisible(true);
    useMindMapStore.getState().toggleEditor();
    expect(useMindMapStore.getState().editorVisible).toBe(false);

    useMindMapStore.getState().exitReadingMode();
    expect(useMindMapStore.getState().editorVisible).toBe(true);
  });

  test("@t54 a host that needs the map (export) leaves the reading mode for the map", () => {
    open();
    useMindMapStore.getState().setCanvasMode("outline");
    useMindMapStore.getState().enterReadingMode();
    useMindMapStore.getState().setCanvasMode("map");
    expect(useMindMapStore.getState().canvasMode).toBe("map");
    expect(useMindMapStore.getState().readingReturn).toBeNull();
    useMindMapStore.getState().setCanvasMode("reading");
    expect(useMindMapStore.getState().canvasMode).toBe("reading");
  });
});

describe("@t54 reading mode: document switch", () => {
  test("@t54 switching the document while reading keeps the reading mode", () => {
    open("a.md");
    useMindMapStore.getState().enterReadingMode();
    open("b.md", "# B\n\nOther\n");
    expect(useMindMapStore.getState().canvasMode).toBe("reading");
  });

  test("@t54 after a switch, back to map restores the mode for the new document without stale selection", () => {
    open("a.md");
    const alpha = nodeIdByTitle("Alpha");
    useMindMapStore.getState().setSelectedNodeId(alpha);
    useMindMapStore.getState().setMapViewport({ x: 1, y: 2, zoom: 3 });
    useMindMapStore.getState().enterReadingMode();

    const other = open("b.md", "# B\n\n## Child\n");
    useMindMapStore.getState().exitReadingMode();
    const after = useMindMapStore.getState();
    expect(after.canvasMode).toBe("map");
    expect(after.selectedNodeId).toBe(other.rootId);
    expect(after.restoreViewport).toBeNull();
    expect(after.focusNodeId).toBeNull();
  });

  test("@t54 returning to the original document restores its selection (tab round trip)", () => {
    const original = open("a.md");
    const alpha = nodeIdByTitle("Alpha");
    useMindMapStore.getState().setSelectedNodeId(alpha);
    useMindMapStore.getState().enterReadingMode();
    open("b.md", "# B\n");
    useMindMapStore.getState().setDocument(original);
    useMindMapStore.getState().exitReadingMode();
    expect(useMindMapStore.getState().selectedNodeId).toBe(alpha);
  });

  test("@t54 exit without a stored return state falls back to the map", () => {
    open();
    useMindMapStore.setState({ canvasMode: "reading", readingReturn: null });
    useMindMapStore.getState().exitReadingMode();
    expect(useMindMapStore.getState().canvasMode).toBe("map");
  });
});

describe("@t54 reading mode never changes the source", () => {
  test("@t54 enter and exit leave the Markdown identical and produce no Yjs update", () => {
    const doc = open();
    const before = sourceOf(doc);
    const yDoc = useMindMapStore.getState().yDoc!;
    let updates = 0;
    yDoc.on("update", () => { updates += 1; });
    const { editRevision } = useMindMapStore.getState();

    useMindMapStore.getState().setCanvasMode("outline");
    useMindMapStore.getState().enterReadingMode();
    useMindMapStore.getState().setSelectedNodeId(nodeIdByTitle("Beta"));
    useMindMapStore.getState().exitReadingMode();
    useMindMapStore.getState().enterReadingMode();
    useMindMapStore.getState().setCanvasMode("map");

    const after = useMindMapStore.getState();
    expect(sourceOf(after.document!)).toBe(before);
    expect(updates).toBe(0);
    expect(after.editRevision).toBe(editRevision);
    expect(after.savedRevision).toBe(0);
  });
});
