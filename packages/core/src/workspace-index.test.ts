import { describe, expect, test } from "bun:test";
import { buildWorkspaceMindMap, headingNodeId } from "./workspace-document";
import { lintWorkspace } from "./workspace-lint";
import { buildWorkspaceIndex, type WorkspaceIndex } from "./workspace-index";

const TODAY = "2026-10-30";

function filesOf(entries: Record<string, string>) {
  return Object.entries(entries).map(([path, markdown]) => ({ path, markdown }));
}

function indexOf(entries: Record<string, string>, today = TODAY): WorkspaceIndex {
  return buildWorkspaceIndex(filesOf(entries), { today });
}

function heading(index: WorkspaceIndex, path: string, title: string) {
  const found = index.headings.find((entry) => entry.path === path && entry.title === title);
  if (!found) throw new Error(`no heading ${title} in ${path}`);
  return found;
}

function document(index: WorkspaceIndex, path: string) {
  const found = index.documents.find((entry) => entry.path === path);
  if (!found) throw new Error(`no document ${path}`);
  return found;
}

describe("nodes", () => {
  test("documents and headings are separate kinds, with level, line, anchor and id", () => {
    const index = indexOf({
      "a.md": "---\ntitle: Alpha\nstatus: bestätigt\n---\n\n# Alpha\n\n## Erster Schritt\n\ntext\n\n### Unter-Schritt\n",
    });
    expect(index.documents).toHaveLength(1);
    expect(document(index, "a.md")).toMatchObject({ kind: "document", id: "file:a.md", title: "Alpha", status: "bestätigt" });
    expect(index.headings.map((entry) => [entry.kind, entry.level, entry.title, entry.line, entry.anchor])).toEqual([
      ["heading", 1, "Alpha", 6, "alpha"],
      ["heading", 2, "Erster Schritt", 8, "erster-schritt"],
      ["heading", 3, "Unter-Schritt", 12, "unter-schritt"],
    ]);
    expect(index.headings[2]!.parentId).toBe(index.headings[1]!.id);
    expect(index.headings[0]!.parentId).toBeNull();
    expect(document(index, "a.md").headingIds).toEqual(index.headings.map((entry) => entry.id));
  });

  test("heading ids are the ids of the workspace mind map", () => {
    const files = filesOf({ "a.md": "# Alpha\n\n## Zwei\n\n## Drei\n" });
    const index = buildWorkspaceIndex(files, { today: TODAY });
    expect(index.headings.map((entry) => entry.id)).toEqual([
      headingNodeId("a.md", 0, "Alpha"),
      headingNodeId("a.md", 1, "Zwei"),
      headingNodeId("a.md", 2, "Drei"),
    ]);
    const map = buildWorkspaceMindMap(files);
    for (const entry of index.headings) expect(map.nodes.has(entry.id)).toBe(true);
  });

  test("a file without headings has a document node and no heading nodes", () => {
    const index = indexOf({ "plain.md": "nur Text\n" });
    expect(index.documents).toHaveLength(1);
    expect(index.headings).toEqual([]);
    expect(index.documents[0]!.title).toBe("plain");
  });

  test("the document title is the frontmatter title, else the first heading, else the file name", () => {
    const index = indexOf({ "a.md": "---\ntitle: Aus Frontmatter\n---\n# Heading\n", "b/b-datei.md": "# Erste\n\n# Zweite\n", "c.md": "Text" });
    expect(index.documents.map((entry) => entry.title)).toEqual(["Aus Frontmatter", "Erste", "c"]);
  });

  test("headings in code fences are not headings", () => {
    const index = indexOf({ "a.md": "# Echt\n\n```md\n# Beispiel\n```\n" });
    expect(index.headings.map((entry) => entry.title)).toEqual(["Echt"]);
  });
});

