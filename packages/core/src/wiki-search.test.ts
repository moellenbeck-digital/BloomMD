import { describe, expect, test } from "bun:test";
import type { WikiBundle, WikiPage } from "./wiki";
import { buildKnowledgeGraph, knowledgeGraphHealth, searchWikiBundle } from "./wiki-search";

function page(overrides: Partial<WikiPage> & { path: string; title: string }): WikiPage {
  return {
    frontmatter: {},
    content: "",
    raw: "",
    contentHash: "sha256:0",
    sources: [],
    type: null,
    description: null,
    status: "stable",
    rawStatus: null,
    generated: null,
    verified: [],
    staleAfter: null,
    usageWindow: null,
    trustTier: "unattributed",
    ...overrides,
  } as WikiPage;
}

function bundleOf(pages: WikiPage[]): WikiBundle {
  return { rootDir: "/tmp/bundle", pages, index: null, log: null };
}

const sample = bundleOf([
  page({
    path: "concepts/graph.md",
    title: "Graph Theory",
    type: "concept",
    description: "Nodes and edges",
    content: "Relates to [[storage]] and [[missing-page]].",
    frontmatter: { tags: ["math", "core"] },
    sources: [{ id: "s1", resource: "https://example.com/graph", contentHash: "sha256:a" }],
    trustTier: "verified",
  }),
  page({
    path: "concepts/storage.md",
    title: "Storage",
    type: "concept",
    content: "See [[graph]].",
    frontmatter: { tags: ["core"] },
    sources: [{ id: "s2", resource: "https://example.com/storage" }],
    trustTier: "generated",
  }),
  page({
    path: "notes/scratch.md",
    title: "Scratch",
    content: "No type, no sources.",
    status: "deprecated",
  }),
]);

describe("search", () => {
  test("matches on title and ranks it above a body match", () => {
    const hits = searchWikiBundle(sample, { text: "storage" });
    expect(hits[0]!.page.path).toBe("concepts/storage.md");
    expect(hits[0]!.matchedOn).toContain("title");
  });

  test("matches on path", () => {
    const hits = searchWikiBundle(sample, { text: "notes/" });
    expect(hits.map((hit) => hit.page.path)).toEqual(["notes/scratch.md"]);
  });

  test("matches on description", () => {
    const hits = searchWikiBundle(sample, { text: "nodes and edges" });
    expect(hits[0]!.matchedOn).toContain("description");
  });

  test("filters by tag", () => {
    const hits = searchWikiBundle(sample, { tags: ["math"] });
    expect(hits.map((hit) => hit.page.path)).toEqual(["concepts/graph.md"]);
  });

  test("filters by OKF type", () => {
    const hits = searchWikiBundle(sample, { types: ["concept"] });
    expect(hits).toHaveLength(2);
  });

  test("filters by status", () => {
    const hits = searchWikiBundle(sample, { statuses: ["deprecated"] });
    expect(hits.map((hit) => hit.page.path)).toEqual(["notes/scratch.md"]);
  });

  test("filters by trust tier", () => {
    const hits = searchWikiBundle(sample, { trustTiers: ["verified"] });
    expect(hits.map((hit) => hit.page.path)).toEqual(["concepts/graph.md"]);
  });

  test("finds pages citing a source id or its resource", () => {
    expect(searchWikiBundle(sample, { sources: ["s1"] })[0]!.page.path).toBe("concepts/graph.md");
    expect(searchWikiBundle(sample, { sources: ["https://example.com/storage"] })[0]!.page.path).toBe("concepts/storage.md");
  });

  test("onlyProblems surfaces pages without provenance", () => {
    const hits = searchWikiBundle(sample, { onlyProblems: true });
    expect(hits.map((hit) => hit.page.path)).toContain("notes/scratch.md");
  });

  test("an empty query returns everything", () => {
    expect(searchWikiBundle(sample, {})).toHaveLength(3);
  });

  test("filters combine rather than widen", () => {
    expect(searchWikiBundle(sample, { types: ["concept"], tags: ["math"] })).toHaveLength(1);
    expect(searchWikiBundle(sample, { types: ["concept"], statuses: ["deprecated"] })).toHaveLength(0);
  });

  test("equal results keep a stable order", () => {
    const first = searchWikiBundle(sample, { types: ["concept"] }).map((hit) => hit.page.path);
    const second = searchWikiBundle(sample, { types: ["concept"] }).map((hit) => hit.page.path);
    expect(first).toEqual(second);
  });

  test("a query matching nothing returns nothing rather than everything", () => {
    expect(searchWikiBundle(sample, { text: "zzzz-not-present" })).toHaveLength(0);
  });
});

