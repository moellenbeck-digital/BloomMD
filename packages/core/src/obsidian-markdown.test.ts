import { describe, expect, test } from "bun:test";
import {
  copyHeadingBranch,
  editHeading,
  ensureHeadingIds,
  flattenHeadings,
  moveHeadingBranch,
  parseHeadingTree,
  updateHeadingMetadata,
} from "./browser";

function nodeId(markdown: string, title: string): string {
  const node = flattenHeadings(parseHeadingTree(markdown)).find((candidate) => candidate.title === title);
  if (!node) throw new Error(`Missing heading: ${title}`);
  return node.id;
}

describe("Obsidian Markdown contract", () => {
  test("preserves frontmatter, wiki links, callouts and fenced code", () => {
    const markdown = [
      "---",
      "title: Notes",
      "---",
      "# Root",
      "",
      "> [!NOTE] Keep this callout.",
      "",
      "[[Architecture]] stays a wiki link.",
      "",
      "```md",
      "# Not a heading",
      "```",
      "",
    ].join("\n");

    const root = parseHeadingTree(markdown)[0];
    expect(root?.title).toBe("Root");
    expect(root?.content).toContain("[[Architecture]]");
    expect(root?.content).toContain("> [!NOTE]");
    expect(root?.content).toContain("# Not a heading");
  });

  test("supports Setext headings and preserves CRLF through edits", () => {
    const markdown = "Root\r\n====\r\n\r\n## Child <!-- bloommd:id=child -->\r\nBody\r\n";
    const parsed = parseHeadingTree(markdown);
    expect(parsed[0]?.style).toBe("setext");
    expect(parsed[0]?.children[0]?.id).toBe("child");

    const edited = editHeading(markdown, "child", "Renamed", "Updated");
    expect(edited).toContain("## Renamed <!-- bloommd:id=child -->\r\n");
    expect(edited.split("\r\n")).toContain("## Renamed <!-- bloommd:id=child -->");
  });

  test("keeps stable IDs and replaces duplicate IDs instead of appending comments", () => {
    const markdown = "# Root <!-- bloommd:id=root -->\n\n## Child <!-- bloommd:id=root -->\n";
    const result = ensureHeadingIds(markdown);
    expect(result.changed).toBe(true);
    expect(result.markdown.match(/bloommd:id=/g)).toHaveLength(2);
    expect(parseHeadingTree(result.markdown)[0]?.id).toBe("root");
    expect(parseHeadingTree(result.markdown)[0]?.children[0]?.id).not.toBe("root");
  });

  test("round-trips typed metadata without changing the node body", () => {
    const markdown = "# Source <!-- bloommd:id=source -->\n\nKeep this citation.\n";
    const updated = updateHeadingMetadata(markdown, "source", {
      kind: "source",
      url: "https://example.com",
      citation: "Author (2026)",
    });
    expect(updated).toContain('bloommd:meta={"kind":"source","url":"https://example.com","citation":"Author (2026)"}');
    expect(updated).toContain("Keep this citation.");
    expect(parseHeadingTree(updated)[0]?.metadata?.kind).toBe("source");
  });

  test("moves and copies complete branches without corrupting hierarchy", () => {
    const markdown = "# Root <!-- bloommd:id=root -->\n\n## A <!-- bloommd:id=a -->\n\n### A child <!-- bloommd:id=a-child -->\n\n## B <!-- bloommd:id=b -->\n";
    const moved = moveHeadingBranch(markdown, "a", "b");
    const movedTree = parseHeadingTree(moved);
    expect(movedTree[0]?.children.map((node) => node.title)).toEqual(["B"]);
    expect(movedTree[0]?.children[0]?.children.map((node) => node.title)).toEqual(["A"]);
    expect(movedTree[0]?.children[0]?.children[0]?.children.map((node) => node.title)).toEqual(["A child"]);

    const copied = copyHeadingBranch(markdown, nodeId(markdown, "A"), "b");
    expect(flattenHeadings(parseHeadingTree(copied)).filter((node) => node.title === "A")).toHaveLength(2);
  });
});

describe("concept map metadata in Obsidian notes", () => {
  test("parses and writes the linked note and relations", () => {
    const markdown = "# Wirtschaft <!-- bloommd:id=w -->\n\n## Arbeit <!-- bloommd:id=a -->\n";
    const updated = updateHeadingMetadata(markdown, "w", { kind: "topic", note: "Wirtschaft", relations: [{ target: "a", label: "braucht" }] });
    const [root] = parseHeadingTree(updated);
    expect(root?.metadata).toEqual({ kind: "topic", note: "Wirtschaft", relations: [{ target: "a", label: "braucht" }] });
    expect(parseHeadingTree(updated)[0]?.children[0]?.id).toBe("a");
  });

  test("drops malformed relations but keeps the rest", () => {
    const markdown = "# W <!-- bloommd:id=w --> <!-- bloommd:meta={\"kind\":\"topic\",\"note\":\" \",\"relations\":[{\"target\":7},{\"target\":\"a\"}]} -->\n";
    expect(parseHeadingTree(markdown)[0]?.metadata).toEqual({ kind: "topic", relations: [{ target: "a" }] });
  });
});
