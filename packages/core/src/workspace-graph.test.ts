import { describe, expect, test } from "bun:test";
import {
  buildWorkspaceGraph,
  extractLinks,
  fileNodeId,
  filterWorkspaceGraph,
  folderNodeId,
  graphCounts,
  GRAPH_PRESETS,
  matchPreset,
  type ReferenceEdge,
} from "./workspace-graph";

function graphOf(files: Record<string, string>) {
  return buildWorkspaceGraph(Object.entries(files).map(([path, markdown]) => ({ path, markdown })));
}

function referencesFrom(files: Record<string, string>, path: string): ReferenceEdge[] {
  return graphOf(files).edges.filter(
    (edge): edge is ReferenceEdge => edge.kind === "reference" && edge.source === fileNodeId(path),
  );
}

describe("extractLinks", () => {
  test("finds wiki links, anchors and aliases", () => {
    const links = extractLinks("See [[Alpha]] and [[Beta#Section]] and [[Gamma|call it that]].");
    expect(links.map((link) => link.target)).toEqual(["Alpha", "Beta", "Gamma"]);
    expect(links[1]!.anchor).toBe("Section");
    // The alias is display text; only the target decides where the edge points.
    expect(links[2]!.target).toBe("Gamma");
  });

  test("finds Markdown links but ignores external ones", () => {
    const links = extractLinks("[a](./alpha.md) [b](https://example.com) [c](mailto:x@y.z) [d](notes/beta.md)");
    expect(links.map((link) => link.target)).toEqual(["./alpha.md", "notes/beta.md"]);
  });

  test("ignores links inside fenced code blocks", () => {
    // Documentation about wiki links is the obvious case: the example must not become an edge.
    const markdown = ["Real [[Alpha]]", "```", "Example [[NotALink]]", "```", "Also real [[Beta]]"].join("\n");
    expect(extractLinks(markdown).map((link) => link.target)).toEqual(["Alpha", "Beta"]);
  });

  test("ignores links inside inline code", () => {
    expect(extractLinks("Use `[[Syntax]]` to link, like [[Real]].").map((link) => link.target)).toEqual(["Real"]);
  });

  test("closes a fence only with one at least as long", () => {
    const markdown = ["````", "```", "[[Hidden]]", "````", "[[Visible]]"].join("\n");
    expect(extractLinks(markdown).map((link) => link.target)).toEqual(["Visible"]);
  });

  test("reports the line the link was written on", () => {
    const markdown = ["one", "two [[Alpha]]", "three"].join("\n");
    expect(extractLinks(markdown)[0]!.line).toBe(2);
  });

  test("ignores a bare anchor, which stays inside the document", () => {
    expect(extractLinks("[jump](#section)")).toEqual([]);
  });
});

describe("buildWorkspaceGraph structure", () => {
  test("derives folders from file paths", () => {
    const graph = graphOf({ "book/part-1/chapter.md": "# C", "readme.md": "# R" });
    const folders = graph.nodes.filter((node) => node.kind === "folder").map((node) => node.path);
    expect(folders.sort()).toEqual(["book", "book/part-1"]);
  });

  test("connects a folder to what it contains", () => {
    const graph = graphOf({ "notes/alpha.md": "# A" });
    const structure = graph.edges.filter((edge) => edge.kind === "structure");
    expect(structure).toHaveLength(1);
    expect(structure[0]!.source).toBe(folderNodeId("notes"));
    expect(structure[0]!.target).toBe(fileNodeId("notes/alpha.md"));
  });

  test("nests folders through their parents", () => {
    const graph = graphOf({ "a/b/c.md": "# C" });
    const nested = graph.nodes.find((node) => node.path === "a/b");
    expect(nested?.parentId).toBe(folderNodeId("a"));
    expect(graph.nodes.find((node) => node.path === "a")?.parentId).toBeNull();
  });

  test("strips the extension for the file label", () => {
    const graph = graphOf({ "notes/My Note.md": "# X" });
    expect(graph.nodes.find((node) => node.kind === "file")?.label).toBe("My Note");
  });

  test("a root-level file has no parent and no structure edge", () => {
    const graph = graphOf({ "alpha.md": "# A" });
    expect(graph.nodes[0]!.parentId).toBeNull();
    expect(graph.edges.filter((edge) => edge.kind === "structure")).toHaveLength(0);
  });
});

