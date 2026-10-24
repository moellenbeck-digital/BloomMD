import { describe, expect, test } from "bun:test";
import { isChangedFileActive } from "../shared/file-change";

describe("isChangedFileActive", () => {
  test("matches the current file when the watcher sends a basename", () => {
    expect(isChangedFileActive("/tmp/bloommd/handoff.md", "handoff.md")).toBe(true);
  });

  test("matches nested relative paths and Windows separators", () => {
    expect(isChangedFileActive("Project\\Notes\\plan.md", "Project/Notes/plan.md")).toBe(true);
    expect(isChangedFileActive("/tmp/bloommd/Project/Notes/plan.md", "Project\\Notes\\plan.md")).toBe(true);
  });

  test("does not match a different file with the same suffix text", () => {
    expect(isChangedFileActive("/tmp/bloommd/my-handoff.md", "handoff.md")).toBe(false);
    expect(isChangedFileActive(null, "handoff.md")).toBe(false);
  });
});
