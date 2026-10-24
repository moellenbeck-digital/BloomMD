import { describe, expect, test } from "bun:test";
import { WorkspaceDocumentCache } from "./workspace-document";
import {
  buildWorkspaceGraph,
  buildWorkspaceMindMap,
  fileNodeId,
  headingNodeId,
  isWorkspaceMindMap,
  WORKSPACE_ROOT_NODE_ID,
  parseFile,
} from "./index";

describe("buildWorkspaceMindMap", () => {
  test("renders folders, files and each file heading tree below one workspace root", () => {
    const doc = buildWorkspaceMindMap(
      [
        { path: "README.md", markdown: "# Overview\n\nIntro\n\n## Details\n\nSee [[Book/Chapter#Scene]].\n" },
        { path: "Book/Chapter.md", markdown: "# Chapter\n\n## Scene\n\nText\n" },
      ],
      { title: "My Vault", source: "/vault" },
    );

    expect(isWorkspaceMindMap(doc)).toBe(true);
    expect(doc.rootId).toBe(WORKSPACE_ROOT_NODE_ID);
    expect(doc.nodes.get(WORKSPACE_ROOT_NODE_ID)).toMatchObject({
      title: "My Vault",
      metadata: { kind: "workspace", file: "/vault" },
    });

    const root = doc.nodes.get(WORKSPACE_ROOT_NODE_ID)!;
    expect(root.children).toContain(fileNodeId("README.md"));
    expect(root.children).toContain("folder:Book");

    const folder = doc.nodes.get("folder:Book")!;
    expect(folder).toMatchObject({ parentId: WORKSPACE_ROOT_NODE_ID, metadata: { kind: "folder", file: "Book" } });
    expect(folder.children).toContain(fileNodeId("Book/Chapter.md"));

    const readme = doc.nodes.get(fileNodeId("README.md"))!;
    expect(readme).toMatchObject({ title: "README", metadata: { kind: "file", file: "README.md" } });
    expect(readme.children).toEqual([headingNodeId("README.md", 0, "Overview")]);

    const overview = doc.nodes.get(headingNodeId("README.md", 0, "Overview"))!;
    expect(overview).toMatchObject({ title: "Overview", parentId: fileNodeId("README.md") });
    expect(overview.children).toEqual([headingNodeId("README.md", 1, "Details")]);
  });

  test("turns wiki links into derived references and resolves heading anchors", () => {
    const doc = buildWorkspaceMindMap([
      { path: "index.md", markdown: "# Index\n\n[[Chapter#Scene]]\n" },
      { path: "Chapter.md", markdown: "# Chapter\n\n## Scene\n" },
    ]);

    expect(doc.references).toEqual([
      expect.objectContaining({
        sourceId: headingNodeId("index.md", 0, "Index"),
        targetId: headingNodeId("Chapter.md", 1, "Scene"),
        raw: "[[Chapter#Scene]]",
        sourceFile: "index.md",
        sourceFileId: fileNodeId("index.md"),
        targetFile: "Chapter.md",
        targetFileId: fileNodeId("Chapter.md"),
        targetAnchor: "Scene",
        line: 3,
      }),
    ]);
  });

  test("projects bare wiki links from source sections to target topics", () => {
    const doc = buildWorkspaceMindMap([
      {
        path: "Konzepte/Speicherung.md",
        markdown: "# Speicherung\n\nVerweist auf [[Graphentheorie]].\n",
      },
      {
        path: "Konzepte/Graphentheorie.md",
        markdown: "# Graphentheorie\n\nHängt mit [[Speicherung]] zusammen.\n\n## Verweise\n\nZurück zu [[Speicherung]].\n",
      },
    ]);

    expect(doc.references).toContainEqual(expect.objectContaining({
      sourceId: fileNodeId("Konzepte/Graphentheorie.md"),
      targetId: fileNodeId("Konzepte/Speicherung.md"),
      raw: "[[Speicherung]]",
      sourceFile: "Konzepte/Graphentheorie.md",
      targetFile: "Konzepte/Speicherung.md",
      line: 3,
    }));
    expect(doc.references).toContainEqual(expect.objectContaining({
      sourceId: headingNodeId("Konzepte/Graphentheorie.md", 1, "Verweise"),
      targetId: fileNodeId("Konzepte/Speicherung.md"),
      raw: "[[Speicherung]]",
      sourceFile: "Konzepte/Graphentheorie.md",
      targetFile: "Konzepte/Speicherung.md",
      line: 7,
    }));
    expect(doc.references).toContainEqual(expect.objectContaining({
      sourceId: fileNodeId("Konzepte/Speicherung.md"),
      targetId: fileNodeId("Konzepte/Graphentheorie.md"),
      raw: "[[Graphentheorie]]",
      sourceFile: "Konzepte/Speicherung.md",
      targetFile: "Konzepte/Graphentheorie.md",
      line: 3,
    }));
  });

  test("projects chapter references to chapter topics", () => {
    const doc = buildWorkspaceMindMap([
      { path: "README.md", markdown: "# Start\n\nWeiter mit [[Kapitel 1]].\n" },
      { path: "Buch/Teil-1/Kapitel 1.md", markdown: "# Kapitel 1\n\nText\n" },
    ]);

    expect(doc.references).toEqual([
      expect.objectContaining({
        sourceId: headingNodeId("README.md", 0, "Start"),
        targetId: fileNodeId("Buch/Teil-1/Kapitel 1.md"),
        raw: "[[Kapitel 1]]",
      }),
    ]);
  });

  test("keeps ambiguous and broken links unresolved instead of guessing a topic", () => {
    const graph = buildWorkspaceGraph([
      { path: "A.md", markdown: "# A\n\n[[Notiz]]\n\n[[Gibt Es Nicht]]\n" },
      { path: "Konzepte/Notiz.md", markdown: "# Notiz\n" },
      { path: "Personen/Notiz.md", markdown: "# Notiz\n" },
    ]);

    const referenceEdges = graph.edges.filter((edge) => edge.kind === "reference");
    expect(referenceEdges).toContainEqual(expect.objectContaining({
      raw: "[[Notiz]]",
      resolution: "ambiguous",
      target: null,
      candidates: ["Konzepte/Notiz.md", "Personen/Notiz.md"],
    }));
    expect(referenceEdges).toContainEqual(expect.objectContaining({
      raw: "[[Gibt Es Nicht]]",
      resolution: "broken",
      target: null,
    }));

    const doc = buildWorkspaceMindMap([
      { path: "A.md", markdown: "# A\n\n[[Notiz]]\n\n[[Gibt Es Nicht]]\n" },
      { path: "Konzepte/Notiz.md", markdown: "# Notiz\n" },
      { path: "Personen/Notiz.md", markdown: "# Notiz\n" },
    ]);

    expect(doc.references).toEqual([]);
  });

  test("uses deterministic node ids for files and heading order", () => {
    const input = [
      { path: "b.md", markdown: "# B\n" },
      { path: "a.md", markdown: "# A\n\n## Child\n" },
    ];

    const first = buildWorkspaceMindMap(input);
    const second = buildWorkspaceMindMap([...input].reverse());

    expect([...first.nodes.keys()].sort()).toEqual([...second.nodes.keys()].sort());
  });
});