describe("backlinks", () => {
  const files = {
    "target.md": "# Ziel\n\n## Abschnitt A\n\n## Abschnitt B\n",
    "one.md": "# Eins\n\nVorab [[target]] gelesen.\n\n## Details\n\nSiehe [[target#Abschnitt A]] und [x](target.md#abschnitt-b).\n",
    "two.md": "[[target#Abschnitt A|der Abschnitt]]\n",
  };

  test("a link without anchor counts for the document", () => {
    const target = document(indexOf(files), "target.md");
    expect(target.backlinks.count).toBe(1);
    expect(target.backlinks.entries[0]).toMatchObject({
      sourcePath: "one.md",
      sourceTitle: "Eins",
      line: 3,
      raw: "[[target]]",
      anchor: null,
      anchorMatched: true,
    });
  });

  test("a link with anchor counts for the heading, not for the document", () => {
    const index = indexOf(files);
    const a = heading(index, "target.md", "Abschnitt A");
    const b = heading(index, "target.md", "Abschnitt B");
    expect(a.backlinks).toMatchObject({ count: 2, sources: 2 });
    expect(a.backlinks.entries.map((entry) => [entry.sourcePath, entry.line, entry.raw])).toEqual([
      ["one.md", 7, "[[target#Abschnitt A]]"],
      ["two.md", 1, "[[target#Abschnitt A|der Abschnitt]]"],
    ]);
    expect(b.backlinks).toMatchObject({ count: 1, sources: 1 });
    expect(b.backlinks.entries[0]).toMatchObject({ raw: "[x](target.md#abschnitt-b)", anchor: "abschnitt-b" });
    expect(document(index, "target.md").backlinks.count).toBe(1);
    expect(heading(index, "target.md", "Ziel").backlinks.count).toBe(0);
  });

  test("the source heading is the heading the link stands under", () => {
    const index = indexOf(files);
    const [first, second] = heading(index, "target.md", "Abschnitt A").backlinks.entries;
    expect(first).toMatchObject({ sourceHeadingTitle: "Details", sourceHeadingId: heading(index, "one.md", "Details").id });
    // Above the first heading (here: no heading at all) there is none.
    expect(second).toMatchObject({ sourceHeadingId: null, sourceHeadingTitle: null });
    expect(document(index, "target.md").backlinks.entries[0]).toMatchObject({ sourceHeadingId: heading(index, "one.md", "Eins").id, sourceHeadingTitle: "Eins" });
  });

  test("a link in code is not a backlink", () => {
    const index = indexOf({ "t.md": "# T\n", "s.md": "# S\n\n`[[t]]`\n\n```\n[[t]]\n```\n" });
    expect(document(index, "t.md").backlinks.count).toBe(0);
  });

  test("duplicate headings: the first one takes the anchor", () => {
    const index = indexOf({ "t.md": "# T\n\n## Setup\n\n## Setup\n", "s.md": "[[t#Setup]]" });
    const [first, second] = index.headings.filter((entry) => entry.title === "Setup");
    expect(first!.backlinks.count).toBe(1);
    expect(second!.backlinks.count).toBe(0);
  });

  test("a nested Obsidian anchor targets the last heading", () => {
    const index = indexOf({ "t.md": "# T\n\n## Unter\n", "s.md": "[[t#T#Unter]]" });
    expect(heading(index, "t.md", "Unter").backlinks.count).toBe(1);
    expect(index.findings).toEqual([]);
  });
});

describe("broken and ambiguous links", () => {
  test("come from the graph, with the same decision as the lint", () => {
    const entries = { "one.md": "# One\n\n[[nowhere]]\n\n[[dup]]\n", "a/dup.md": "# A", "b/dup.md": "# B" };
    const index = indexOf(entries);
    const lint = lintWorkspace(filesOf(entries)).findings.filter((finding) => finding.code === "broken-link" || finding.code === "ambiguous-link");
    const mine = index.findings.filter((finding) => finding.code === "broken-link" || finding.code === "ambiguous-link");
    const plain = (finding: { code: string; severity: string; path: string; line: number | null; message: string; detail: string | null }): unknown =>
      ({ code: finding.code, severity: finding.severity, path: finding.path, line: finding.line, message: finding.message, detail: finding.detail });
    expect(mine.map(plain)).toEqual(lint.map(plain));
    expect(mine.map((finding) => [finding.code, finding.severity, finding.line])).toEqual([["broken-link", "error", 3], ["ambiguous-link", "warning", 5]]);
  });
});

