import { describe, expect, test } from "bun:test";
import { createInkDocument, type InkDocument } from "./ink-document";
import type { InkStroke } from "./ink-geometry";
import { activeColor, adaptColor, createInkEditorState, extractSelection, inkEditorReducer, titleForExtract, itemsHitAt, linkBounds, pruneLinks, textAt, routePointer, strokesHitAt, type InkEditorAction, type InkEditorState } from "./ink-state";

const stroke = (id: string, x = 0): InkStroke => ({
  id,
  tool: "pen",
  color: "#1f2937",
  size: 3,
  points: [[x, 0, 0.5], [x + 10, 10, 0.5], [x + 20, 0, 0.5]],
});

const run = (state: InkEditorState, ...actions: InkEditorAction[]) => actions.reduce(inkEditorReducer, state);

describe("inkEditorReducer", () => {
  test("committing a stroke adds it as one undo step", () => {
    const state = run(createInkEditorState(createInkDocument()), { type: "commitStroke", stroke: stroke("a") });
    expect(state.document.strokes.map((entry) => entry.id)).toEqual(["a"]);
    expect(state.past).toHaveLength(1);
    expect(state.future).toHaveLength(0);
  });

  test("ignores empty strokes", () => {
    const initial = createInkEditorState(createInkDocument());
    expect(run(initial, { type: "commitStroke", stroke: { ...stroke("a"), points: [] } })).toBe(initial);
  });

  test("undo and redo walk the history and stop at its ends", () => {
    const drawn = run(createInkEditorState(createInkDocument()), { type: "commitStroke", stroke: stroke("a") }, { type: "commitStroke", stroke: stroke("b") });
    const undone = run(drawn, { type: "undo" }, { type: "undo" }, { type: "undo" });
    expect(undone.document.strokes).toEqual([]);
    expect(undone.future).toHaveLength(2);
    const redone = run(undone, { type: "redo" }, { type: "redo" }, { type: "redo" });
    expect(redone.document.strokes.map((entry) => entry.id)).toEqual(["a", "b"]);
  });

  test("a new stroke after undo clears the redo stack", () => {
    const state = run(createInkEditorState(createInkDocument()), { type: "commitStroke", stroke: stroke("a") }, { type: "undo" }, { type: "commitStroke", stroke: stroke("b") });
    expect(state.future).toEqual([]);
    expect(state.document.strokes.map((entry) => entry.id)).toEqual(["b"]);
  });

  test("erasing removes only the given strokes and prunes their links", () => {
    const document: InkDocument = {
      ...createInkDocument(),
      strokes: [stroke("a"), stroke("b", 50), stroke("c", 100)],
      links: [
        { id: "l1", target: "Arbeit", strokeIds: ["a", "b"] },
        { id: "l2", target: "Wärme", strokeIds: ["c"] },
      ],
    };
    const state = run(createInkEditorState(document), { type: "eraseStrokes", strokeIds: ["b", "c"] });
    expect(state.document.strokes.map((entry) => entry.id)).toEqual(["a"]);
    expect(state.document.links).toEqual([{ id: "l1", target: "Arbeit", strokeIds: ["a"] }]);
    expect(run(state, { type: "undo" }).document).toBe(document);
  });

  test("erasing nothing does not create a history entry", () => {
    const initial = createInkEditorState({ ...createInkDocument(), strokes: [stroke("a")] });
    expect(run(initial, { type: "eraseStrokes", strokeIds: ["missing"] })).toBe(initial);
  });

  test("read-only drawings reject edits", () => {
    const initial = createInkEditorState(createInkDocument(), true);
    expect(run(initial, { type: "commitStroke", stroke: stroke("a") }).document.strokes).toEqual([]);
  });

  test("pen and highlighter remember their own color", () => {
    const state = run(
      createInkEditorState(createInkDocument()),
      { type: "setColor", color: "#2563eb" },
      { type: "setTool", tool: "highlighter" },
      { type: "setColor", color: "#16a34a" },
    );
    expect(activeColor(state)).toBe("#16a34a");
    expect(activeColor(run(state, { type: "setTool", tool: "pen" }))).toBe("#2563eb");
  });

  test("loading a drawing keeps tool settings but resets history", () => {
    const state = run(createInkEditorState(createInkDocument()), { type: "setTool", tool: "highlighter" }, { type: "commitStroke", stroke: stroke("a") });
    const loaded = run(state, { type: "load", document: createInkDocument(), readOnly: false });
    expect(loaded.tool).toBe("highlighter");
    expect(loaded.past).toEqual([]);
  });
});