describe("buildWorkspaceGraph references", () => {
  test("resolves a bare wiki link by filename anywhere in the workspace", () => {
    const references = referencesFrom({ "a/one.md": "[[two]]", "b/two.md": "# Two" }, "a/one.md");
    expect(references[0]).toMatchObject({ resolution: "resolved", target: fileNodeId("b/two.md") });
  });

  test("resolves a relative Markdown link", () => {
    const references = referencesFrom({ "a/one.md": "[x](./two.md)", "a/two.md": "# Two" }, "a/one.md");
    expect(references[0]).toMatchObject({ resolution: "resolved", target: fileNodeId("a/two.md") });
  });

  test("resolves a parent-relative link", () => {
    const references = referencesFrom({ "a/b/one.md": "[x](../two.md)", "a/two.md": "# Two" }, "a/b/one.md");
    expect(references[0]!.target).toBe(fileNodeId("a/two.md"));
  });

  test("an explicit relative path wins over a same-named file elsewhere", () => {
    const files = { "a/one.md": "[x](./two.md)", "a/two.md": "# Near", "b/two.md": "# Far" };
    const references = referencesFrom(files, "a/one.md");
    expect(references[0]).toMatchObject({ resolution: "resolved", target: fileNodeId("a/two.md") });
  });

  test("reports a duplicate page name as ambiguous instead of guessing", () => {
    const references = referencesFrom({ "one.md": "[[two]]", "a/two.md": "# A", "b/two.md": "# B" }, "one.md");
    expect(references[0]).toMatchObject({ resolution: "ambiguous", target: null });
    expect(references[0]!.candidates).toEqual(["a/two.md", "b/two.md"]);
  });

  test("reports a missing target as broken and keeps the raw text", () => {
    const references = referencesFrom({ "one.md": "[[Nowhere]]" }, "one.md");
    expect(references[0]).toMatchObject({ resolution: "broken", target: null, raw: "[[Nowhere]]" });
  });

  test("a link climbing above the workspace root is broken, not resolved elsewhere", () => {
    // Without this the path falls through to name matching and quietly points at an unrelated file
    // that happens to share the name.
    const references = referencesFrom({ "one.md": "[x](../../secrets.md)", "secrets.md": "# S" }, "one.md");
    expect(references[0]!.resolution).toBe("broken");
  });

  test("a written path that does not exist stays broken instead of matching by name", () => {
    const references = referencesFrom({ "one.md": "[x](./nested/two.md)", "elsewhere/two.md": "# Two" }, "one.md");
    expect(references[0]!.resolution).toBe("broken");
  });

  test("an image or attachment is not treated as a broken page link", () => {
    // The file exists; it simply is not a page. Calling it broken sends someone hunting for a
    // problem that does not exist.
    expect(referencesFrom({ "one.md": "![d](assets/diagram.svg) [p](doc.pdf)" }, "one.md")).toHaveLength(0);
  });

  test("a target without an extension is still a page link", () => {
    const references = referencesFrom({ "one.md": "[x](./notes/two)", "notes/two.md": "# Two" }, "one.md");
    expect(references[0]!.resolution).toBe("resolved");
  });

  test("a bare name next to a same-named file in the same folder resolves to the neighbour", () => {
    const references = referencesFrom({ "c/dup.md": "[[dup]]", "b/dup.md": "# B" }, "c/dup.md");
    expect(references[0]).toMatchObject({ resolution: "resolved", target: fileNodeId("c/dup.md") });
  });

  test("keeps the heading anchor on the edge", () => {
    const references = referencesFrom({ "one.md": "[[two#Details]]", "two.md": "# Two" }, "one.md");
    expect(references[0]!.anchor).toBe("Details");
  });

  test("collapses repeated links to the same target on one line into one edge", () => {
    const references = referencesFrom({ "one.md": "[[two]] and [[two]] again", "two.md": "# Two" }, "one.md");
    expect(references).toHaveLength(1);
  });

  test("keeps same-target references on different lines for topic projection", () => {
    const references = referencesFrom({ "one.md": "[[two]]\n\n## Section\n\n[[two]]", "two.md": "# Two" }, "one.md");
    expect(references.map((reference) => reference.line)).toEqual([1, 5]);
  });

  test("matches a page name case-insensitively", () => {
    const references = referencesFrom({ "one.md": "[[TWO]]", "two.md": "# Two" }, "one.md");
    expect(references[0]!.resolution).toBe("resolved");
  });
});

