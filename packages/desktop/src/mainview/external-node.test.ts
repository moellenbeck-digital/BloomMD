import { describe, expect, test } from "bun:test";
import { collapsedAncestors } from "./external-node";

const nodes = new Map([
  ["root", { parentId: null }],
  ["a", { parentId: "root" }],
  ["b", { parentId: "a" }],
  ["c", { parentId: "b" }],
]) as unknown as Parameters<typeof collapsedAncestors>[0]["nodes"];

describe("collapsedAncestors", () => {
  test("lists folded branches above the node, outermost first", () => {
    expect(collapsedAncestors({ nodes }, new Set(["b", "root"]), "c")).toEqual(["root", "b"]);
  });

  test("nothing to unfold for visible or unknown nodes", () => {
    expect(collapsedAncestors({ nodes }, new Set(["c"]), "c")).toEqual([]);
    expect(collapsedAncestors({ nodes }, new Set(["root"]), "missing")).toEqual([]);
  });
});