describe("stale targets", () => {
  test("an anchor that matches no heading of the file is reported and still counts for the document", () => {
    const index = indexOf({ "t.md": "# T\n\n## Echt\n", "s.md": "# S\n\n[[t#Fehlt]]\n" });
    expect(index.findings).toHaveLength(1);
    expect(index.findings[0]).toMatchObject({ code: "stale-anchor", severity: "warning", path: "s.md", line: 3 });
    expect(index.findings[0]!.message).toContain("#Fehlt");
    expect(index.findings[0]!.detail).toContain("Echt");
    expect(document(index, "t.md").backlinks.entries[0]).toMatchObject({ anchor: "Fehlt", anchorMatched: false });
    expect(index.headings.every((entry) => entry.backlinks.count === 0)).toBe(true);
  });

  test("a heading anchor matches like in the mind map (case, punctuation, spaces)", () => {
    const index = indexOf({ "t.md": "# T\n\n## Was ist „Wahr“?\n", "s.md": "[[t#was ist wahr]]" });
    expect(index.findings).toEqual([]);
    expect(heading(index, "t.md", "Was ist „Wahr“?").backlinks.count).toBe(1);
  });

  test("a block reference is not checked and not reported", () => {
    const index = indexOf({ "t.md": "# T\n\ntext ^abc\n", "s.md": "[[t#^abc]]" });
    expect(index.findings).toEqual([]);
    expect(document(index, "t.md").backlinks.entries[0]).toMatchObject({ anchorMatched: false });
  });

  test.each(["veraltet", "ersetzt", "verworfen"])("status %s on the target is reported, with the successor", (status) => {
    const index = indexOf({
      "alt.md": `---\nstatus: ${status}\nreplaced_by: neu.md\n---\n# Alt\n`,
      "neu.md": "# Neu\n",
      "s.md": "# S\n\n[[alt]]\n",
    });
    expect(index.findings).toHaveLength(1);
    expect(index.findings[0]).toMatchObject({ code: "stale-document", severity: "warning", path: "s.md", line: 3 });
    expect(index.findings[0]!.message).toContain(status);
    expect(index.findings[0]!.detail).toContain("Nachfolger: neu.md");
  });

  test("stale_after in the past is reported, today and the future are not", () => {
    const files = {
      "alt.md": "---\nstale_after: 2026-10-29\n---\n# Alt\n",
      "heute.md": "---\nstale_after: 2026-10-30\n---\n# Heute\n",
      "spaet.md": "---\nstale_after: 2027-01-01\n---\n# Spät\n",
      "s.md": "[[alt]] [[heute]] [[spaet]]",
    };
    const index = indexOf(files);
    expect(index.findings).toHaveLength(1);
    expect(index.findings[0]!.message).toContain("stale_after 2026-10-29");
    expect(index.findings[0]!.detail).not.toContain("Nachfolger");
    // "Today" is injected, so the same files age.
    expect(indexOf(files, "2026-10-31").findings).toHaveLength(2);
    expect(indexOf(files, "2025-01-01").findings).toEqual([]);
  });

  test("status and expiry together give one finding naming both", () => {
    const index = indexOf({ "alt.md": "---\nstatus: veraltet\nstale_after: 2020-01-01\n---\n# Alt\n", "s.md": "[[alt]]" });
    expect(index.findings).toHaveLength(1);
    expect(index.findings[0]!.message).toMatch(/Status „veraltet".*stale_after 2020-01-01/);
  });

  test("a bestätigt target is fine", () => {
    expect(indexOf({ "ok.md": "---\nstatus: bestätigt\n---\n# Ok\n", "s.md": "[[ok]]" }).findings).toEqual([]);
  });

  test("an invalid today is refused", () => {
    expect(() => buildWorkspaceIndex([], { today: "morgen" })).toThrow(/YYYY-MM-DD/);
  });
});

describe("duplicate node ids", () => {
  test("the same id twice in one file is found, although the parser reassigns it", () => {
    const index = indexOf({ "a.md": "# A <!-- bloommd:id=abc -->\n\n## B <!-- bloommd:id=abc -->\n\n## C <!-- bloommd:id=xyz -->\n" });
    expect(index.findings).toHaveLength(1);
    expect(index.findings[0]).toMatchObject({ code: "duplicate-node-id", path: "a.md", line: 1 });
    expect(index.findings[0]!.locations).toEqual([{ path: "a.md", line: 1 }, { path: "a.md", line: 3 }]);
    expect(index.findings[0]!.message).toContain("2× in dieser Datei");
    expect(index.findings[0]!.detail).toBe("a.md:1, a.md:3");
    expect(index.headings.map((entry) => entry.bloommdId)).toEqual(["abc", "abc", "xyz"]);
  });

  test("the same id in several files names every place", () => {
    const index = indexOf({
      "a.md": "# A <!-- bloommd:id=abc -->\n",
      "b/b.md": "# B\n\n## Teil <!-- bloommd:id=abc -->\n",
      "c.md": "# C <!-- bloommd:id=abc -->\n",
    });
    expect(index.findings).toHaveLength(1);
    expect(index.findings[0]!.message).toContain("3× in 3 Dateien");
    expect(index.findings[0]!.detail).toBe("a.md:1, b/b.md:3, c.md:1");
  });

  test("distinct ids and headings without id are quiet", () => {
    expect(indexOf({ "a.md": "# A <!-- bloommd:id=a1 -->\n\n## B\n", "b.md": "# B <!-- bloommd:id=b1 -->\n" }).findings).toEqual([]);
  });

  test("an id in a code fence is an example, not an id", () => {
    const index = indexOf({ "a.md": "# A <!-- bloommd:id=abc -->\n\n```md\n## X <!-- bloommd:id=abc -->\n```\n" });
    expect(index.findings).toEqual([]);
  });

  test("is not the duplicate-name finding of the lint", () => {
    const entries = { "a/same.md": "# A\n", "b/same.md": "# B\n" };
    expect(lintWorkspace(filesOf(entries)).findings.map((finding) => finding.code)).toEqual(["duplicate-name"]);
    expect(indexOf(entries).findings).toEqual([]);
  });
});

describe("lintWorkspace is unchanged", () => {
  test("no new codes show up in the lint result", () => {
    const entries = {
      "t.md": "---\nstatus: veraltet\n---\n# T <!-- bloommd:id=abc -->\n\n## U <!-- bloommd:id=abc -->\n",
      "s.md": "# S\n\n[[t#Fehlt]]\n",
    };
    expect(indexOf(entries).findings.map((finding) => finding.code).sort()).toEqual(["duplicate-node-id", "stale-anchor", "stale-document"]);
    expect(lintWorkspace(filesOf(entries)).findings).toEqual([]);
  });
});

describe("result", () => {
  test("findings are sorted by severity, path and line; the summary counts them", () => {
    const index = indexOf({
      "b.md": "# B\n\n[[nowhere]]\n",
      "a.md": "# A\n\n[[b#Fehlt]]\n\n[[nowhere]]\n",
    });
    expect(index.findings.map((finding) => [finding.code, finding.path, finding.line])).toEqual([
      ["broken-link", "a.md", 5],
      ["broken-link", "b.md", 3],
      ["stale-anchor", "a.md", 3],
    ]);
    expect(index.summary).toEqual({ documents: 2, headings: 2, links: 1, errors: 2, warnings: 1, infos: 0 });
    expect(index.today).toBe(TODAY);
  });

  test("an empty workspace gives an empty index", () => {
    expect(indexOf({})).toMatchObject({ documents: [], headings: [], findings: [], summary: { documents: 0, headings: 0, links: 0 } });
  });
});
