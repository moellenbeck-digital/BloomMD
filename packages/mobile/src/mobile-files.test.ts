import { describe, expect, test } from "bun:test";
import { parseFile } from "@bloommd/core/browser";
import { isSkippedFolder, isSkippedPath, markdownFilename, newNoteMarkdown, normalizeMobileMarkdownFilename, normalizeMobileMarkdownPath } from "./mobile-files";

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

  test("a plain file name still must not contain a slash", () => {
    expect(() => normalizeMobileMarkdownFilename("Schule/Physik.md")).toThrow();
  });
});

describe("mobile Markdown paths", () => {
  test("nest, add the extension to the file name only and keep spaces and umlauts", () => {
    expect(normalizeMobileMarkdownPath("Notiz.md")).toBe("Notiz.md");
    expect(normalizeMobileMarkdownPath("Schule/Physik")).toBe("Schule/Physik.md");
    expect(normalizeMobileMarkdownPath("Schule/Physik.markdown")).toBe("Schule/Physik.markdown");
    expect(normalizeMobileMarkdownPath("Über uns/Größe & Form/Plan (neu).md")).toBe("Über uns/Größe & Form/Plan (neu).md");
    expect(normalizeMobileMarkdownPath("a.b/c.d")).toBe("a.b/c.d.md");
    expect(normalizeMobileMarkdownPath("Schule\\Physik.md")).toBe("Schule/Physik.md");
  });

  test("refuse traversal, absolute paths, empty paths and control characters", () => {
    for (const path of ["../secret.md", "Schule/../../secret.md", "Schule/..", "..", "/etc/passwd.md", "C:/Windows/x.md", "./Notiz.md", "Schule/./Notiz.md", "", "   ", "Notiz\u0000.md", "Schule/\u0007x.md", "Schule/..hidden.md"]) {
      expect(() => normalizeMobileMarkdownPath(path)).toThrow();
    }
  });
});

describe("skipped folders", () => {
  test("Obsidian's own folders, dot folders and node_modules are skipped at any depth", () => {
    for (const folder of [".obsidian", ".trash", ".git", "Uni/.obsidian", "Uni/.versteckt", "node_modules", "Uni/node_modules", ".obsidian/plugins"]) expect(isSkippedFolder(folder)).toBe(true);
    for (const folder of ["Uni", "Uni/Physik", "Über uns/Größe", "node_modules_alt", "obsidian", "a.b", "Uni/trash"]) expect(isSkippedFolder(folder)).toBe(false);
    expect(isSkippedPath(".obsidian/workspace.md")).toBe(true);
    expect(isSkippedPath("Uni/Physik.md")).toBe(false);
  });
});

describe("new note", () => {
  test("is a valid note whose title survives characters YAML would take as syntax", () => {
    for (const title of ["Physik", "Plan: Q1", "Nr. 5 # wichtig", "Sagt \"Hallo\"", "- Liste", "Größe & Form"]) {
      const document = parseFile("Neu.md", newNoteMarkdown(title, "abcd1234", "2026-11-04T09:00:00.000Z"));
      expect(document.frontmatter.title).toBe(title);
      expect(document.frontmatter.id).toBe("abcd1234");
    }
  });
});
