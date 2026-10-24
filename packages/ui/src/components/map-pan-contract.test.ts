import { expect, test } from "bun:test";

const interactiveMaps = [
  { name: "mind map canvas", source: new URL("./MindMapCanvas.tsx", import.meta.url) },
  { name: "workspace map", source: new URL("./WorkspaceMap.tsx", import.meta.url) },
] as const;

for (const map of interactiveMaps) {
  test(`${map.name} keeps macOS map gestures enabled`, async () => {
    const source = await Bun.file(map.source).text();

    expect(source).toContain("panOnDrag");
    expect(source).toContain("panOnScroll");
    expect(source).toContain("panOnScrollSpeed={0.8}");
    expect(source).toContain("panOnScrollMode={PanOnScrollMode.Free}");
    expect(source).toContain("zoomOnPinch");
    expect(source).toContain("zoomOnScroll={false}");
    if (map.name === "mind map canvas") {
      expect(source).toContain("fittedDocumentRef");
      expect(source).toContain("fitView({ padding: 0.3, duration: 0 })");
    }
  });
}
