import { expect, test } from "bun:test";
import { parseFile } from "@bloommd/core/browser";
import { workspaceLoadIssue } from "./workspace-load-issue";

test("YAML diagnostics retain coordinates but never source snippets", () => {
  let error: unknown;
  try { parseFile("broken.md", "---\ntitle: private: content\n---\n# Note"); } catch (cause) { error = cause; }
  const issue = workspaceLoadIssue("broken.md", error);
  expect(issue.kind).toBe("yaml");
  expect(issue.line).toBeGreaterThan(0);
  expect(issue.column).toBeGreaterThan(0);
  expect(JSON.stringify(issue)).not.toContain("private");
});

test("filesystem failures become actionable categories without leaking error details", () => {
  expect(workspaceLoadIssue("folder", { code: "EACCES" }).kind).toBe("permission");
  expect(workspaceLoadIssue("folder", { code: "EPERM" }).kind).toBe("permission");
  expect(workspaceLoadIssue("note.md", { code: "ENOENT" }).kind).toBe("missing");
  expect(workspaceLoadIssue("note.md", new Error("Existing path cannot be normalized without changing its name")).kind).toBe("path");
  expect(workspaceLoadIssue("note.md", new Error("/private/secret"))).toEqual({ path: "note.md", kind: "unknown" });
});
