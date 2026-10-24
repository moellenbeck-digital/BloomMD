import { afterEach, beforeAll, describe, expect, test } from "bun:test";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createInkDocument, type InkDocument } from "./ink-document";
import { InkEditor } from "./ink-editor";
import { PEN_COOLDOWN_MS } from "./pen-gestures";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLElement | null = null;

beforeAll(() => {
  // happy-dom has no pointer capture; the editor only needs the calls to exist.
  const prototype = window.HTMLElement.prototype as unknown as Record<string, unknown>;
  prototype.setPointerCapture ??= () => undefined;
  prototype.releasePointerCapture ??= () => undefined;
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  root = null;
  container = null;
});

function renderEditor(document: InkDocument) {
  const changes: InkDocument[] = [];
  container = window.document.createElement("div");
  window.document.body.appendChild(container);
  root = createRoot(container);
  act(() => root!.render(createElement(InkEditor, {
    document,
    readOnly: false,
    onChange: (next: InkDocument) => changes.push(next),
    onDone: () => undefined,
    onPickNote: async () => null,
    onHoverLink: () => undefined,
    onOpenLink: () => undefined,
  })));
  const surface = container.querySelector(".bloommd-ink-surface") as HTMLElement;
  const pointer = (type: string, pointerId: number, pointerType: string, x: number, y: number) => {
    act(() => {
      surface.dispatchEvent(new window.PointerEvent(type, { bubbles: true, cancelable: true, pointerId, pointerType, clientX: x, clientY: y, button: 0, pressure: 0.5 }) as unknown as Event);
    });
  };
  const click = (label: string) => {
    act(() => (container!.querySelector(`[aria-label="${label}"]`) as HTMLButtonElement).click());
  };
  return { changes, surface, pointer, click, container };
}

describe("InkEditor", () => {
  test("does not save a drawing that was only opened", () => {
    const editor = renderEditor(createInkDocument());
    expect(editor.changes).toHaveLength(0);
  });

  test("saves an undo back to the opened state", () => {
    const opened = createInkDocument();
    const editor = renderEditor(opened);
    editor.pointer("pointerdown", 1, "pen", 10, 10);
    editor.pointer("pointermove", 1, "pen", 40, 30);
    editor.pointer("pointerup", 1, "pen", 40, 30);
    expect(editor.changes.at(-1)?.strokes).toHaveLength(1);

    editor.click("Undo");
    expect(editor.changes).toHaveLength(2);
    expect(editor.changes.at(-1)).toBe(opened);
  });

  test("a palm that touched down before the pen does not move the canvas mid-stroke", () => {
    const editor = renderEditor(createInkDocument());
    editor.pointer("pointerdown", 7, "touch", 200, 200);
    editor.pointer("pointerdown", 1, "pen", 10, 10);
    editor.pointer("pointermove", 7, "touch", 260, 260);
    editor.pointer("pointermove", 1, "pen", 40, 10);
    editor.pointer("pointerup", 1, "pen", 40, 10);
    editor.pointer("pointerup", 7, "touch", 260, 260);

    const points = editor.changes.at(-1)!.strokes[0]!.points;
    // Without palm rejection the canvas pans by (60, 60) and the stroke ends at world (-20, -50).
    expect(points.at(-1)?.slice(0, 2)).toEqual([40, 10]);
    expect(points.every(([, y]) => y === 10)).toBe(true);
  });

  test("fingers still pan after the pen tapped with the text tool", async () => {
    const editor = renderEditor(createInkDocument());
    editor.click("Text");

    // The pen taps the paper to place a text field: no gesture starts, so nothing must stay "down".
    editor.pointer("pointerdown", 1, "pen", 50, 50);
    editor.pointer("pointerup", 1, "pen", 50, 50);
    // A finger landing right after the pen lifts is taken for the writing hand; wait that out.
    await new Promise((resolve) => setTimeout(resolve, PEN_COOLDOWN_MS + 50));

    const transform = () => editor.container.querySelector(".bloommd-ink-svg > g")!.getAttribute("transform");
    const before = transform();
    editor.pointer("pointerdown", 2, "touch", 100, 100);
    editor.pointer("pointermove", 2, "touch", 140, 130);
    editor.pointer("pointerup", 2, "touch", 140, 130);
    expect(transform()).not.toBe(before);
    expect(transform()).toContain("translate(40 30)");
  });
});
