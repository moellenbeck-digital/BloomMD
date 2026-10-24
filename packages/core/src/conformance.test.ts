import { describe, expect, test } from "bun:test";
import { parseFile, serializeToMarkdown } from "./parser";

/**
 * Markdown compatibility corpus.
 *
 * BloomMD is not a CommonMark renderer — it reads heading structure and writes it back. What has to
 * hold is narrower but stricter than rendering: it must agree with CommonMark about *which lines
 * are headings*, and it must return every byte it did not deliberately change.
 *
 * That second property is the one worth guarding hardest. A renderer that misreads a construct
 * shows something wrong; a round-trip that misreads one deletes the user's work. Each case below is
 * a construct that has, or plausibly could, break one of the two.
 */

function roundtrip(markdown: string): string {
  return serializeToMarkdown(parseFile("test.md", markdown));
}

/**
 * Every heading the parser found, in document order.
 *
 * The root node is the first heading rather than a wrapper around it, so it is included. A document
 * with no heading at all still gets a synthetic root named after the file; those cases are asserted
 * separately rather than filtered here, since silently dropping a node would hide exactly the kind
 * of bug this corpus is for.
 */
function headingTitles(markdown: string): string[] {
  const doc = parseFile("test.md", markdown);
  return [...doc.nodes.values()].map((node) => node.title);
}

describe("CommonMark: what counts as an ATX heading", () => {
  const cases: Array<[string, string, string[]]> = [
    ["requires a space after the hashes", "#hashtag\n\n# Real\n", ["Real"]],
    ["allows up to three leading spaces", "   # Indented\n", ["Indented"]],
    ["four spaces makes it code, not a heading", "# Real\n\n    # Code\n", ["Real"]],
    ["accepts a closing sequence", "# Title #\n", ["Title"]],
    ["accepts an uneven closing sequence", "# Title ###\n", ["Title"]],
    ["keeps hashes that are not a closing sequence", "# Title#\n", ["Title#"]],
    ["treats an empty ATX heading as an empty title", "#\n", [""]],
    ["stops at six hashes", "###### Six\n", ["Six"]],
  ];

  for (const [name, markdown, expected] of cases) {
    test(name, () => expect(headingTitles(markdown)).toEqual(expected));
  }

  test("seven hashes is not a heading", () => {
    // CommonMark caps ATX headings at six. A seventh hash is a paragraph, so the document has no
    // heading and only the synthetic root named after the file remains.
    expect(headingTitles("####### Seven\n")).toEqual(["test"]);
  });
});

describe("CommonMark: Setext headings", () => {
  test("underlined with equals is a level 1 heading", () => {
    expect(headingTitles("Title\n=====\n")).toEqual(["Title"]);
  });

  test("underlined with dashes is a level 2 heading", () => {
    expect(headingTitles("# One\n\nTwo\n---\n")).toEqual(["One", "Two"]);
  });

  test("a dashed line without preceding text is a thematic break, not a heading", () => {
    expect(headingTitles("# One\n\n---\n\ntext\n")).toEqual(["One"]);
  });

  test("survives a round-trip", () => {
    const markdown = "Title\n=====\n\nBody text.\n";
    expect(roundtrip(markdown)).toContain("Body text.");
  });
});

describe("headings must not be found inside other constructs", () => {
  const cases: Array<[string, string]> = [
    ["fenced code block", "# Real\n\n```\n# Not a heading\n```\n"],
    ["tilde-fenced code block", "# Real\n\n~~~\n# Not a heading\n~~~\n"],
    ["indented code block", "# Real\n\n    # Not a heading\n"],
    ["HTML block", "# Real\n\n<div>\n# Not a heading\n</div>\n"],
    ["frontmatter", "---\ntitle: x\n# not a heading\n---\n\n# Real\n"],
  ];

  for (const [name, markdown] of cases) {
    test(name, () => expect(headingTitles(markdown)).toEqual(["Real"]));
  }
});

