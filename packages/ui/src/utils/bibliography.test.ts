import { describe, expect, test } from "bun:test";
import { parseFile, type MindMapListEntry } from "@bloommd/core/browser";
import { bibliographyFilename, bibliographyForDocument } from "./bibliography";

const root = parseFile(
  "review.md",
  "---\ntitle: Review 2024\nid: rev1\ncreated: \"2026-01-01T00:00:00Z\"\nupdated: \"2026-01-01T00:00:00Z\"\ncitekey: review2024\nauthor: Me\nyear: 2024\n---\n# Review 2024\n\n## Sources\n\n[[smith2020]] and [[Unknown map]]\n",
);

function entry(filename: string, frontmatter: Record<string, unknown>): MindMapListEntry {
  return {
    filename,
    frontmatter: { title: filename, id: filename, created: "", updated: "", ...frontmatter } as MindMapListEntry["frontmatter"],
  };
}

describe("bibliographyForDocument", () => {
  const maps = [
    entry("review.md", { title: "Review 2024", citekey: "review2024" }),
    entry("smith2020.md", { title: "Deep Learning", citekey: "smith2020", author: "Smith, A.", year: 2020 }),
    entry("unlinked.md", { title: "Not linked", citekey: "zzz" }),
  ];

  test("lists the map itself and the maps it links to, not other maps", () => {
    const result = bibliographyForDocument(root, maps);
    expect(result.entries.map((item) => item.citekey)).toEqual(["review2024", "smith2020"]);
    expect(result.bibtex).toContain("@misc{smith2020,\n  author = {Smith, A.},\n  year = {2020},\n  title = {Deep Learning}\n}");
    expect(result.markdown).toContain("- smith2020: Smith, A. (2020). Deep Learning");
  });

  test("the open document's own frontmatter wins over its list entry", () => {
    const result = bibliographyForDocument(root, [entry("review.md", { citekey: "stale-key" }), maps[1]!]);
    expect(result.entries.map((item) => item.citekey)).toEqual(["review2024", "smith2020"]);
  });

  test("names the export files after the map", () => {
    expect(bibliographyFilename(root, "bib")).toBe("Review-2024-literatur.bib");
    expect(bibliographyFilename(root, "md")).toBe("Review-2024-literatur.md");
  });
});
