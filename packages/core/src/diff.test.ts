import { describe, expect, test } from "bun:test";
import { collapseUnchanged, diffLines, diffStats } from "./diff";

const kinds = (before: string, after: string) => diffLines(before, after).map((line) => line.kind);
const text = (before: string, after: string, kind: string) =>
  diffLines(before, after).filter((line) => line.kind === kind).map((line) => line.text);

describe("diffLines", () => {
  test("reports identical text as entirely unchanged", () => {
    expect(kinds("a\nb\nc", "a\nb\nc")).toEqual(["equal", "equal", "equal"]);
  });

  test("keeps the surrounding lines when one line changes", () => {
    // The point of a conflict dialog is showing what differs, so the common lines must survive.
    expect(kinds("a\nb\nc", "a\nB\nc")).toEqual(["equal", "removed", "added", "equal"]);
    expect(text("a\nb\nc", "a\nB\nc", "removed")).toEqual(["b"]);
    expect(text("a\nb\nc", "a\nB\nc", "added")).toEqual(["B"]);
  });

  test("detects a pure insertion without rewriting the rest", () => {
    expect(diffStats(diffLines("a\nc", "a\nb\nc"))).toEqual({ added: 1, removed: 0, unchanged: 2 });
  });

  test("detects a pure deletion", () => {
    expect(diffStats(diffLines("a\nb\nc", "a\nc"))).toEqual({ added: 0, removed: 1, unchanged: 2 });
  });

  test("numbers lines on the side they belong to", () => {
    const lines = diffLines("a\nb", "a\nB");
    const removed = lines.find((line) => line.kind === "removed")!;
    const added = lines.find((line) => line.kind === "added")!;
    expect(removed.beforeLine).toBe(2);
    expect(removed.afterLine).toBeNull();
    expect(added.afterLine).toBe(2);
    expect(added.beforeLine).toBeNull();
  });

  test("treats CRLF and LF as the same content", () => {
    // A file saved on Windows must not look like a full rewrite.
    expect(diffStats(diffLines("a\r\nb", "a\nb"))).toEqual({ added: 0, removed: 0, unchanged: 2 });
  });

  test("treats an empty document as no lines, not one blank line", () => {
    expect(diffStats(diffLines("", "a\nb"))).toEqual({ added: 2, removed: 0, unchanged: 0 });
    expect(diffStats(diffLines("a\nb", ""))).toEqual({ added: 0, removed: 2, unchanged: 0 });
  });

  test("ignores a trailing newline difference", () => {
    // Otherwise every save that adds or drops the final newline reports a phantom change.
    expect(diffStats(diffLines("a\nb\n", "a\nb"))).toEqual({ added: 0, removed: 0, unchanged: 2 });
  });

  test("degrades to a replacement block instead of stalling on huge inputs", () => {
    const huge = Array.from({ length: 3000 }, (_, index) => `line ${index}`).join("\n");
    const other = Array.from({ length: 3000 }, (_, index) => `other ${index}`).join("\n");
    const stats = diffStats(diffLines(huge, other));
    expect(stats.unchanged).toBe(0);
    expect(stats.added).toBe(3000);
    expect(stats.removed).toBe(3000);
  });

  test("keeps real Markdown edits readable", () => {
    const mine = "# Plan\n\n## Alpha\n\nMeine Zeile.\n\n## Beta\n";
    const theirs = "# Plan\n\n## Alpha\n\nIhre Zeile.\n\n## Beta\n";
    const stats = diffStats(diffLines(mine, theirs));
    expect(stats.added).toBe(1);
    expect(stats.removed).toBe(1);
    expect(stats.unchanged).toBeGreaterThan(4);
  });
});

describe("collapseUnchanged", () => {
  test("replaces long unchanged runs with a skip marker", () => {
    const before = ["a", ...Array.from({ length: 40 }, (_, i) => `x${i}`), "b"].join("\n");
    const after = ["a", ...Array.from({ length: 40 }, (_, i) => `x${i}`), "B"].join("\n");
    const collapsed = collapseUnchanged(diffLines(before, after));
    expect(collapsed.some((entry) => entry.kind === "skipped")).toBe(true);
    expect(collapsed.length).toBeLessThan(20);
  });

  test("keeps everything when the file is short", () => {
    const collapsed = collapseUnchanged(diffLines("a\nb", "a\nB"));
    expect(collapsed.some((entry) => entry.kind === "skipped")).toBe(false);
  });
});