describe("backlinks", () => {
  test("derives who links to a file", () => {
    const graph = graphOf({ "one.md": "[[three]]", "two.md": "[[three]]", "three.md": "# Three" });
    expect(graph.backlinks.get(fileNodeId("three.md"))?.sort()).toEqual([fileNodeId("one.md"), fileNodeId("two.md")]);
  });

  test("a self-link produces no backlink", () => {
    const graph = graphOf({ "one.md": "[[one]]" });
    expect(graph.backlinks.get(fileNodeId("one.md"))).toBeUndefined();
  });

  test("a broken link produces no backlink", () => {
    const graph = graphOf({ "one.md": "[[missing]]" });
    expect(graph.backlinks.size).toBe(0);
  });
});

describe("graphCounts", () => {
  test("summarises nodes and edge kinds for the legend", () => {
    const counts = graphCounts(
      graphOf({
        "a/one.md": "[[two]] [[nowhere]] [[dup]]",
        "a/two.md": "# Two",
        "b/dup.md": "# D",
        "c/dup.md": "# D",
      }),
    );
    expect(counts).toMatchObject({ folders: 3, files: 4, resolvedReferences: 1, brokenReferences: 1, ambiguousReferences: 1 });
  });
});

describe("filterWorkspaceGraph", () => {
  const files = {
    "a/one.md": "[[two]] [[nowhere]]",
    "a/two.md": "# Two",
    "b/three.md": "[[two]]",
  };

  test("the structure preset shows folders and hides references", () => {
    const graph = graphOf(files);
    const view = filterWorkspaceGraph(graph, GRAPH_PRESETS.structure);
    expect(view.nodes.filter((node) => node.kind === "folder")).toHaveLength(2);
    expect(view.edges.every((edge) => edge.kind === "structure")).toBe(true);
  });

  test("the reference preset drops folder nodes but keeps every file", () => {
    const view = filterWorkspaceGraph(graphOf(files), GRAPH_PRESETS.reference);
    expect(view.nodes.every((node) => node.kind === "file")).toBe(true);
    expect(view.nodes).toHaveLength(3);
    expect(view.edges.some((edge) => edge.kind === "structure")).toBe(false);
  });

  test("the knowledge preset combines both", () => {
    const view = filterWorkspaceGraph(graphOf(files), GRAPH_PRESETS.knowledge);
    expect(view.edges.some((edge) => edge.kind === "structure")).toBe(true);
    expect(view.edges.some((edge) => edge.kind === "reference")).toBe(true);
  });

  test("broken links appear only with their own layer", () => {
    const graph = graphOf(files);
    const withBroken = filterWorkspaceGraph(graph, { ...GRAPH_PRESETS.knowledge, brokenLinks: true });
    const withoutBroken = filterWorkspaceGraph(graph, { ...GRAPH_PRESETS.knowledge, brokenLinks: false });
    const broken = (view: { edges: Array<{ kind: string }> }) =>
      view.edges.filter((edge) => edge.kind === "reference" && (edge as { resolution?: string }).resolution === "broken");
    expect(broken(withBroken)).toHaveLength(1);
    expect(broken(withoutBroken)).toHaveLength(0);
  });

  test("backlinks alone show only what points at the selection", () => {
    const graph = graphOf(files);
    const layers = { folders: false, references: false, backlinks: true, brokenLinks: false };
    const view = filterWorkspaceGraph(graph, layers, fileNodeId("a/two.md"));
    expect(view.edges).toHaveLength(2);
    expect(view.edges.every((edge) => edge.kind === "reference" && edge.target === fileNodeId("a/two.md"))).toBe(true);
  });

  test("the backlink layer without a selection shows nothing on its own", () => {
    // Every incoming link in a workspace at once is the fastest way to make this unreadable.
    const layers = { folders: false, references: false, backlinks: true, brokenLinks: false };
    expect(filterWorkspaceGraph(graphOf(files), layers, null).edges).toHaveLength(0);
  });

  test("hiding folders never hides a file", () => {
    const graph = graphOf({ "deep/nested/one.md": "# One" });
    const view = filterWorkspaceGraph(graph, { ...GRAPH_PRESETS.reference });
    expect(view.nodes).toHaveLength(1);
    expect(view.nodes[0]!.kind).toBe("file");
  });

  test("matchPreset names an exact combination and reports a custom one", () => {
    expect(matchPreset(GRAPH_PRESETS.knowledge)).toBe("knowledge");
    expect(matchPreset(GRAPH_PRESETS.structure)).toBe("structure");
    expect(matchPreset({ folders: true, references: false, backlinks: true, brokenLinks: false })).toBeNull();
  });
});

describe("path safety", () => {
  test("a traversing input path is rejected before it reaches the graph", () => {
    expect(() => graphOf({ "../escape.md": "# E" })).toThrow();
  });
});
