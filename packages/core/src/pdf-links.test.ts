import { describe, expect, test } from "bun:test";
import {
  buildPdfCitationNode,
  checkPdfLinks,
  extractPdfCitations,
  extractPdfLinks,
  formatPdfLink,
  parsePdfLinkTarget,
  pdfPageUrl,
  resolvePdfResource,
} from "./pdf-links";

describe("parsePdfLinkTarget", () => {
  test("reads file and page", () => {
    expect(parsePdfLinkTarget("papers/smith2020.pdf#page=12")).toMatchObject({ file: "papers/smith2020.pdf", page: 12 });
  });

  test("a link without a page opens page 1", () => {
    expect(parsePdfLinkTarget("a.pdf")).toMatchObject({ file: "a.pdf", page: 1 });
  });

  test.each(["a.pdf#page=0", "a.pdf#page=abc", "a.pdf#page=-2", "a.pdf#page=", "a.pdf#heading"])(
    "%s falls back to page 1",
    (target) => {
      expect(parsePdfLinkTarget(target)?.page).toBe(1);
    },
  );

  test("other viewer parameters next to the page do not hide it", () => {
    expect(parsePdfLinkTarget("a.pdf#zoom=100&page=7")?.page).toBe(7);
  });

  test("the extension is matched case-insensitively", () => {
    expect(parsePdfLinkTarget("A.PDF#page=2")).toMatchObject({ file: "A.PDF", page: 2 });
  });

  test("anything that is not a PDF is not a PDF link", () => {
    expect(parsePdfLinkTarget("notes.md#page=3")).toBeNull();
    expect(parsePdfLinkTarget("pdf#page=3")).toBeNull();
    expect(parsePdfLinkTarget("a.pdf.md#page=3")).toBeNull();
    expect(parsePdfLinkTarget("")).toBeNull();
  });
});

describe("extractPdfLinks", () => {
  test("finds plain and labelled links with their line", () => {
    const links = extractPdfLinks("# T\n\n[[a.pdf#page=3]]\ntext [[b/c.pdf#page=4|Kapitel 2]] more\n");
    expect(links).toEqual([
      { raw: "a.pdf#page=3", file: "a.pdf", page: 3, label: "a.pdf#page=3", line: 3 },
      { raw: "b/c.pdf#page=4", file: "b/c.pdf", page: 4, label: "Kapitel 2", line: 4 },
    ]);
  });

  test("ignores links in code and links to maps", () => {
    const text = "```\n[[a.pdf#page=1]]\n```\n`[[b.pdf#page=2]]` [[map#node]] [[other.md#x]]\n";
    expect(extractPdfLinks(text)).toEqual([]);
  });

  test("reads the escaped form the editor may write", () => {
    expect(extractPdfLinks("\\[\\[a.pdf#page=5\\]\\]")[0]).toMatchObject({ file: "a.pdf", page: 5 });
  });
});

describe("extractPdfCitations", () => {
  test("the blockquote directly below a link is its quote", () => {
    const [citation] = extractPdfCitations("[[a.pdf#page=3]]\n\n> First line\n> second *line*\n\nOther text\n");
    expect(citation!.link.page).toBe(3);
    expect(citation!.quote).toBe("First line\nsecond *line*");
  });

  test("a quote right on the next line works too", () => {
    expect(extractPdfCitations("[[a.pdf#page=1]]\n> Q")[0]!.quote).toBe("Q");
  });

  test("text between link and quote means no quote", () => {
    expect(extractPdfCitations("[[a.pdf#page=1]]\n\nSome text\n\n> Not mine")[0]!.quote).toBe("");
  });

  test("each link owns the quote below it", () => {
    const citations = extractPdfCitations("[[a.pdf#page=1]]\n\n> one\n\n[[b.pdf#page=2]]\n\n> two\n");
    expect(citations.map((citation) => citation.quote)).toEqual(["one", "two"]);
  });

  test("a link followed directly by another link has no quote", () => {
    const citations = extractPdfCitations("[[a.pdf#page=1]]\n[[b.pdf#page=2]]\n> two");
    expect(citations.map((citation) => citation.quote)).toEqual(["", "two"]);
  });

  test("empty quote lines inside the quote are kept", () => {
    expect(extractPdfCitations("[[a.pdf#page=1]]\n\n> a\n>\n> b")[0]!.quote).toBe("a\n\nb");
  });
});