describe("pruneLinks", () => {
  test("returns the same document when nothing changes", () => {
    const document: InkDocument = { ...createInkDocument(), strokes: [stroke("a")], links: [{ id: "l", target: "A", strokeIds: ["a"] }] };
    expect(pruneLinks(document)).toBe(document);
  });
});

describe("strokesHitAt", () => {
  test("finds strokes under the eraser", () => {
    expect(strokesHitAt([stroke("a"), stroke("b", 200)], 10, 10, 2)).toEqual(["a"]);
  });
});

describe("routePointer", () => {
  const context = { drawWithFinger: false, penDetected: false, penDown: false, readOnly: false };

  test("the pen draws and fingers move the canvas", () => {
    expect(routePointer("pen", context)).toBe("draw");
    expect(routePointer("touch", context)).toBe("navigate");
    expect(routePointer("mouse", context)).toBe("draw");
  });

  test("fingers draw only on devices that never reported a pen", () => {
    expect(routePointer("touch", { ...context, drawWithFinger: true })).toBe("draw");
    expect(routePointer("touch", { ...context, drawWithFinger: true, penDetected: true })).toBe("navigate");
  });

  test("a resting palm is ignored while the pen is down", () => {
    expect(routePointer("touch", { ...context, penDown: true, penDetected: true })).toBe("ignore");
  });

  test("read-only drawings can only be navigated", () => {
    expect(routePointer("pen", { ...context, readOnly: true })).toBe("navigate");
    expect(routePointer("mouse", { ...context, readOnly: true })).toBe("navigate");
    expect(routePointer("touch", { ...context, drawWithFinger: true, readOnly: true })).toBe("navigate");
  });
});

describe("lasso selection", () => {
  const withStrokes = () => createInkEditorState({
    ...createInkDocument(),
    strokes: [stroke("a"), stroke("b", 50), stroke("c", 100)],
    links: [{ id: "l1", target: "Arbeit", strokeIds: ["b"] }],
  });

  test("selects only existing strokes and clears the selection when leaving the lasso", () => {
    const selected = run(withStrokes(), { type: "setTool", tool: "lasso" }, { type: "select", strokeIds: ["a", "missing"] });
    expect(selected.selection).toEqual(["a"]);
    expect(run(selected, { type: "setTool", tool: "pen" }).selection).toEqual([]);
  });

  test("moves and scales only the selection as one undo step", () => {
    const state = run(
      withStrokes(),
      { type: "setTool", tool: "lasso" },
      { type: "select", strokeIds: ["b"] },
      { type: "transformSelection", transform: { dx: 10, dy: 5, scale: 0.5, originX: 50, originY: 0 } },
    );
    const [a, b] = state.document.strokes;
    expect(a?.points[0]).toEqual([0, 0, 0.5]);
    expect(b?.points[0]).toEqual([60, 5, 0.5]);
    expect(b?.points[1]).toEqual([65, 10, 0.5]);
    expect(b?.size).toBe(1.5);
    expect(state.past).toHaveLength(1);
    expect(run(state, { type: "undo" }).document.strokes[1]?.points[0]).toEqual([50, 0, 0.5]);
  });

  test("an identity transform is not an edit", () => {
    const selected = run(withStrokes(), { type: "setTool", tool: "lasso" }, { type: "select", strokeIds: ["a"] });
    expect(run(selected, { type: "transformSelection", transform: { dx: 0, dy: 0, scale: 1, originX: 0, originY: 0 } })).toBe(selected);
  });

  test("deleting the selection removes its strokes and links", () => {
    const state = run(withStrokes(), { type: "setTool", tool: "lasso" }, { type: "select", strokeIds: ["b", "c"] }, { type: "deleteSelection" });
    expect(state.document.strokes.map((entry) => entry.id)).toEqual(["a"]);
    expect(state.document.links).toEqual([]);
    expect(state.selection).toEqual([]);
  });

  test("deleting captured items leaves a selection made in the meantime", () => {
    const state = run(withStrokes(), { type: "setTool", tool: "lasso" }, { type: "select", strokeIds: ["c"] }, { type: "deleteSelection", ids: ["a"] });
    expect(state.document.strokes.map((entry) => entry.id)).toEqual(["b", "c"]);
    expect(state.selection).toEqual(["c"]);
  });

  test("a color pick recolors the selection instead of changing the pen", () => {
    const state = run(withStrokes(), { type: "setTool", tool: "lasso" }, { type: "select", strokeIds: ["a"] }, { type: "setColor", color: "#dc2626" });
    expect(state.document.strokes.map((entry) => entry.color)).toEqual(["#dc2626", "#1f2937", "#1f2937"]);
    expect(activeColor(state)).toBe("#1f2937");
  });

  test("undo drops selected strokes that no longer exist", () => {
    const drawn = run(withStrokes(), { type: "commitStroke", stroke: stroke("d", 150) }, { type: "setTool", tool: "lasso" }, { type: "select", strokeIds: ["a", "d"] });
    expect(run(drawn, { type: "undo" }).selection).toEqual(["a"]);
  });
});