describe("round-trip fidelity", () => {
  const documents: Array<[string, string]> = [
    ["inline markup in a heading", "# A [link](https://example.com) and `code` and **bold**\n\nBody.\n"],
    ["reference link definitions", "# Title\n\nSee [ref].\n\n[ref]: https://example.com\n"],
    ["nested lists", "# Title\n\n- one\n  - two\n    - three\n"],
    ["table", "# Title\n\n| a | b |\n|---|---|\n| 1 | 2 |\n"],
    ["fenced code with language", "# Title\n\n```ts\nconst x: number = 1;\n```\n"],
    ["html comment", "# Title\n\n<!-- a note -->\n"],
    ["footnote-style text", "# Title\n\nText[^1]\n\n[^1]: note\n"],
    ["hard line break with two spaces", "# Title\n\nline one  \nline two\n"],
    ["unicode and emoji", "# Überschrift 🌱\n\nInhalt mit Umlauten: äöüß\n"],
    ["autolink", "# Title\n\n<https://example.com>\n"],
    ["blockquote containing a hash", "# Title\n\n> # quoted heading\n"],
  ];

  for (const [name, markdown] of documents) {
    test(name, () => {
      const result = roundtrip(markdown);
      // Body content must survive verbatim. Frontmatter is added by design, so the check is
      // containment rather than equality.
      const body = markdown.split("\n").filter((line) => line.trim() && !line.startsWith("# "));
      for (const line of body) {
        expect(result).toContain(line.trim());
      }
    });
  }

  test("a document with no heading keeps its content", () => {
    const markdown = "Just a paragraph with no heading at all.\n";
    expect(roundtrip(markdown)).toContain("Just a paragraph with no heading at all.");
  });

  test("repeated round-trips are stable", () => {
    // Instability here means every save mutates the file, which turns a Markdown folder into
    // something git cannot review. The `updated` stamp is expected to move on every save, so it is
    // the one line excluded rather than the check being loosened.
    const withoutTimestamp = (value: string) => value.replace(/^updated: .*$/m, "updated: <stamp>");
    const markdown = "# Title\n\nBody with a [link](x.md).\n\n## Section\n\n- item\n";
    const once = roundtrip(markdown);
    expect(withoutTimestamp(roundtrip(once))).toBe(withoutTimestamp(once));
  });

  test("an escape at the start of a line is kept, so no phantom heading appears", () => {
    // remark drops a redundant escape mid-line, which is harmless — `#` in the middle of a
    // paragraph is literal either way. At the start of a line it is not harmless: dropping it
    // would promote the text to a heading and restructure the document on save.
    const result = roundtrip("# Title\n\n\\# not a heading\n");
    expect(result).toContain("\\# not a heading");
    expect(headingTitles(result)).toEqual(["Title"]);
  });

  test("an escaped bracket at the start of a line does not become a link", () => {
    const result = roundtrip("# Title\n\n\\[not a link]\n");
    expect(result).toContain("\\[not a link]");
  });
});

describe("Obsidian fixtures", () => {
  test("callouts survive a round-trip", () => {
    const markdown = "# Title\n\n> [!NOTE]\n> This is a callout.\n> With a second line.\n";
    const result = roundtrip(markdown);
    expect(result).toContain("> [!NOTE]");
    expect(result).toContain("> This is a callout.");
    expect(result).toContain("> With a second line.");
  });

  test("nested and typed callouts survive", () => {
    const markdown = "# Title\n\n> [!WARNING]+ Custom title\n> Body\n";
    const result = roundtrip(markdown);
    expect(result).toContain("> [!WARNING]+ Custom title");
  });

  test("embeds survive a round-trip", () => {
    const markdown = "# Title\n\n![[image.png]]\n\n![[Other Note#Section]]\n";
    const result = roundtrip(markdown);
    expect(result).toContain("![[image.png]]");
    expect(result).toContain("![[Other Note#Section]]");
  });

  test("wiki links survive a round-trip", () => {
    const markdown = "# Title\n\nSee [[Other Note]] and [[Note#Heading]] and [[Note|alias]].\n";
    const result = roundtrip(markdown);
    expect(result).toContain("[[Other Note]]");
    expect(result).toContain("[[Note#Heading]]");
    expect(result).toContain("[[Note|alias]]");
  });

  test("tags and block references survive a round-trip", () => {
    const markdown = "# Title\n\nA line with #a-tag and a block ref ^abc123\n";
    const result = roundtrip(markdown);
    expect(result).toContain("#a-tag");
    expect(result).toContain("^abc123");
  });

  test("a task list survives a round-trip", () => {
    const markdown = "# Title\n\n- [ ] open\n- [x] done\n";
    const result = roundtrip(markdown);
    expect(result).toContain("- [ ] open");
    expect(result).toContain("- [x] done");
  });

  test("an inline dataview-style field survives", () => {
    const markdown = "# Title\n\nstatus:: active\n";
    expect(roundtrip(markdown)).toContain("status:: active");
  });
});