describe("buildPdfCitationNode", () => {
  test("writes link and blockquote that read back unchanged", () => {
    const built = buildPdfCitationNode({ file: "papers/a.pdf", page: "7", quote: "Line one\n\nLine *two*" });
    expect(built).toEqual({
      ok: true,
      title: "a.pdf · 7",
      content: "[[papers/a.pdf#page=7]]\n\n> Line one\n>\n> Line *two*",
    });
    if (!built.ok) throw new Error("unreachable");
    const [citation] = extractPdfCitations(built.content);
    expect(citation).toMatchObject({ link: { file: "papers/a.pdf", page: 7 }, quote: "Line one\n\nLine *two*" });
  });

  test("without a quote only the link is written; an empty page means page 1", () => {
    expect(buildPdfCitationNode({ file: "a.pdf", page: "" })).toMatchObject({ ok: true, content: "[[a.pdf#page=1]]" });
  });

  test("rejects what would not parse as a PDF link", () => {
    expect(buildPdfCitationNode({ file: "", page: 1 })).toEqual({ ok: false, error: "file-missing" });
    expect(buildPdfCitationNode({ file: "a.txt", page: 1 })).toEqual({ ok: false, error: "file-not-pdf" });
    expect(buildPdfCitationNode({ file: "a]].pdf", page: 1 })).toEqual({ ok: false, error: "file-not-pdf" });
    expect(buildPdfCitationNode({ file: "a.pdf", page: 0 })).toEqual({ ok: false, error: "page-invalid" });
    expect(buildPdfCitationNode({ file: "a.pdf", page: "x" })).toEqual({ ok: false, error: "page-invalid" });
    expect(buildPdfCitationNode({ file: "a.pdf", page: "2.5" })).toEqual({ ok: false, error: "page-invalid" });
  });
});

describe("helpers", () => {
  test("formatPdfLink and pdfPageUrl", () => {
    expect(formatPdfLink("a.pdf", 3)).toBe("[[a.pdf#page=3]]");
    expect(formatPdfLink("a.pdf", 3, "Label")).toBe("[[a.pdf#page=3|Label]]");
    expect(formatPdfLink("a.pdf", 0)).toBe("[[a.pdf#page=1]]");
    expect(pdfPageUrl("blob:x/1", 4)).toBe("blob:x/1#page=4");
    expect(pdfPageUrl("https://e.org/a.pdf#page=2", 9)).toBe("https://e.org/a.pdf#page=9");
  });
});

describe("resolvePdfResource / checkPdfLinks", () => {
  const resources = ["papers/a.pdf", "x/dup.pdf", "y/dup.pdf", "root.pdf"];

  test("finds a file relative to the linking file, the root, or by name", () => {
    expect(resolvePdfResource("a.pdf", "papers/notes.md", resources)).toEqual({ status: "found", path: "papers/a.pdf" });
    expect(resolvePdfResource("papers/a.pdf", "n.md", resources)).toEqual({ status: "found", path: "papers/a.pdf" });
    expect(resolvePdfResource("a.pdf", "other/n.md", resources)).toEqual({ status: "found", path: "papers/a.pdf" });
    expect(resolvePdfResource("./root.pdf", "deep/er/n.md", resources)).toEqual({ status: "found", path: "root.pdf" });
  });

  test("reports missing and ambiguous files", () => {
    expect(resolvePdfResource("gone.pdf", "n.md", resources)).toEqual({ status: "missing" });
    expect(resolvePdfResource("../../up.pdf", "n.md", resources)).toEqual({ status: "missing" });
    expect(resolvePdfResource("dup.pdf", "n.md", resources)).toEqual({ status: "ambiguous", candidates: ["x/dup.pdf", "y/dup.pdf"] });
  });

  test("only missing or ambiguous files are problems; the page is never checked", () => {
    const problems = checkPdfLinks(
      [{ path: "n.md", markdown: "[[a.pdf#page=999]]\n[[gone.pdf#page=2]]\n[[dup.pdf]]\n[[https://e.org/x.pdf#page=3]]" }],
      resources,
    );
    expect(problems.map((problem) => [problem.line, problem.kind])).toEqual([
      [2, "missing"],
      [3, "ambiguous"],
    ]);
    expect(problems[0]).toMatchObject({ path: "n.md", file: "gone.pdf", page: 2, raw: "[[gone.pdf#page=2]]" });
  });
});
