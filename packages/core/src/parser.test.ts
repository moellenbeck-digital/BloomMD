import { describe, expect, test } from "bun:test";
import { parseFile, serializeToMarkdown } from "./parser";
import { addNode, deleteNode, moveNode, renameNode } from "./operations";

const SAMPLE_MD = `---
title: Mein Projekt
id: "8f3a2b1c"
created: "2026-04-06T10:00:00Z"
updated: "2026-04-06T14:30:00Z"
tags:
  - projekt
  - architektur
layout:
  direction: LR
---

# Mein Projekt

Übersicht zum Projekt.

## Architektur

Details zur Architektur mit **fetter Schrift**.

### Frontend

React-basiert.

### Backend

Node.js mit Bun.

## Zeitplan

- Q1: Prototyp
- Q2: Beta
`;

describe("parseFile", () => {
  test("parses YAML frontmatter without executable tags and accepts a BOM", () => {
    const doc = parseFile("safe.md", `\uFEFF---\ntitle: Safe\ntags: [one, two]\n---\n# Safe\n`);
    expect(doc.frontmatter.title).toBe("Safe");
    expect(doc.frontmatter.tags).toEqual(["one", "two"]);
    expect(() => parseFile("unsafe.md", `---\ntitle: !!js/function 'function () {}'\n---\n# Unsafe\n`)).toThrow();
  });

  test("supports CommonMark setext headings", () => {
    const doc = parseFile("commonmark.md", "Project\n=======\n\nIntro.\n\nDetails\n-------\n\nBody.\n");
    const root = doc.nodes.get(doc.rootId)!;
    expect(root.title).toBe("Project");
    expect(root.level).toBe(1);
    expect(root.children).toHaveLength(1);
    expect(doc.nodes.get(root.children[0]!)?.title).toBe("Details");
  });

  test("does not turn headings in code, HTML, blockquotes, or escaped text into map nodes", () => {
    const markdown = `# Root

> ## Quoted heading

    ## Indented code

\`\`\`md
## Fenced code
\`\`\`

<section>
## Raw HTML text
</section>

\\## Escaped heading
`;
    const doc = parseFile("commonmark.md", markdown);
    expect(doc.nodes.size).toBe(1);
    const content = doc.nodes.get(doc.rootId)!.content;
    expect(content).toContain("Quoted heading");
    expect(content).toContain("Fenced code");
  });

  test("preserves CommonMark reference links and nested list content through a roundtrip", () => {
    const markdown = `# Sources

- Parent
  - Child with [CommonMark][spec]

[spec]: https://spec.commonmark.org/0.31.2/ "Specification"
`;
    const parsed = parseFile("commonmark.md", markdown);
    const reparsed = parseFile("commonmark.md", serializeToMarkdown(parsed));
    expect(reparsed.nodes.get(reparsed.rootId)!.content).toContain("[CommonMark][spec]");
    expect(reparsed.nodes.get(reparsed.rootId)!.content).toContain("https://spec.commonmark.org/0.31.2/");
  });
  test("parses frontmatter correctly", () => {
    const doc = parseFile("test.md", SAMPLE_MD);

    expect(doc.frontmatter.title).toBe("Mein Projekt");
    expect(doc.frontmatter.id).toBe("8f3a2b1c");
    expect(doc.frontmatter.tags).toEqual(["projekt", "architektur"]);
    expect(doc.frontmatter.layout?.direction).toBe("LR");
  });

  test("creates correct tree structure", () => {
    const doc = parseFile("test.md", SAMPLE_MD);

    expect(doc.nodes.size).toBe(5);

    const root = doc.nodes.get(doc.rootId)!;
    expect(root.title).toBe("Mein Projekt");
    expect(root.level).toBe(1);
    expect(root.parentId).toBeNull();
    expect(root.children).toHaveLength(2);

    // Architektur node
    const archId = root.children[0]!;
    const arch = doc.nodes.get(archId)!;
    expect(arch.title).toBe("Architektur");
    expect(arch.level).toBe(2);
    expect(arch.parentId).toBe(doc.rootId);
    expect(arch.children).toHaveLength(2);

    // Frontend node
    const frontendId = arch.children[0]!;
    const frontend = doc.nodes.get(frontendId)!;
    expect(frontend.title).toBe("Frontend");
    expect(frontend.level).toBe(3);
    expect(frontend.parentId).toBe(archId);
    expect(frontend.children).toHaveLength(0);

    // Backend node
    const backendId = arch.children[1]!;
    const backend = doc.nodes.get(backendId)!;
    expect(backend.title).toBe("Backend");
    expect(backend.level).toBe(3);

    // Zeitplan node
    const zeitplanId = root.children[1]!;
    const zeitplan = doc.nodes.get(zeitplanId)!;
    expect(zeitplan.title).toBe("Zeitplan");
    expect(zeitplan.level).toBe(2);
    expect(zeitplan.parentId).toBe(doc.rootId);
  });

  test("extracts node content", () => {
    const doc = parseFile("test.md", SAMPLE_MD);

    const root = doc.nodes.get(doc.rootId)!;
    expect(root.content).toContain("Übersicht zum Projekt");

    const archId = root.children[0]!;
    const arch = doc.nodes.get(archId)!;
    expect(arch.content).toContain("fetter Schrift");

    const zeitplanId = root.children[1]!;
    const zeitplan = doc.nodes.get(zeitplanId)!;
    expect(zeitplan.content).toContain("Q1: Prototyp");
    expect(zeitplan.content).toContain("Q2: Beta");
  });

  test("handles markdown with no headings", () => {
    const md = `---
title: Notiz
id: abc123
created: "2026-04-06T10:00:00Z"
updated: "2026-04-06T10:00:00Z"
---

Just some plain text without headings.
`;
    const doc = parseFile("notiz.md", md);

    expect(doc.nodes.size).toBe(1);
    const root = doc.nodes.get(doc.rootId)!;
    expect(root.title).toBe("Notiz");
    expect(root.content).toContain("plain text without headings");
  });

  test("normalizes missing frontmatter and preserves custom YAML fields", () => {
    const bare = parseFile("notes/weekly.md", "# Weekly\n");
    expect(bare.frontmatter.title).toBe("weekly");
    expect(bare.frontmatter.id.length).toBeGreaterThan(0);
    expect(bare.frontmatter.created.length).toBeGreaterThan(0);

    const custom = parseFile("custom.md", "---\ntitle: Custom\nowner: Ada\n---\n# Custom\n");
    const roundtrip = serializeToMarkdown(custom);
    expect(roundtrip).toContain("owner: Ada");
  });

  test("handles level jumps (## directly under #, then ####)", () => {
    const md = `---
title: Jump Test
id: jump1
created: "2026-04-06T10:00:00Z"
updated: "2026-04-06T10:00:00Z"
---

# Root

## Level 2

#### Level 4 directly
`;
    const doc = parseFile("jump.md", md);

    expect(doc.nodes.size).toBe(3);
    const root = doc.nodes.get(doc.rootId)!;
    const l2 = doc.nodes.get(root.children[0]!)!;
    expect(l2.title).toBe("Level 2");

    // Level 4 becomes child of Level 2 (closest ancestor with lower level)
    const l4 = doc.nodes.get(l2.children[0]!)!;
    expect(l4.title).toBe("Level 4 directly");
    expect(l4.level).toBe(4);
    expect(l4.parentId).toBe(l2.id);
  });

  test("uses persisted BloomMD node ids from heading comments", () => {
    const md = `---
title: Stable
id: stable
created: "2026-04-06T10:00:00Z"
updated: "2026-04-06T10:00:00Z"
---

# Stable <!-- bloommd:id=root-node -->

## Branch <!-- bloommd:id=branch-node -->
`;
    const doc = parseFile("stable.md", md);
    const root = doc.nodes.get(doc.rootId)!;
    const branch = doc.nodes.get(root.children[0]!)!;

    expect(root.id).toBe("root-node");
    expect(root.title).toBe("Stable");
    expect(branch.id).toBe("branch-node");
    expect(branch.title).toBe("Branch");
  });
});