describe("note links", () => {
  const selected = (...ids: string[]) => run(
    createInkEditorState({ ...createInkDocument(), strokes: [stroke("w"), stroke("a", 50), stroke("q", 100)], links: [] }),
    { type: "setTool", tool: "lasso" },
    { type: "select", strokeIds: ids },
  );

  test("links the selected handwriting to a note", () => {
    const state = run(selected("a"), { type: "linkSelection", linkId: "l1", target: " Arbeit " });
    expect(state.document.links).toEqual([{ id: "l1", target: "Arbeit", strokeIds: ["a"] }]);
    expect(state.past).toHaveLength(1);
  });

  test("relinking strokes replaces their previous target", () => {
    const first = run(selected("w", "a"), { type: "linkSelection", linkId: "l1", target: "Arbeit" });
    const second = run(first, { type: "select", strokeIds: ["a"] }, { type: "linkSelection", linkId: "l2", target: "Wärme" });
    expect(second.document.links).toEqual([
      { id: "l1", target: "Arbeit", strokeIds: ["w"] },
      { id: "l2", target: "Wärme", strokeIds: ["a"] },
    ]);
  });

  test("ignores empty targets and empty selections", () => {
    const state = selected("a");
    expect(run(state, { type: "linkSelection", linkId: "l1", target: "  " })).toBe(state);
    expect(run(selected(), { type: "linkSelection", linkId: "l1", target: "Arbeit" }).document.links).toEqual([]);
  });

  test("unlinks and computes link bounds", () => {
    const linked = run(selected("a"), { type: "linkSelection", linkId: "l1", target: "Arbeit" });
    expect(linkBounds(linked.document, linked.document.links[0]!)).toEqual({ minX: 48.5, minY: -1.5, maxX: 71.5, maxY: 11.5 });
    expect(run(linked, { type: "unlink", linkId: "l1" }).document.links).toEqual([]);
  });
});

describe("paper background", () => {
  test("new editors start with the palette of their paper", () => {
    expect(activeColor(createInkEditorState(createInkDocument("dark")))).toBe("#f3f4f6");
    expect(activeColor(createInkEditorState(createInkDocument("paper")))).toBe("#1f2937");
  });

  test("switching to dark paper swaps palette colors and keeps custom ones", () => {
    const document = { ...createInkDocument("paper"), strokes: [stroke("a"), { ...stroke("b"), color: "#123456" }] };
    const dark = run(createInkEditorState(document), { type: "setBackground", background: "dark" });
    expect(dark.document.background).toBe("dark");
    expect(dark.document.strokes.map((entry) => entry.color)).toEqual(["#f3f4f6", "#123456"]);
    expect(activeColor(dark)).toBe("#f3f4f6");
    expect(run(dark, { type: "undo" }).document.strokes[0]?.color).toBe("#1f2937");
  });

  test("adaptColor maps between palettes and leaves transparent on the light palette", () => {
    expect(adaptColor("#2563eb", "paper", "dark")).toBe("#60a5fa");
    expect(adaptColor("#60a5fa", "dark", "transparent")).toBe("#2563eb");
    expect(adaptColor("#abcdef", "paper", "dark")).toBe("#abcdef");
  });
});

