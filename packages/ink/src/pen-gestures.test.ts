import { describe, expect, test } from "bun:test";
import { PALM_WINDOW_MS, PEN_COOLDOWN_MS, PEN_HOLD_MS, PalmGuard, classifyPenStroke, isScratchOut, nodeAt, nodeEdgeAt, strokesUnderScratch } from "./pen-gestures";

const nodes = [
  { id: "a", x: 0, y: 0, width: 100, height: 50 },
  { id: "b", x: 300, y: 0, width: 100, height: 50 },
];

const line = (from: [number, number], to: [number, number], steps = 10): Array<[number, number, number]> =>
  Array.from({ length: steps + 1 }, (_, index) => [from[0] + ((to[0] - from[0]) * index) / steps, from[1] + ((to[1] - from[1]) * index) / steps, 0.5]);

const zigzag = (x: number, y: number, width: number, legs: number): Array<[number, number, number]> =>
  Array.from({ length: legs + 1 }, (_, index) => [x + (index % 2 === 0 ? 0 : width), y + index * 2, 0.5]);

describe("nodeAt", () => {
  test("finds the node under a point", () => {
    expect(nodeAt(nodes, 10, 10)?.id).toBe("a");
    expect(nodeAt(nodes, 200, 10)).toBeNull();
  });
});

describe("classifyPenStroke", () => {
  test("a short touch is a tap on the node below", () => {
    expect(classifyPenStroke([[10, 10, 0.5], [11, 11, 0.5]], nodes, 1, 100)).toEqual({ kind: "tap", node: "a" });
    expect(classifyPenStroke([[200, 200, 0.5]], nodes, 1, 100)).toEqual({ kind: "tap", node: null });
  });

  test("a slow short touch is ink, like the dot on an i", () => {
    expect(classifyPenStroke([[200, 200, 0.5], [201, 200, 0.5]], nodes, 1, 600).kind).toBe("ink");
  });

  test("a slow short touch on a node is still a tap until it becomes a hold", () => {
    expect(classifyPenStroke([[10, 10, 0.5], [11, 10, 0.5]], nodes, 1, 400)).toEqual({ kind: "tap", node: "a" });
    expect(classifyPenStroke([[10, 10, 0.5], [11, 10, 0.5]], nodes, 1, PEN_HOLD_MS - 1)).toEqual({ kind: "tap", node: "a" });
    expect(classifyPenStroke([[200, 200, 0.5], [201, 200, 0.5]], nodes, 1, 400).kind).toBe("ink");
  });

  test("node to node connects", () => {
    expect(classifyPenStroke(line([50, 25], [350, 25]), nodes, 1, 400)).toEqual({ kind: "connect", source: "a", target: "b" });
  });

  test("a strike-through or underline that ends on another node is ink, not a connection", () => {
    expect(classifyPenStroke(line([20, 25], [300, 25]), nodes, 1, 400).kind).toBe("ink");
    expect(classifyPenStroke(line([10, 25], [350, 25]), nodes, 1, 400).kind).toBe("ink");
    expect(classifyPenStroke(line([5, 45], [330, 45]), nodes, 1, 400).kind).toBe("ink");
  });

  test("a connection must start and end clearly inside two nodes", () => {
    expect(classifyPenStroke(line([50, 25], [301, 30]), nodes, 1, 400).kind).toBe("ink");
    expect(classifyPenStroke(line([50, 25], [330, 30]), nodes, 1, 400)).toEqual({ kind: "connect", source: "a", target: "b" });
  });

  test("a straight line from a node's edge into free space branches", () => {
    expect(classifyPenStroke(line([50, 45], [60, 200]), nodes, 1, 400)).toEqual({ kind: "branch", source: "a", end: [60, 200] });
    // Handwriting that merely starts next to a node stays ink.
    expect(classifyPenStroke(line([50, 58], [60, 200]), nodes, 1, 400).kind).toBe("ink");
    expect(classifyPenStroke(line([110, 25], [200, 30]), nodes, 1, 400).kind).toBe("ink");
  });

  test("a line from the middle of a node, or running along it, does not branch", () => {
    expect(classifyPenStroke(line([50, 25], [60, 200]), nodes, 1, 400).kind).toBe("ink");
    // Strike-through of a title that runs on past the node.
    expect(classifyPenStroke(line([20, 25], [200, 25]), nodes, 1, 400).kind).toBe("ink");
    // Underline starting at the left edge.
    expect(classifyPenStroke(line([3, 45], [200, 45]), nodes, 1, 400).kind).toBe("ink");
  });

  test("a short or curly stroke leaving a node stays ink", () => {
    expect(classifyPenStroke(line([50, 45], [50, 80]), nodes, 1, 300).kind).toBe("ink");
    const curly = [...line([50, 45], [50, 200]), ...line([50, 200], [120, 120]), ...line([120, 120], [60, 260])];
    expect(classifyPenStroke(curly, nodes, 1, 600).kind).toBe("ink");
  });

  test("gestures scale with zoom", () => {
    // 60 map units at zoom 2 are 120 screen pixels: long enough to branch.
    expect(classifyPenStroke(line([50, 45], [50, 110]), nodes, 2, 400).kind).toBe("branch");
    // The edge band is in screen pixels too: 10 map units from the border is 20 px at zoom 2.
    expect(classifyPenStroke(line([50, 40], [50, 110]), nodes, 2, 400).kind).toBe("ink");
  });

  test("a zigzag is a scratch-out", () => {
    expect(classifyPenStroke(zigzag(150, 100, 60, 8), nodes, 1, 500)).toEqual({ kind: "scratch" });
  });
});

