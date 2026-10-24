import { describe, expect, test } from "bun:test";
import { markdownFilename, normalizeMobileMarkdownFilename } from "./mobile-files";

describe("mobile Markdown filenames", () => {
  test("creates stable safe names for ASCII and accented titles", () => {
    expect(markdownFilename("Product Überview", "A1-B2")).toBe("product-uberview-a1b2.md");
  });

  test("falls back for non-latin or punctuation-only titles", () => {
    expect(markdownFilename("日本語", "cafe1234")).toBe("mindmap-cafe1234.md");
    expect(markdownFilename("!!!", "id-9")).toBe("mindmap-id9.md");
  });

  test("does not overwrite an existing generated name", () => {
    expect(markdownFilename("Plan", "abc", ["plan-abc.md", "PLAN-ABC-2.MD"])).toBe("plan-abc-3.md");
  });

  test("rejects path traversal and keeps both Markdown extensions", () => {
    expect(() => normalizeMobileMarkdownFilename("../secret.md")).toThrow();
    expect(normalizeMobileMarkdownFilename("map.markdown")).toBe("map.markdown");
    expect(normalizeMobileMarkdownFilename("map")).toBe("map.md");
  });
});
