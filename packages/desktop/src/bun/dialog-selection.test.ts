import { describe, expect, test } from "bun:test";
import { firstSelectedPath } from "./dialog-selection";

describe("firstSelectedPath", () => {
  test("returns the first non-empty selected path", () => {
    expect(firstSelectedPath(["/Users/test/Documents"])).toBe("/Users/test/Documents");
  });

  test("treats canceled or malformed dialog results as no selection", () => {
    expect(firstSelectedPath(undefined)).toBeNull();
    expect(firstSelectedPath(null)).toBeNull();
    expect(firstSelectedPath({ path: "/tmp" })).toBeNull();
    expect(firstSelectedPath([])).toBeNull();
    expect(firstSelectedPath([""])).toBeNull();
    expect(firstSelectedPath(["   "])).toBeNull();
    expect(firstSelectedPath([123])).toBeNull();
  });
});
