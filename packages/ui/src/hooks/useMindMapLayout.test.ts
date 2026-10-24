import { describe, expect, test } from "bun:test";
import { buildWorkspaceMindMap, headingNodeId } from "@bloommd/core/browser";
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
