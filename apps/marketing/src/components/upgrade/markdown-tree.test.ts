import { describe, expect, test } from "bun:test";
import { branchOf, headingTree } from "./markdown-tree";

const markdown = ["# Strategie", "## Ziele", "- Punkt", "## Initiativen", "### Kundenbindung"].join("\n");

describe("headingTree", () => {
  test("keeps headings only and links each to its parent", () => {
    expect(headingTree(markdown).map(({ line, title, parent }) => [line, title, parent])).toEqual([
      [0, "Strategie", null],
      [1, "Ziele", 0],
      [3, "Initiativen", 0],
      [4, "Kundenbindung", 3],
    ]);
  });

  test("branchOf returns the node and its ancestors", () => {
    expect([...branchOf(headingTree(markdown), 4)].sort()).toEqual([0, 3, 4]);
    expect(branchOf(headingTree(markdown), null).size).toBe(0);
  });
});
