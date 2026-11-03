import { describe, expect, test } from "bun:test";
import { boundsOfRects, composeMapSvg, exportSize, exportView, parseNodeTranslate } from "./map-export-core";

describe("map export geometry", () => {
  test("boundsOfRects covers all rectangles and is null for an empty map", () => {
    expect(boundsOfRects([])).toBeNull();
    expect(boundsOfRects([{ x: -100, y: 20, width: 50, height: 30 }, { x: 40, y: -10, width: 80, height: 20 }])).toEqual({ x: -100, y: -10, width: 220, height: 60 });
  });

  test("parseNodeTranslate reads React Flow's inline transform", () => {
    expect(parseNodeTranslate("translate(12.5px, -40px)")).toEqual({ x: 12.5, y: -40 });
    expect(parseNodeTranslate("translate(0px,0px)")).toEqual({ x: 0, y: 0 });
    expect(parseNodeTranslate("scale(2)")).toBeNull();
    expect(parseNodeTranslate("")).toBeNull();
  });

  test("exportView moves the bounds' origin to the padding at the chosen scale", () => {
    const bounds = { x: -200, y: -100, width: 400, height: 200 };
    const size = exportSize(bounds);
    expect(size.scale).toBe(2);
    expect(exportView(bounds, size)).toEqual({ x: (48 + 200) * 2, y: (48 + 100) * 2, scale: 2 });
  });
});

describe("composeMapSvg", () => {
  const nodesSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300"><foreignObject width="100%" height="100%" x="0" y="0"><div xmlns="http://www.w3.org/1999/xhtml">Wurzel</div></foreignObject></svg>`;
  const svg = composeMapSvg({
    width: 400,
    height: 300,
    background: "rgb(250, 250, 250)",
    view: { x: 100, y: 50.5, scale: 2 },
    edges: [
      { d: "M 0 0 C 10 0 10 20 20 20", stroke: "rgb(212, 207, 200)", strokeWidth: 2, lineCap: "round" },
      { d: "M 0 0 L 5 5", stroke: "#FF6B35", strokeWidth: 1.75, dashArray: [7, 5] },
    ],
    nodesSvg,
  });

  test("is a standalone SVG: background, vector edges below, nodes as text, no bitmap", () => {
    expect(svg.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">')).toBe(true);
    expect(svg).toContain('<rect width="100%" height="100%" fill="rgb(250, 250, 250)"/>');
    expect(svg).toContain('<g transform="translate(100 50.5) scale(2)" fill="none">');
    expect(svg).toContain('<path d="M 0 0 C 10 0 10 20 20 20" stroke="rgb(212, 207, 200)" stroke-width="2" stroke-linecap="round"/>');
    expect(svg).toContain('stroke-dasharray="7 5"');
    expect(svg).toContain("Wurzel</div></foreignObject>");
    expect(svg).not.toContain("<image");
    expect(svg).not.toContain("data:image");
    expect(svg.indexOf("<path")).toBeLessThan(svg.indexOf("<foreignObject"));
    expect(svg.trimEnd().endsWith("</svg>")).toBe(true);
    expect((svg.match(/<svg /g) ?? []).length).toBe(1);
  });

  test("escapes edge attributes and rejects a layer without content", () => {
    const escaped = composeMapSvg({ width: 1, height: 1, background: 'a"b', view: { x: 0, y: 0, scale: 1 }, edges: [{ d: 'M "x" <', stroke: "red", strokeWidth: 1 }], nodesSvg });
    expect(escaped).toContain('fill="a&quot;b"');
    expect(escaped).toContain('d="M &quot;x&quot; &lt;"');
    expect(() => composeMapSvg({ width: 1, height: 1, background: "#fff", view: { x: 0, y: 0, scale: 1 }, edges: [], nodesSvg: "<svg/>" })).toThrow();
  });
});
