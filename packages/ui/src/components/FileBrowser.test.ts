import { describe, expect, test } from "bun:test";
import type { MindMapDocument, MindMapListEntry } from "@bloommd/core/browser";
import { compareFileBrowserEntries, fileEntryIsActive, fileEntryTitle } from "./FileBrowser";

function testDocument(filePath: string, title: string, id: string): MindMapDocument {
  return {
    filePath,
    frontmatter: { title, id },
    nodes: new Map(),
    rootId: "root",
    rawMarkdown: "",
  };
}

describe("FileBrowser list entries", () => {
  test("falls back when a cloud list entry has no title", () => {
    const broken = { filename: "welcome.md" } as MindMapListEntry;
    const titled = {
      filename: "alpha.md",
      frontmatter: {
        title: "Alpha",
        id: "alpha",
        created: "2026-08-20T00:00:00.000Z",
        updated: "2026-08-20T00:00:00.000Z",
      },
    } satisfies MindMapListEntry;

    expect(fileEntryTitle(broken)).toBe("welcome.md");
    expect(() => compareFileBrowserEntries(broken, titled, new Set(), [])).not.toThrow();
  });

  test("matches the active file when one path is absolute and the other is relative", () => {
    const entry = {
      filename: "Buch/Teil-1/Kapitel 2.md",
      frontmatter: { title: "Kapitel 2", id: "kapitel-2" },
    } as MindMapListEntry;
    const document = testDocument(
      "/var/folders/bloommd/data/Buch/Teil-1/Kapitel 2.md",
      "Kapitel 2",
      "kapitel-2",
    );

    expect(fileEntryIsActive(entry, document)).toBe(true);
  });

  test("matches a nested list entry when the document only has the short path", () => {
    const entry = {
      filename: "Buch/Teil-2/Kapitel 3.md",
      frontmatter: { title: "Kapitel 3", id: "kapitel-3" },
    } as MindMapListEntry;
    const document = testDocument("Kapitel 3.md", "Kapitel 3", "kapitel-3");

    expect(fileEntryIsActive(entry, document)).toBe(true);
  });

  test("does not use a duplicated frontmatter id to mark another file active", () => {
    const entry = {
      filename: "second.md",
      frontmatter: { title: "Second", id: "shared-id" },
    } as MindMapListEntry;
    const document = testDocument("first.md", "First", "shared-id");

    expect(fileEntryIsActive(entry, document)).toBe(false);
  });
});
