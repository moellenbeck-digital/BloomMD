import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const SRC = join(import.meta.dirname, "..");

/**
 * The node editor is a lazy chunk with a size budget (`scripts/check-vite-bundle.mjs`, 40 000 bytes for
 * the desktop build). The heavy parts of the visuals — viewer, gallery, Mermaid view, image and export
 * code — must stay behind `import()`; a static import brings them into that chunk and fails the
 * desktop build in CI.
 */
describe("node editor keeps the visuals out of its chunk", () => {
  test("only the small modules are imported statically", async () => {
    const source = await readFile(join(SRC, "components", "NodeEditor.tsx"), "utf8");
    const statics = [...source.matchAll(/^import\s+(type\s+)?[^;]*?from\s+"\.\.\/visuals\/([^"]+)";/gms)]
      .filter((match) => !match[1])
      .map((match) => match[2])
      .sort();
    // `useInlineImages` and `visuals-context` are tiny; `lazy` holds the lazy() wrappers.
    expect(statics).toEqual(["lazy", "useInlineImages", "visuals-context"]);
  });

  test("the lazy wrappers and the hooks load the heavy modules on demand", async () => {
    const lazy = await readFile(join(SRC, "visuals", "lazy.tsx"), "utf8");
    for (const module of ["MermaidCodeBlock", "NodeImageGallery", "VisualViewer"]) expect(lazy).toContain(`import("./${module}")`);
    expect(lazy).not.toMatch(/^import\s+[^;]*from\s+"\.\/(MermaidCodeBlock|NodeImageGallery|VisualViewer)"/m);

    const hooks = await readFile(join(SRC, "visuals", "useInlineImages.ts"), "utf8");
    expect(hooks).toContain('import("./image-preview")');
    expect(hooks).not.toMatch(/^import\s+[^;]*from\s+"\.\/image-preview"/m);
  });
});