describe("nodeEdgeAt", () => {
  test("finds the node whose inner rim holds the point", () => {
    expect(nodeEdgeAt(nodes, 50, 45, 16)?.id).toBe("a");
    expect(nodeEdgeAt(nodes, 50, 60, 16)).toBeNull();
    expect(nodeEdgeAt(nodes, 50, 25, 16)).toBeNull();
    expect(nodeEdgeAt(nodes, 200, 25, 16)).toBeNull();
  });
});

describe("strokesUnderScratch", () => {
  const stroke = (id: string, from: [number, number], to: [number, number], tool = "pen") => ({ id, tool, points: line(from, to) });
  const scratch = zigzag(100, 100, 60, 8);

  test("erases strokes lying mostly inside the scratch-out", () => {
    expect(strokesUnderScratch(scratch, [stroke("word", [105, 105], [155, 110])])).toEqual(["word"]);
  });

  test("keeps long strokes the scratch merely crosses", () => {
    expect(strokesUnderScratch(scratch, [stroke("long", [0, 108], [400, 108])])).toEqual([]);
    expect(strokesUnderScratch(scratch, [stroke("outside", [300, 300], [360, 300])])).toEqual([]);
  });

  test("never erases highlighter marks", () => {
    expect(strokesUnderScratch(scratch, [stroke("mark", [105, 105], [155, 110], "highlighter")])).toEqual([]);
  });
});

describe("isScratchOut", () => {
  test("handwriting is not a scratch-out", () => {
    // An "m": up and down strokes but small legs relative to its width.
    const m: Array<[number, number]> = [[0, 20], [0, 0], [5, 0], [10, 20], [10, 0], [15, 0], [20, 20], [20, 0], [25, 0], [30, 20]];
    expect(isScratchOut(m)).toBe(false);
    expect(isScratchOut(line([0, 0], [100, 0]))).toBe(false);
  });

  test("a tiny zigzag is not a scratch-out", () => {
    expect(isScratchOut(zigzag(0, 0, 8, 8))).toBe(false);
  });

  test("vertical zigzags count too", () => {
    const vertical = zigzag(0, 0, 60, 8).map(([x, y, p]) => [y, x, p] as [number, number, number]);
    expect(isScratchOut(vertical)).toBe(true);
  });
});

describe("PalmGuard", () => {
  test("fingers pan freely without a pen", () => {
    const guard = new PalmGuard();
    expect(guard.touchStart(1, 0)).toBe(false);
    expect(guard.touchMove([1])).toBe(false);
  });

  test("a hand that landed just before the pen is blocked and its pan undone", () => {
    const guard = new PalmGuard();
    guard.touchStart(1, 1000);
    expect(guard.penDown(1000 + PALM_WINDOW_MS - 1)).toBe(true);
    expect(guard.touchMove([1])).toBe(true);
    guard.penUp(2000);
    // Still resting after the pen lifts: stays blocked until it ends.
    expect(guard.touchMove([1])).toBe(true);
    guard.touchEnd(1);
    expect(guard.touchStart(2, 2000 + PEN_COOLDOWN_MS + 1)).toBe(false);
  });

  test("an older finger pan is stopped but not undone", () => {
    const guard = new PalmGuard();
    guard.touchStart(1, 0);
    expect(guard.penDown(PALM_WINDOW_MS + 1)).toBe(false);
    expect(guard.isBlocked(1)).toBe(true);
  });

  test("pen events without a matching pen down do not start the cooldown", () => {
    const guard = new PalmGuard();
    // A hovering Apple Pencil leaves without touching.
    guard.penUp(1000, 7);
    expect(guard.touchStart(1, 1010)).toBe(false);
    guard.touchEnd(1);
    guard.penDown(2000, 7);
    guard.penUp(2100, 8);
    expect(guard.penActive).toBe(true);
    guard.penUp(2200, 7);
    expect(guard.penActive).toBe(false);
    expect(guard.touchStart(2, 2210)).toBe(true);
  });

  test("blocksNewTouch mirrors touchStart without tracking a touch", () => {
    const guard = new PalmGuard();
    expect(guard.blocksNewTouch(0)).toBe(false);
    guard.penDown(10);
    expect(guard.blocksNewTouch(20)).toBe(true);
    guard.penUp(30);
    expect(guard.blocksNewTouch(30 + PEN_COOLDOWN_MS - 1)).toBe(true);
    expect(guard.blocksNewTouch(30 + PEN_COOLDOWN_MS + 1)).toBe(false);
    expect(guard.touching).toBe(0);
  });

  test("touches during and right after a stroke are blocked", () => {
    const guard = new PalmGuard();
    guard.penDown(0);
    expect(guard.touchStart(1, 10)).toBe(true);
    guard.penUp(100);
    expect(guard.touchStart(2, 100 + PEN_COOLDOWN_MS - 1)).toBe(true);
    expect(guard.touchStart(3, 100 + PEN_COOLDOWN_MS + 1)).toBe(false);
  });
});
