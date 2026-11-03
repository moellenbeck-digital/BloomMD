import { describe, expect, test } from "bun:test";
import { applyViewerCommand, clampScale, INITIAL_VIEW, viewerCommandForKey, wheelFactor, ZOOM_MAX, ZOOM_MIN, ZOOM_STEP, zoomBy, zoomPercent } from "./visual-zoom";

describe("visual zoom", () => {
  test("zooms in steps and stays within the limits", () => {
    let view = INITIAL_VIEW;
    for (let index = 0; index < 40; index += 1) view = applyViewerCommand(view, "zoom-in");
    expect(view.scale).toBe(ZOOM_MAX);
    for (let index = 0; index < 80; index += 1) view = applyViewerCommand(view, "zoom-out");
    expect(view.scale).toBe(ZOOM_MIN);
    expect(clampScale(Number.NaN)).toBe(1);
  });

  test("reset restores the initial view, including the pan offset", () => {
    const moved = applyViewerCommand(applyViewerCommand(INITIAL_VIEW, "zoom-in"), "pan-left");
    expect(moved).not.toEqual(INITIAL_VIEW);
    expect(applyViewerCommand(moved, "reset")).toEqual(INITIAL_VIEW);
  });

  test("zooming at a point keeps that point fixed", () => {
    const anchor = { x: 100, y: -40 };
    const view = zoomBy({ scale: 1, x: 10, y: 5 }, 2, anchor);
    // The content point under the anchor before: (anchor - offset) / scale. It must be the same after.
    expect((anchor.x - view.x) / view.scale).toBeCloseTo((anchor.x - 10) / 1);
    expect((anchor.y - view.y) / view.scale).toBeCloseTo((anchor.y - 5) / 1);
  });

  test("one wheel notch is one zoom step; direction follows the wheel", () => {
    expect(wheelFactor(-100)).toBeCloseTo(ZOOM_STEP);
    expect(wheelFactor(100)).toBeCloseTo(1 / ZOOM_STEP);
    expect(zoomPercent({ scale: 1.25, x: 0, y: 0 })).toBe(125);
  });

  test("maps keys to commands and leaves browser shortcuts alone", () => {
    expect(viewerCommandForKey({ key: "+" })).toBe("zoom-in");
    expect(viewerCommandForKey({ key: "=" })).toBe("zoom-in");
    expect(viewerCommandForKey({ key: "-" })).toBe("zoom-out");
    expect(viewerCommandForKey({ key: "0" })).toBe("reset");
    expect(viewerCommandForKey({ key: "ArrowLeft" })).toBe("pan-left");
    expect(viewerCommandForKey({ key: "ArrowDown" })).toBe("pan-down");
    expect(viewerCommandForKey({ key: "+", ctrlKey: true })).toBeNull();
    expect(viewerCommandForKey({ key: "0", metaKey: true })).toBeNull();
    expect(viewerCommandForKey({ key: "a" })).toBeNull();
  });
});
