import { describe, expect, test } from "bun:test";
import { documentToYDoc, parseFile, serializeToMarkdown, yDocToDocument, yMoveNode, type MindMapDocument } from "@bloommd/core/browser";
import { dropTargetToMoveIntent, findCanvasDropTarget, type CanvasNodeGeometry } from "./canvas-drag";

const nodes: CanvasNodeGeometry[] = [
  { id: "dragged", position: { x: 0, y: 0 }, measured: { width: 100, height: 40 } },
  { id: "target", position: { x: 220, y: 100 }, measured: { width: 120, height: 60 } },
];

function fixtureDocument(): MindMapDocument {
  return parseFile("drag.md", [
    "---",
    "title: Drag Fixture",
    "id: drag-fixture",
    "---",
    "",
    "# Root <!-- bloommd:id=root -->",
    "",
    "## Child A <!-- bloommd:id=child-a -->",
    "",
    "## Child B <!-- bloommd:id=child-b -->",
    "",
    "## Editor <!-- bloommd:id=editor -->",
    "",
  ].join("\n"));
}

describe("findCanvasDropTarget", () => {
  test("returns before for points above the target center", () => {
    expect(findCanvasDropTarget(nodes, "dragged", { x: 280, y: 100 })).toEqual({
      nodeId: "target",
      position: "before",
    });
  });

  test("returns inside for points close to the target center", () => {
    expect(findCanvasDropTarget(nodes, "dragged", { x: 280, y: 130 })).toEqual({
      nodeId: "target",
      position: "inside",
    });
  });

  test("returns after for points below the target center", () => {
    expect(findCanvasDropTarget(nodes, "dragged", { x: 280, y: 160 })).toEqual({
      nodeId: "target",
      position: "after",
    });
  });

  test("ignores the dragged node and points outside the threshold", () => {
    expect(findCanvasDropTarget(nodes, "dragged", { x: 50, y: 20 })).toBeNull();
    expect(findCanvasDropTarget(nodes, "dragged", { x: 900, y: 900 })).toBeNull();
  });
});

describe("dropTargetToMoveIntent", () => {
  test("maps inside drops to reparenting", () => {
    expect(dropTargetToMoveIntent(fixtureDocument(), { nodeId: "child-b", position: "inside" })).toEqual({
      newParentId: "child-b",
    });
  });

  test("maps before and after drops to sibling insertion indexes", () => {
    const doc = fixtureDocument();

    expect(dropTargetToMoveIntent(doc, { nodeId: "child-b", position: "before" })).toEqual({
      newParentId: "root",
      index: 1,
    });
    expect(dropTargetToMoveIntent(doc, { nodeId: "child-b", position: "after" })).toEqual({
      newParentId: "root",
      index: 2,
    });
  });

  test("does not create before or after moves around the root", () => {
    expect(dropTargetToMoveIntent(fixtureDocument(), { nodeId: "root", position: "before" })).toBeNull();
    expect(dropTargetToMoveIntent(fixtureDocument(), { nodeId: "root", position: "after" })).toBeNull();
  });

  test("produces move intents that preserve Markdown hierarchy", () => {
    const doc = fixtureDocument();
    const intent = dropTargetToMoveIntent(doc, { nodeId: "child-b", position: "inside" });
    expect(intent).not.toBeNull();

    const yDoc = documentToYDoc(doc);
    yMoveNode(yDoc, "child-a", intent!.newParentId, intent!.index);
    const markdown = serializeToMarkdown(yDocToDocument(yDoc));

    expect(markdown).toContain("## Child B");
    expect(markdown).toContain("### Child A");
  });
});