describe("serializeToMarkdown", () => {
  test("roundtrips typed node metadata without exposing a proprietary file format", () => {
    const doc = parseFile("typed.md", "# Portal <!-- bloommd:id=portal --> <!-- bloommd:meta={\"kind\":\"web\",\"url\":\"https://example.com\",\"previewTitle\":\"Example\",\"previewDescription\":\"A preview\",\"previewImage\":\"https://example.com/preview.png\"} -->\n\nOpen the roadmap.\n");
    const node = doc.nodes.get("portal")!;

    expect(node.metadata).toEqual({ kind: "web", url: "https://example.com", previewTitle: "Example", previewDescription: "A preview", previewImage: "https://example.com/preview.png" });

    const reparsed = parseFile("typed.md", serializeToMarkdown(doc));
    expect(reparsed.nodes.get("portal")!.metadata).toEqual(node.metadata);
  });

  test("ignores malformed or unsupported node metadata", () => {
    const doc = parseFile("typed.md", "# Safe <!-- bloommd:meta={\"kind\":\"script\",\"url\":\"javascript:alert(1)\"} -->\n");
    expect(doc.nodes.get(doc.rootId)!.metadata).toBeUndefined();
  });
  test("roundtrip preserves structure", () => {
    const doc = parseFile("test.md", SAMPLE_MD);
    const serialized = serializeToMarkdown(doc);
    const reparsed = parseFile("test.md", serialized);

    expect(reparsed.nodes.size).toBe(doc.nodes.size);
    expect(reparsed.frontmatter.title).toBe(doc.frontmatter.title);
    expect(reparsed.frontmatter.id).toBe(doc.frontmatter.id);
    expect(reparsed.frontmatter.tags).toEqual(doc.frontmatter.tags);

    // Verify tree structure matches
    const origRoot = doc.nodes.get(doc.rootId)!;
    const newRoot = reparsed.nodes.get(reparsed.rootId)!;
    expect(newRoot.title).toBe(origRoot.title);
    expect(newRoot.children.length).toBe(origRoot.children.length);
  });

  test("roundtrip preserves content", () => {
    const doc = parseFile("test.md", SAMPLE_MD);
    const serialized = serializeToMarkdown(doc);
    const reparsed = parseFile("test.md", serialized);

    const origRoot = doc.nodes.get(doc.rootId)!;
    const newRoot = reparsed.nodes.get(reparsed.rootId)!;
    expect(newRoot.content).toBe(origRoot.content);

    // Check Zeitplan list content survives roundtrip
    const newZeitplan = reparsed.nodes.get(newRoot.children[1]!)!;
    expect(newZeitplan.content).toContain("Q1: Prototyp");
    expect(newZeitplan.content).toContain("Q2: Beta");
  });

  test("roundtrip preserves tables, code blocks, images, and links", () => {
    const md = `---
title: Rich Markdown
id: rich-md
created: "2026-04-06T10:00:00Z"
updated: "2026-04-06T10:00:00Z"
---

# Rich Markdown

Intro with [a link](https://bloommd.app) and an image:

![Diagram](./assets/diagram.png)

| Name | Status |
| ---- | ------ |
| Core | Ready  |

\`\`\`ts
const answer: number = 42;
\`\`\`
`;
    const doc = parseFile("rich.md", md);
    const serialized = serializeToMarkdown(doc);
    const reparsed = parseFile("rich.md", serialized);
    const root = reparsed.nodes.get(reparsed.rootId)!;

    expect(root.content).toContain("[a link](https://bloommd.app)");
    expect(root.content).toContain("![Diagram](./assets/diagram.png)");
    expect(root.content).toContain("| Name | Status |");
    expect(root.content).toContain("const answer: number = 42;");
  });

  test("updates the 'updated' timestamp", () => {
    const doc = parseFile("test.md", SAMPLE_MD);
    const serialized = serializeToMarkdown(doc);

    const reparsed = parseFile("test.md", serialized);
    expect(reparsed.frontmatter.updated).not.toBe("2026-04-06T14:30:00Z");
  });

  test("writes BloomMD node ids into heading comments", () => {
    const doc = parseFile("test.md", SAMPLE_MD);
    const serialized = serializeToMarkdown(doc);
    const root = doc.nodes.get(doc.rootId)!;

    expect(serialized).toContain(`# Mein Projekt <!-- bloommd:id=${root.id} -->`);
    const reparsed = parseFile("test.md", serialized);
    expect(reparsed.rootId).toBe(root.id);
  });

  test("preserves Markdown before the first heading", () => {
    const markdown = `Intro paragraph with [context](https://example.com).\n\n> Important preface\n\n# Main\n\nBody.`;
    const serialized = serializeToMarkdown(parseFile("preamble.md", markdown));

    expect(serialized).toContain("Intro paragraph with [context](https://example.com).");
    expect(serialized).toContain("> Important preface");
    expect(serialized.indexOf("Intro paragraph")).toBeLessThan(serialized.indexOf("# Main"));
  });

  test("preserves every top-level heading tree", () => {
    const markdown = `# First\n\nFirst body.\n\n## First child\n\n# Second\n\nSecond body.\n\n## Second child`;
    const serialized = serializeToMarkdown(parseFile("forest.md", markdown));
    const reparsed = parseFile("forest.md", serialized);
    const topLevelTitles = Array.from(reparsed.nodes.values())
      .filter((node) => node.parentId === null)
      .map((node) => node.title);

    expect(topLevelTitles).toEqual(["First", "Second"]);
    expect(serialized).toContain("First body.");
    expect(serialized).toContain("Second body.");
  });
});

