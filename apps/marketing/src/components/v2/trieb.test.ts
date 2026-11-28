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
    const path = outline(shape);
    const numbers = path.match(/-?\d+(\.\d+)?/g)!.map(Number);
    const first = numbers.slice(0, 2);
    const last = numbers.slice(-2);
    expect(Math.hypot(first[0]! - last[0]!, first[1]! - last[1]!)).toBeCloseTo(12, 0);
    // The two points at the end of the word: x = 180, 0.5 above and below the baseline.
    expect(path).toContain("L180 40.5 L180 39.5");
  });

  test("is a smooth Bezier outline, not a sampled polygon", () => {
    expect(outline(shape).match(/C/g)).toHaveLength(4);
    expect(outline(shape).length).toBeLessThan(260);
  });
});