test("a file and its identical sole H1 appear once, with children and root content preserved", () => {
  const markdown = "---\ntitle: Digitaler Avatar\n---\n# Digitaler Avatar\n\nIntroduction\n\n## Rolle\n\n## Name\n\n## Icon\n";
  const input = [{ path: "digitaler-avatar.md", markdown }];
  const parsed = parseFile(input[0]!.path, markdown);
  const before = JSON.stringify([...parsed.nodes]);
  const cache = new WorkspaceDocumentCache();
  const options = { cache, parsedDocuments: new Map([[input[0]!.path, parsed]]) };
  for (let pass = 0; pass < 2; pass += 1) {
    const doc = buildWorkspaceMindMap(input, options);
    const file = doc.nodes.get(fileNodeId(input[0]!.path))!;
    expect([...doc.nodes.values()].filter((node) => node.title === "Digitaler Avatar")).toHaveLength(1);
    expect(file.metadata).toEqual({ kind: "file", file: "digitaler-avatar.md" });
    expect(file.content).toBe("Introduction");
    expect(file.children.map((id) => doc.nodes.get(id)!.title)).toEqual(["Rolle", "Name", "Icon"]);
    for (const id of file.children) expect(doc.nodes.get(id)).toMatchObject({ parentId: file.id, level: file.level + 1 });
    expect(doc.nodes.size).toBe(5);
  }
  expect(JSON.stringify([...parsed.nodes])).toBe(before);
});

test("folded root links and local portal targets resolve to the surviving file node", () => {
  const doc = buildWorkspaceMindMap([
    { path: "Avatar.md", markdown: '# Avatar <!-- bloommd:id=root -->\n\n[[Other#Other]]\n\n## Portal <!-- bloommd:meta={"kind":"portal","targetNodeId":"root"} -->\n' },
    { path: "Other.md", markdown: "# Other\n\n[[Avatar#Avatar]]\n\n[[Avatar]]\n" },
  ]);
  expect(doc.references).toContainEqual(expect.objectContaining({ sourceId: fileNodeId("Avatar.md"), targetId: fileNodeId("Other.md") }));
  expect(doc.references!.filter((ref) => ref.targetId === fileNodeId("Avatar.md"))).toHaveLength(2);
  expect(doc.nodes.get(headingNodeId("Avatar.md", 1, "Portal"))?.metadata?.targetNodeId).toBe(fileNodeId("Avatar.md"));
  for (const ref of doc.references!) {
    expect(doc.nodes.has(ref.sourceId)).toBe(true);
    expect(doc.nodes.has(ref.targetId)).toBe(true);
  }
});

test("distinct titles, multiple roots and semantic root metadata retain their heading nodes", () => {
  for (const markdown of [
    "# Different title\n",
    "# Avatar\n\n# Another root\n",
    '# Avatar <!-- bloommd:meta={"kind":"web","url":"https://example.com"} -->\n',
    "## Avatar\n",
  ]) {
    const doc = buildWorkspaceMindMap([{ path: "Avatar.md", markdown }]);
    expect(doc.nodes.has(headingNodeId("Avatar.md", 0, markdown.includes("Different") ? "Different title" : "Avatar"))).toBe(true);
  }
});