describe("operations", () => {
  test("addNode creates a child", () => {
    const doc = parseFile("test.md", SAMPLE_MD);
    const root = doc.nodes.get(doc.rootId)!;
    const before = root.children.length;

    const newNode = addNode(doc, doc.rootId, "Neuer Bereich", "Inhalt");

    expect(root.children.length).toBe(before + 1);
    expect(newNode.parentId).toBe(doc.rootId);
    expect(newNode.level).toBe(2);
    expect(newNode.title).toBe("Neuer Bereich");
    expect(newNode.content).toBe("Inhalt");
    expect(doc.nodes.get(newNode.id)).toBe(newNode);
  });

  test("deleteNode removes node and descendants", () => {
    const doc = parseFile("test.md", SAMPLE_MD);
    const root = doc.nodes.get(doc.rootId)!;
    const archId = root.children[0]!;
    const arch = doc.nodes.get(archId)!;
    const descendantCount = arch.children.length; // Frontend + Backend

    deleteNode(doc, archId);

    expect(doc.nodes.has(archId)).toBe(false);
    expect(root.children).not.toContain(archId);
    // All descendants gone too
    for (const childId of arch.children) {
      expect(doc.nodes.has(childId)).toBe(false);
    }
    expect(doc.nodes.size).toBe(5 - 1 - descendantCount);
  });

  test("deleteNode throws on root", () => {
    const doc = parseFile("test.md", SAMPLE_MD);
    expect(() => deleteNode(doc, doc.rootId)).toThrow("Cannot delete root");
  });

  test("moveNode reparents and updates levels", () => {
    const doc = parseFile("test.md", SAMPLE_MD);
    const root = doc.nodes.get(doc.rootId)!;
    const archId = root.children[0]!;
    const arch = doc.nodes.get(archId)!;
    const frontendId = arch.children[0]!;
    const zeitplanId = root.children[1]!;

    // Move Frontend under Zeitplan
    moveNode(doc, frontendId, zeitplanId);

    const frontend = doc.nodes.get(frontendId)!;
    expect(frontend.parentId).toBe(zeitplanId);
    expect(frontend.level).toBe(3); // Zeitplan is level 2, so Frontend becomes 3
    expect(arch.children).not.toContain(frontendId);

    const zeitplan = doc.nodes.get(zeitplanId)!;
    expect(zeitplan.children).toContain(frontendId);
  });

  test("moveNode prevents circular move", () => {
    const doc = parseFile("test.md", SAMPLE_MD);
    const root = doc.nodes.get(doc.rootId)!;
    const archId = root.children[0]!;
    const arch = doc.nodes.get(archId)!;
    const frontendId = arch.children[0]!;

    // Moving Architektur under its own child Frontend should fail
    expect(() => moveNode(doc, archId, frontendId)).toThrow("own subtree");
  });

  test("renameNode changes title", () => {
    const doc = parseFile("test.md", SAMPLE_MD);
    const root = doc.nodes.get(doc.rootId)!;

    renameNode(doc, doc.rootId, "Neuer Name");
    expect(root.title).toBe("Neuer Name");
  });

  test("added node survives roundtrip", () => {
    const doc = parseFile("test.md", SAMPLE_MD);
    addNode(doc, doc.rootId, "Neuer Bereich", "Neuer Inhalt");

    const serialized = serializeToMarkdown(doc);
    const reparsed = parseFile("test.md", serialized);

    expect(reparsed.nodes.size).toBe(6);

    // Find the new node by title
    const newNode = [...reparsed.nodes.values()].find(
      (n) => n.title === "Neuer Bereich",
    );
    expect(newNode).toBeDefined();
    expect(newNode!.content).toBe("Neuer Inhalt");
  });
});

