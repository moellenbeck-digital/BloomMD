import { describe, expect, test } from "bun:test";
import { branchOf, headingTree } from "./markdown-tree";
import { centerline, outline } from "./trieb";

const file = ["# Strategie", "## Ziele", "- Offenes Format", "", "## Initiativen", "### Sync"].join("\n");

describe("headingTree", () => {
  test("turns headings into nodes and bullets into node notes", () => {
    const nodes = headingTree(file);
    expect(nodes.map((node) => node.title)).toEqual(["Strategie", "Ziele", "Initiativen", "Sync"]);
    expect(nodes[1]!.notes).toEqual(["Offenes Format"]);
    expect(nodes[3]!.parent).toBe(4);
  });

  test("lights the node and its ancestors", () => {
    expect([...branchOf(headingTree(file), 5)].sort()).toEqual([0, 4, 5]);
    expect(branchOf(headingTree(file), null).size).toBe(0);
  });
});

describe("trieb geometry", () => {
  const shape = { from: [0, 0], at: [100, 40], length: 80, w: [12, 6, 1] } as const;

  test("starts at the origin and ends under the end of the word", () => {
    expect(centerline(shape).startsWith("M0 0 C")).toBe(true);
    expect(centerline(shape).endsWith("L180 40")).toBe(true);
  });

  test("tapers: wide at the origin, thin at the tip", () => {
    const points = outline(shape).slice(1, -2).split(" L").map((pair) => pair.split(" ").map(Number));
    const half = points.length / 2;
    const width = (i: number) => {
      const a = points[i]!;
      const b = points[points.length - 1 - i]!;
      return Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!);
    };
    expect(width(0)).toBeCloseTo(12, 0);
    expect(width(half - 1)).toBeCloseTo(1, 0);
  });
});
