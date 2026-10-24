import { describe, expect, test } from "bun:test";
import {
  handleScale,
  pointInPolygon,
  screenToWorld,
  simplifyPoints,
  strokeBounds,
  strokeHitsPoint,
  strokeInLasso,
  strokesBounds,
  transformStroke,
  MIN_STROKE_SIZE,
  worldToScreen,
  zoomViewportAt,
  type InkStroke,
} from "./ink-geometry";

const line = (id: string, from: [number, number], to: [number, number], size = 4): InkStroke => ({
  id,
  tool: "pen",
  color: "#000",
  size,
  points: [
    [from[0], from[1], 0.5],
    [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, 0.5],
    [to[0], to[1], 0.5],
  ],
});

const square: Array<[number, number]> = [[0, 0], [100, 0], [100, 100], [0, 100]];

describe("bounds", () => {
  test("widens a stroke by half its size", () => {
    expect(strokeBounds(line("a", [10, 10], [50, 30], 6))).toEqual({ minX: 7, minY: 7, maxX: 53, maxY: 33 });
  });

  test("unions all strokes and ignores empty ones", () => {
    const empty: InkStroke = { ...line("e", [0, 0], [0, 0]), points: [] };
    expect(strokesBounds([line("a", [0, 0], [10, 10], 2), line("b", [50, -20], [60, 5], 2), empty])).toEqual({ minX: -1, minY: -21, maxX: 61, maxY: 11 });
    expect(strokesBounds([])).toBeNull();
  });
});

describe("hit testing", () => {
  test("detects points inside a polygon", () => {
    expect(pointInPolygon(50, 50, square)).toBe(true);
    expect(pointInPolygon(150, 50, square)).toBe(false);
  });

  test("eraser hits only strokes within their width plus tolerance", () => {
    const stroke = line("a", [0, 0], [100, 0], 4);
    expect(strokeHitsPoint(stroke, 50, 3, 2)).toBe(true);
    expect(strokeHitsPoint(stroke, 50, 5, 2)).toBe(false);
    expect(strokeHitsPoint(stroke, 104, 0, 2)).toBe(true);
  });

  test("lasso selects strokes with most of their points inside", () => {
    expect(strokeInLasso(line("in", [10, 10], [90, 90]), square)).toBe(true);
    expect(strokeInLasso(line("half", [50, 50], [150, 150]), square)).toBe(false);
    expect(strokeInLasso(line("out", [110, 10], [190, 90]), square)).toBe(false);
    expect(strokeInLasso(line("in", [10, 10], [90, 90]), [[0, 0], [100, 0]])).toBe(false);
  });
});

describe("transformStroke", () => {
  test("moves strokes", () => {
    const moved = transformStroke(line("a", [0, 0], [10, 0]), { dx: 5, dy: -5, scale: 1, originX: 0, originY: 0 });
    expect(moved.points[0]).toEqual([5, -5, 0.5]);
    expect(moved.points[2]).toEqual([15, -5, 0.5]);
  });

  test("scales points and stroke width around an origin", () => {
    const scaled = transformStroke(line("a", [10, 10], [30, 10], 4), { dx: 0, dy: 0, scale: 0.5, originX: 10, originY: 10 });
    expect(scaled.points[0]).toEqual([10, 10, 0.5]);
    expect(scaled.points[2]).toEqual([20, 10, 0.5]);
    expect(scaled.size).toBe(2);
  });

  test("never rounds the stroke width down to zero", () => {
    let stroke = line("a", [0, 0], [10, 0], 4);
    for (let step = 0; step < 20; step += 1) stroke = transformStroke(stroke, { dx: 0, dy: 0, scale: 0.5, originX: 0, originY: 0 });
    expect(stroke.size).toBe(MIN_STROKE_SIZE);
  });
});

describe("simplifyPoints", () => {
  test("keeps corners and endpoints, removes collinear samples", () => {
    const points: Array<[number, number, number]> = [[0, 0, 0.1], [5, 0, 0.2], [10, 0, 0.3], [10, 5, 0.4], [10, 10, 0.5]];
    expect(simplifyPoints(points, 0.5)).toEqual([[0, 0, 0.1], [10, 0, 0.3], [10, 10, 0.5]]);
  });
});

describe("viewport math", () => {
  test("converts between screen and world coordinates", () => {
    const viewport = { x: 100, y: 50, zoom: 2 };
    expect(screenToWorld(viewport, 300, 250)).toEqual([100, 100]);
    expect(worldToScreen(viewport, 100, 100)).toEqual([300, 250]);
  });

  test("zooms around the pointer and clamps the zoom level", () => {
    const viewport = { x: 0, y: 0, zoom: 1 };
    const zoomed = zoomViewportAt(viewport, 200, 100, 2);
    expect(zoomed.zoom).toBe(2);
    expect(screenToWorld(zoomed, 200, 100)).toEqual([200, 100]);
    expect(zoomViewportAt(viewport, 0, 0, 100).zoom).toBe(6);
    expect(zoomViewportAt(viewport, 0, 0, 0.001).zoom).toBe(0.2);
  });
});

describe("handleScale", () => {
  test("halves the selection when the corner moves halfway to the anchor", () => {
    expect(handleScale([0, 0], [100, 50], [50, 25])).toBe(0.5);
  });

  test("projects off-diagonal drags and never collapses to zero", () => {
    expect(handleScale([0, 0], [100, 0], [200, 80])).toBe(2);
    expect(handleScale([0, 0], [100, 0], [-50, 0])).toBe(0.05);
    expect(handleScale([10, 10], [10, 10], [50, 50])).toBe(1);
  });
});
