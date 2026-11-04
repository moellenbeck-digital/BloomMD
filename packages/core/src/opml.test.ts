import { describe, expect, test } from "bun:test";
import { exportOpml, importOpml, OpmlError, parseFile, serializeToMarkdown, type MindMapDocument } from "./browser";

function outline(doc: MindMapDocument): Array<{ level: number; title: string; content: string }> {
  const result: Array<{ level: number; title: string; content: string }> = [];
  const walk = (id: string) => {
    const node = doc.nodes.get(id);
    if (!node) return;
    result.push({ level: node.level, title: node.title, content: node.content });
    node.children.forEach(walk);
  };
  Array.from(doc.nodes.values()).filter((node) => node.parentId === null).forEach((node) => walk(node.id));
  return result;
}

function errorOf(action: () => unknown): OpmlError {
  try {
    action();
  } catch (error) {
    if (error instanceof OpmlError) return error;
    throw error;
  }
  throw new Error("Expected an OpmlError");
}

describe("exportOpml", () => {
  const markdown = [
    "---",
    "title: Reise & Plan",
    "---",
    "# Reise",
    "",
    "Start im <Mai>.",
    "",
    "## Hotel",
    "",
    "## Flug \"direkt\"",
    "",
    "Zwei Zeilen:",
    "",
    "Zeile zwei",
    "",
    "### Gepäck",
    "",
  ].join("\n");

  test("writes OPML 2.0 with the title in the head and nested outlines", () => {
    const xml = exportOpml(parseFile("reise.md", markdown));
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<opml version="2.0">')).toBe(true);
    expect(xml).toContain("<head>\n    <title>Reise &amp; Plan</title>\n  </head>");
    expect(xml).toContain('<outline text="Reise" _note="Start im &lt;Mai&gt;.">');
    expect(xml).toContain('<outline text="Hotel"/>');
    expect(xml).toContain('<outline text="Flug &quot;direkt&quot;"');
    expect(xml).toContain('<outline text="Gepäck"/>');
  });

  test("escapes XML and keeps line breaks in notes as character references", () => {
    const xml = exportOpml(parseFile("reise.md", markdown));
    expect(xml).toContain("Zwei Zeilen:&#10;&#10;Zeile zwei");
    expect(xml).not.toMatch(/_note="[^"]*\n/);
  });

  test("drops characters XML cannot carry", () => {
    const doc = parseFile("x.md", "# A\u0001B\n");
    expect(exportOpml(doc)).toContain('text="AB"');
  });
});

