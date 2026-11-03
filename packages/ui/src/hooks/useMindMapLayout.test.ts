import { describe, expect, test } from "bun:test";
import { buildWorkspaceMindMap, headingNodeId, parseFile } from "@bloommd/core/browser";
import { layoutMindMap } from "./useMindMapLayout";

describe("layoutMindMap workspace references", () => {
  test("renders derived workspace references as relation edges", () => {
    const doc = buildWorkspaceMindMap([
      { path: "index.md", markdown: "# Index\n\n[[Chapter#Scene]]\n" },
      { path: "Chapter.md", markdown: "# Chapter\n\n## Scene\n" },
    ]);

    const hierarchy = layoutMindMap(doc, "hierarchy");
    const all = layoutMindMap(doc, "all");

    expect(hierarchy.edges.every((edge) => edge.data?.relation === "hierarchy")).toBe(true);
    expect(all.edges).toContainEqual(expect.objectContaining({
      data: { relation: "link" },
      source: headingNodeId("index.md", 0, "Index"),
      target: headingNodeId("Chapter.md", 1, "Scene"),
    }));
    expect(all.nodes.find((node) => node.id === headingNodeId("index.md", 0, "Index"))?.data.linkCount).toBe(1);
  });
});

describe("layoutMindMap PDF source links", () => {
  test("count as a resource of the node and draw no edge to a PDF \"map\"", () => {
    const doc = parseFile("review.md", "# Review\n\n## Quelle\n\n[[papers/smith.pdf#page=3]]\n\n> Zitat\n");
    const source = [...doc.nodes.values()].find((node) => node.title === "Quelle")!;
    const all = layoutMindMap(doc, "all");
    expect(all.nodes.find((node) => node.id === source.id)?.data.linkCount).toBe(1);
    expect(all.edges.every((edge) => edge.data?.relation === "hierarchy")).toBe(true);
  });
});