describe("text boxes in the editor", () => {
  const text = (id: string, x: number, content = "Arbeit") => ({ id, x, y: 0, text: content, size: 20, color: "#1f2937" });

  test("adds, edits and removes emptied text as undo steps", () => {
    const added = run(createInkEditorState(createInkDocument()), { type: "upsertText", text: text("t", 0) });
    expect(added.document.texts?.map((entry) => entry.text)).toEqual(["Arbeit"]);
    const edited = run(added, { type: "upsertText", text: text("t", 0, "Wärme") });
    expect(edited.document.texts?.[0]?.text).toBe("Wärme");
    expect(run(edited, { type: "upsertText", text: text("t", 0, "Wärme") })).toBe(edited);
    const emptied = run(edited, { type: "upsertText", text: text("t", 0, " ") });
    expect(emptied.document.texts).toEqual([]);
    expect(emptied.past).toHaveLength(3);
    expect(run(createInkEditorState(createInkDocument()), { type: "upsertText", text: text("t", 0, "") }).past).toHaveLength(0);
  });

  test("lasso moves and scales text, recolors and deletes it with its links", () => {
    const document = { ...createInkDocument(), strokes: [stroke("s")], texts: [text("t", 100)], links: [{ id: "l", target: "Arbeit", strokeIds: ["t"] }] };
    const selected = run(createInkEditorState(document), { type: "setTool", tool: "lasso" }, { type: "select", strokeIds: ["t"] });
    const moved = run(selected, { type: "transformSelection", transform: { dx: 10, dy: 5, scale: 2, originX: 100, originY: 0 } });
    expect(moved.document.texts?.[0]).toMatchObject({ x: 110, y: 5, size: 40 });
    expect(run(selected, { type: "setColor", color: "#dc2626" }).document.texts?.[0]?.color).toBe("#dc2626");
    const deleted = run(selected, { type: "deleteSelection" });
    expect(deleted.document.texts).toEqual([]);
    expect(deleted.document.links).toEqual([]);
    expect(deleted.document.strokes.map((entry) => entry.id)).toEqual(["s"]);
  });

  test("eraser and taps find text boxes", () => {
    const document = { ...createInkDocument(), texts: [text("t", 100)] };
    expect(itemsHitAt(document, 110, 10, 2)).toEqual(["t"]);
    expect(textAt(document, 110, 10)?.id).toBe("t");
    expect(textAt(document, 400, 10)).toBeNull();
    expect(linkBounds(document, { id: "l", target: "A", strokeIds: ["t"] })).toEqual({ minX: 100, minY: 0, maxX: 167.2, maxY: 25 });
  });
});

describe("extractSelection", () => {
  test("moves the selection to the origin and keeps only links fully inside it", () => {
    const document = {
      ...createInkDocument("dark"),
      strokes: [stroke("a", 100), stroke("b", 300)],
      texts: [{ id: "t", x: 120, y: 40, text: "Arbeit", size: 20, color: "#fff" }],
      links: [{ id: "in", target: "Arbeit", strokeIds: ["a", "t"] }, { id: "out", target: "Wärme", strokeIds: ["a", "b"] }],
    };
    const state = run(createInkEditorState(document), { type: "setTool", tool: "lasso" }, { type: "select", strokeIds: ["a", "t"] });
    const extracted = extractSelection(state, "dark")!;
    expect(extracted.strokes.map((entry) => entry.id)).toEqual(["a"]);
    expect(extracted.strokes[0]?.points[0]).toEqual([1.5, 1.5, 0.5]);
    expect(extracted.texts?.[0]).toMatchObject({ id: "t", x: 21.5, y: 41.5 });
    expect(extracted.links.map((link) => link.id)).toEqual(["in"]);
    expect(extracted.background).toBe("dark");
    expect(titleForExtract(extracted)).toBe("Arbeit");
    expect(titleForExtract({ ...extracted, texts: [] })).toBe("Sketch");
  });

  test("returns null without a selection", () => {
    expect(extractSelection(createInkEditorState(createInkDocument()), "paper")).toBeNull();
  });
});