describe("importOpml", () => {
  test("reads text, _note and nested outlines into a heading hierarchy", () => {
    const result = importOpml(`<?xml version="1.0"?>
<opml version="2.0">
  <head><title>Plan</title></head>
  <body>
    <outline text="Root" _note="Notiz &amp; mehr">
      <outline text="A">
        <outline text="A1" _note="Zeile 1&#10;Zeile 2"/>
      </outline>
      <outline text="B"/>
    </outline>
  </body>
</opml>`);
    expect(result.title).toBe("Plan");
    expect(result.nodeCount).toBe(4);
    const doc = parseFile("plan.md", result.markdown);
    expect(outline(doc)).toEqual([
      { level: 1, title: "Root", content: "Notiz & mehr" },
      { level: 2, title: "A", content: "" },
      { level: 3, title: "A1", content: "Zeile 1\nZeile 2" },
      { level: 2, title: "B", content: "" },
    ]);
  });

  test("puts several top-level outlines under a root named after the head title", () => {
    const result = importOpml(`<opml version="2.0"><head><title>Liste</title></head><body><outline text="Eins"/><outline text="Zwei"/></body></opml>`);
    const doc = parseFile("liste.md", result.markdown);
    expect(outline(doc)).toEqual([
      { level: 1, title: "Liste", content: "" },
      { level: 2, title: "Eins", content: "" },
      { level: 2, title: "Zwei", content: "" },
    ]);
  });

  test("uses the root outline as title without a head title and accepts CDATA, comments and single quotes", () => {
    const result = importOpml(`<?xml version='1.0'?><!-- c --><opml version='1.0'><head><title><![CDATA[A & B]]></title></head><body><outline text='X'/></body></opml>`);
    expect(result.title).toBe("A & B");
    expect(importOpml(`<opml><body><outline text="Nur Root"/></body></opml>`).title).toBe("Nur Root");
  });

  test("falls back to the title attribute and names blank texts Untitled", () => {
    const result = importOpml(`<opml><body><outline title="Alt"/><outline text="  "/></body></opml>`);
    expect(result.markdown).toContain("## Alt");
    expect(result.markdown).toContain("## Untitled");
  });

  test("folds outlines below level six into a bullet list", () => {
    let nested = `<outline text="L7"><outline text="L8" _note="n"/></outline>`;
    for (let level = 6; level >= 1; level -= 1) nested = `<outline text="L${level}">${nested}</outline>`;
    const result = importOpml(`<opml><body>${nested}</body></opml>`);
    const doc = parseFile("tief.md", result.markdown);
    const nodes = outline(doc);
    expect(nodes.map((node) => node.level)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(nodes[5]?.content).toBe("- L7\n  - L8\n    n");
  });

  test("keeps notes from forging headings or node comments", () => {
    const result = importOpml(`<opml><body><outline text="Root &lt;!-- bloommd:id=evil --&gt;" _note="# Fremd&#10;&#10;\`\`\`&#10;# Code&#10;\`\`\`"/></body></opml>`);
    const doc = parseFile("x.md", result.markdown);
    expect(doc.nodes.size).toBe(1);
    const root = doc.nodes.get(doc.rootId);
    expect(root?.id).not.toBe("evil");
    expect(root?.content).toContain("# Code");
    expect(root?.content).toContain("# Fremd");
  });

  test("rejects empty and broken input with a readable error", () => {
    expect(errorOf(() => importOpml("")).code).toBe("empty");
    expect(errorOf(() => importOpml("  \n ")).code).toBe("empty");
    expect(errorOf(() => importOpml("<opml><body><outline text='a'></body></opml>")).code).toBe("malformed");
    expect(errorOf(() => importOpml("<opml><body>")).code).toBe("malformed");
    expect(errorOf(() => importOpml("kein xml")).code).toBe("malformed");
    expect(errorOf(() => importOpml("<opml><body><outline text=a/></body></opml>")).code).toBe("malformed");
    expect(errorOf(() => importOpml("<opml><body><outline text='a' text='b'/></body></opml>")).code).toBe("malformed");
    expect(errorOf(() => importOpml("<opml><body><outline text='a & b'/></body></opml>")).code).toBe("malformed");
    expect(errorOf(() => importOpml("<a/><b/>")).code).toBe("malformed");
    expect(errorOf(() => importOpml("<opml><body><outline text='a'/></body></opml>x")).code).toBe("malformed");
    expect(errorOf(() => importOpml("<opml><body><outline text='a'></body></opml>")).message).toContain("does not match");
  });

  test("rejects files that are not OPML or have no outlines", () => {
    expect(errorOf(() => importOpml("<html><body/></html>")).code).toBe("not-opml");
    expect(errorOf(() => importOpml("<opml><head/></opml>")).code).toBe("not-opml");
    expect(errorOf(() => importOpml("<opml><body/></opml>")).code).toBe("no-outlines");
  });

  test("reports an outline without text", () => {
    const error = errorOf(() => importOpml("<opml><body><outline text='ok'><outline _note='x'/></outline></body></opml>"));
    expect(error.code).toBe("missing-text");
    expect(error.message).toContain("Outline 2");
  });

  test("never resolves DOCTYPE or external entities", () => {
    const xxe = `<?xml version="1.0"?><!DOCTYPE opml [<!ENTITY x SYSTEM "file:///etc/passwd">]><opml><body><outline text="&x;"/></body></opml>`;
    expect(errorOf(() => importOpml(xxe)).code).toBe("forbidden");
    expect(errorOf(() => importOpml(`<opml><body><outline text="&x;"/></body></opml>`)).code).toBe("forbidden");
    const bomb = `<!DOCTYPE lolz [<!ENTITY a "aaaa"><!ENTITY b "&a;&a;&a;">]><opml><body><outline text="&b;"/></body></opml>`;
    expect(errorOf(() => importOpml(bomb)).code).toBe("forbidden");
  });

  test("limits nesting depth", () => {
    const deep = `<opml><body>${"<outline text='x'>".repeat(300)}${"</outline>".repeat(300)}</body></opml>`;
    expect(errorOf(() => importOpml(deep)).code).toBe("too-large");
  });

  test("decodes numeric character references and rejects invalid ones", () => {
    expect(importOpml(`<opml><body><outline text="&#65;&#x42;"/></body></opml>`).markdown).toContain("# AB");
    expect(errorOf(() => importOpml(`<opml><body><outline text="&#0;"/></body></opml>`)).code).toBe("malformed");
  });
});

describe("OPML round trip", () => {
  test("Markdown → OPML → Markdown keeps the heading structure and notes", () => {
    const original = parseFile("reise.md", [
      "---",
      "title: Reise",
      "---",
      "# Reise",
      "",
      "Ein Satz & ein <Tag>.",
      "",
      "## Hotel",
      "",
      "- Frühstück",
      "- Pool",
      "",
      "### Zimmer",
      "",
      "## Flug",
      "",
      "```ts",
      "const a = 1;",
      "```",
      "",
      "### Gepäck",
      "",
      "#### Handgepäck",
      "",
    ].join("\n"));
    const result = importOpml(exportOpml(original));
    expect(result.title).toBe("Reise");
    const restored = parseFile("reise.md", result.markdown);
    expect(outline(restored)).toEqual(outline(original));
    // And the restored Markdown survives another serialization.
    expect(outline(parseFile("reise.md", serializeToMarkdown(restored)))).toEqual(outline(original));
  });
});
