import { describe, expect, test } from "bun:test";

const appSource = await Bun.file(new URL("./App.tsx", import.meta.url)).text();
const canvasSource = await Bun.file(new URL("../../../ui/src/components/MindMapCanvas.tsx", import.meta.url)).text();
const nodeSource = await Bun.file(new URL("../../../ui/src/components/NodeEditor.tsx", import.meta.url)).text();

describe("desktop locale contract", () => {
  test("desktop shell uses the shared locale context", () => {
    expect(appSource).toContain("useLocale");
    expect(canvasSource).toContain("useLocale");
    expect(nodeSource).toContain("useLocale");
  });

  test("known mixed-language UI fragments stay out of the desktop surfaces", () => {
    const forbiddenFragments = [
      'title="File browser (Cmd+O)"',
      'title="Open website"',
      'aria-label="Previous node"',
      'aria-label="Next node"',
      'title="Toggle task"',
      'title="Copy link"',
      'title="Open link"',
      '"Workspaces laden…"',
      '"Mit Server verbinden"',
    ];
    for (const fragment of forbiddenFragments) {
      expect(appSource.includes(fragment) || canvasSource.includes(fragment) || nodeSource.includes(fragment), fragment).toBe(false);
    }
  });
});