describe("knowledge graph", () => {
  const graph = buildKnowledgeGraph(sample);

  test("a page with an OKF type is a concept, one without is a page", () => {
    expect(graph.nodes.find((node) => node.path === "concepts/graph.md")?.kind).toBe("concept");
    expect(graph.nodes.find((node) => node.path === "notes/scratch.md")?.kind).toBe("page");
  });

  test("wiki links between pages become edges", () => {
    const link = graph.edges.find((edge) => edge.kind === "link" && edge.label === "storage");
    expect(link?.target).toBe("wiki:concepts/storage.md");
    expect(link?.broken).toBe(false);
  });

  test("a link to a page that does not exist stays visible as broken", () => {
    // A wiki whose dead references are invisible looks healthier than it is.
    const broken = graph.edges.find((edge) => edge.kind === "link" && edge.label === "missing-page");
    expect(broken).toBeDefined();
    expect(broken?.broken).toBe(true);
    expect(broken?.target).toBeNull();
  });

  test("tags become their own edges", () => {
    const tagEdges = graph.edges.filter((edge) => edge.kind === "tag");
    expect(tagEdges.map((edge) => edge.target)).toContain("tag:core");
  });

  test("cited sources become edges", () => {
    const sourceEdges = graph.edges.filter((edge) => edge.kind === "source");
    expect(sourceEdges.map((edge) => edge.target).sort()).toEqual(["source:s1", "source:s2"]);
  });

  test("a page without sources is marked as missing provenance", () => {
    expect(graph.nodes.find((node) => node.path === "notes/scratch.md")?.missingProvenance).toBe(true);
    expect(graph.nodes.find((node) => node.path === "concepts/graph.md")?.missingProvenance).toBe(false);
  });

  test("a self-link produces no edge", () => {
    const selfish = bundleOf([page({ path: "a.md", title: "A", content: "[[a]]" })]);
    expect(buildKnowledgeGraph(selfish).edges.filter((edge) => edge.kind === "link")).toHaveLength(0);
  });

  test("an ambiguous name stays unresolved rather than guessing", () => {
    const ambiguous = bundleOf([
      page({ path: "one.md", title: "One", content: "[[dup]]" }),
      page({ path: "a/dup.md", title: "Dup A" }),
      page({ path: "b/dup.md", title: "Dup B" }),
    ]);
    const link = buildKnowledgeGraph(ambiguous).edges.find((edge) => edge.kind === "link");
    expect(link?.broken).toBe(true);
  });

  test("an image is not counted as a broken page link", () => {
    const withImage = bundleOf([page({ path: "one.md", title: "One", content: "![d](assets/x.png)" })]);
    expect(buildKnowledgeGraph(withImage).edges.filter((edge) => edge.kind === "link")).toHaveLength(0);
  });

  test("links inside code blocks are not edges", () => {
    const withCode = bundleOf([
      page({ path: "one.md", title: "One", content: "```\n[[storage]]\n```\n" }),
      page({ path: "storage.md", title: "Storage" }),
    ]);
    expect(buildKnowledgeGraph(withCode).edges.filter((edge) => edge.kind === "link")).toHaveLength(0);
  });
});

describe("graph health", () => {
  test("summarises what needs attention", () => {
    expect(knowledgeGraphHealth(buildKnowledgeGraph(sample))).toEqual({
      pages: 3,
      concepts: 2,
      brokenLinks: 1,
      pagesWithoutProvenance: 1,
      unattributedPages: 1,
      deprecatedPages: 1,
    });
  });

  test("an empty bundle reports zeroes rather than failing", () => {
    expect(knowledgeGraphHealth(buildKnowledgeGraph(bundleOf([])))).toMatchObject({ pages: 0, brokenLinks: 0 });
  });
});
