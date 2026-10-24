import { describe, expect, test } from "bun:test";

const editorSource = await Bun.file(new URL("./NodeEditor.tsx", import.meta.url)).text();
const editorStyles = await Bun.file(new URL("./NodeEditor.css", import.meta.url)).text();

describe("NodeEditor Markdown formatting contract", () => {
  test("scopes the rich-text presentation to the editor content area", () => {
    expect(editorSource).toContain("bloommd-markdown-editor");
    expect(editorStyles).toContain(".bloommd-markdown-editor");
    expect(editorStyles).not.toMatch(/^\s*(ul|ol)\s*\{/m);
  });

  test("restores visible list hierarchy and core Markdown blocks", () => {
    for (const selector of [
      ".bloommd-markdown-editor ul",
      ".bloommd-markdown-editor ol",
      ".bloommd-markdown-editor ul ul",
      ".bloommd-markdown-editor ol ol",
      ".bloommd-markdown-editor :where(h1, h2, h3, h4, h5, h6)",
      ".bloommd-markdown-editor blockquote",
      ".bloommd-markdown-editor pre",
      ".bloommd-markdown-editor table",
      '.bloommd-markdown-editor li[role="checkbox"]',
    ]) {
      expect(editorStyles, `Fehlender Editor-Style: ${selector}`).toContain(selector);
    }
    expect(editorStyles).toContain("list-style-type: disc");
    expect(editorStyles).toContain("list-style-type: decimal");
  });
});