describe("heading fidelity", () => {
  const roundtripTitle = (raw: string) => {
    const doc = parseFile("fidelity.md", raw);
    return serializeToMarkdown(doc)
      .split("\n")
      .find((line) => line.startsWith("#"))
      ?.replace(/\s*<!--\s*bloommd:id=[^>]*-->\s*/, "");
  };

  test("preserves links in headings across a save", () => {
    expect(roundtripTitle("# [Spec](https://example.com/a)\n")).toBe("# [Spec](https://example.com/a)");
  });

  test("preserves inline code, emphasis and strong in headings", () => {
    expect(roundtripTitle("# Uses `remark` here\n")).toBe("# Uses `remark` here");
    expect(roundtripTitle("# **Bold** and *soft*\n")).toBe("# **Bold** and *soft*");
  });

  test("reads Setext headings and keeps their inline markup", () => {
    const doc = parseFile("setext.md", "Project [Docs](https://example.com)\n===\n\n## Child\n");
    const titles = [...doc.nodes.values()].map((node) => node.title);
    expect(titles).toContain("Project [Docs](https://example.com)");
    expect(titles).toContain("Child");
  });

  test("drops an ATX closing sequence but keeps a trailing hash without space", () => {
    expect(parseFile("a.md", "# Title ###\n").nodes.values().next().value?.title).toBe("Title");
    expect(parseFile("b.md", "# Title#\n").nodes.values().next().value?.title).toBe("Title#");
  });

  test("never leaks the bloommd id comment into the title", () => {
    const doc = parseFile("c.md", "# Title <!-- bloommd:id=keepme -->\n");
    expect(doc.nodes.get("keepme")?.title).toBe("Title");
  });
});

describe("concept map metadata", () => {
  const markdown = [
    "# Wirtschaft <!-- bloommd:id=w --> <!-- bloommd:meta={\"kind\":\"topic\",\"note\":\"Wirtschaft\",\"relations\":[{\"target\":\"a\",\"label\":\"braucht\"},{\"target\":\"u\"},{\"target\":\"\"},{\"label\":\"no target\"}]} -->",
    "",
    "## Arbeit <!-- bloommd:id=a -->",
    "",
    "## Unternehmen <!-- bloommd:id=u -->",
    "",
  ].join("\n");

  test("keeps the linked note and well-formed relations", () => {
    const node = parseFile("map.md", markdown).nodes.get("w");
    expect(node?.metadata).toEqual({
      kind: "topic",
      note: "Wirtschaft",
      relations: [{ target: "a", label: "braucht" }, { target: "u" }],
    });
  });

  test("round-trips them through the desktop and web serializer", () => {
    const again = parseFile("map.md", serializeToMarkdown(parseFile("map.md", markdown)));
    expect(again.nodes.get("w")?.metadata?.note).toBe("Wirtschaft");
    expect(again.nodes.get("w")?.metadata?.relations).toEqual([{ target: "a", label: "braucht" }, { target: "u" }]);
  });
});
