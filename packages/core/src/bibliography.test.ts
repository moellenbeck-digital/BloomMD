import { describe, expect, test } from "bun:test";
import { buildBibliography, formatBibtex, readCitation } from "./bibliography";

const map = (frontmatter: string, body = "# T\n") => `---\n${frontmatter}\n---\n${body}`;

describe("readCitation", () => {
  test("needs a citekey; author, year and title are optional", () => {
    expect(readCitation({ title: "T" })).toBeNull();
    expect(readCitation({ citekey: "  " })).toBeNull();
    expect(readCitation({ citekey: "smith2020", year: 2020, author: ["A. Smith", "B. Jones"], title: "T" })).toEqual({
      citekey: "smith2020",
      author: "A. Smith and B. Jones",
      year: "2020",
      title: "T",
    });
  });
});

describe("buildBibliography", () => {
  const files = [
    { path: "root.md", markdown: map("title: Review\ncitekey: review2024\nauthor: Me\nyear: 2024", "# R\n\n[[smith]] and [[jones#intro]] and [[plain]] and [[smith]]\n") },
    { path: "smith.md", markdown: map("title: Deep Learning\ncitekey: smith2020\nauthor: Smith, A.\nyear: 2020") },
    { path: "jones.md", markdown: map("title: Graphs\ncitekey: Abel1999\n") },
    { path: "plain.md", markdown: map("title: No key") },
    { path: "second-hop.md", markdown: map("title: X\ncitekey: hop2000") },
    { path: "other.md", markdown: map("title: Elsewhere\ncitekey: zzz") },
  ];
  // smith links one hop further; that must not leak into the root's list.
  files[1]!.markdown += "\n[[second-hop]]\n";

  test("own key plus the keys of linked maps, one hop, sorted, without duplicates", () => {
    const result = buildBibliography("root.md", files);
    expect(result.entries.map((entry) => entry.citekey)).toEqual(["Abel1999", "review2024", "smith2020"]);
    expect(result.skipped).toEqual([]);
  });

  test("BibTeX and Markdown output", () => {
    const result = buildBibliography("root.md", files);
    expect(result.bibtex).toBe(
      [
        "@misc{Abel1999,\n  title = {Graphs}\n}",
        "@misc{review2024,\n  author = {Me},\n  year = {2024},\n  title = {Review}\n}",
        "@misc{smith2020,\n  author = {Smith, A.},\n  year = {2020},\n  title = {Deep Learning}\n}",
      ].join("\n\n") + "\n",
    );
    expect(result.markdown).toBe(
      "- Abel1999: Graphs\n- review2024: Me (2024). Review\n- smith2020: Smith, A. (2020). Deep Learning\n",
    );
  });

  test("a map without citekey and without links gives an empty list", () => {
    const result = buildBibliography("plain.md", files);
    expect(result.entries).toEqual([]);
    expect(result.bibtex).toBe("");
    expect(result.markdown).toBe("");
  });

  test("the same key in two maps is listed once; differing data is reported", () => {
    const result = buildBibliography("r.md", [
      { path: "r.md", markdown: map("citekey: a1", "[[b]] [[c]]") },
      { path: "b.md", markdown: map("citekey: dup\ntitle: One") },
      { path: "c.md", markdown: map("citekey: dup\ntitle: Two") },
    ]);
    expect(result.entries.map((entry) => entry.path)).toEqual(["r.md", "b.md"]);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]).toMatchObject({ path: "c.md" });
  });

  test("an invalid key is skipped with a reason instead of producing broken BibTeX", () => {
    const result = buildBibliography("r.md", [
      { path: "r.md", markdown: map('citekey: "bad key,1"') },
    ]);
    expect(result.entries).toEqual([]);
    expect(result.skipped[0]!.reason).toContain("bad key,1");
  });
});

describe("formatBibtex", () => {
  test("escapes characters that BibTeX reads as syntax", () => {
    const out = formatBibtex([{ citekey: "k", path: "k.md", title: "R&D {50%} a_b" }]);
    expect(out).toBe("@misc{k,\n  title = {R\\&D \\{50\\%\\} a\\_b}\n}\n");
  });

  test("an entry with only a key is a valid one-liner", () => {
    expect(formatBibtex([{ citekey: "k", path: "k.md" }])).toBe("@misc{k}\n");
  });
});
