import { expect, test } from "bun:test";
import { buildWorkspaceMindMap, parseFile } from "@bloommd/core/browser";
import { workspaceSourceFile } from "./workspaceSource";

test("workspace source is the containing Markdown file, not a resource attached to a heading", () => {
  const doc = buildWorkspaceMindMap([{ path: "notes/source.md", markdown: "# Source\n\n## Attachment\n" }]);
  const heading = [...doc.nodes.values()].find((node) => node.title === "Attachment")!;
  heading.metadata = { kind: "file", file: "attachment.pdf" };
  expect(workspaceSourceFile(doc, heading.id)).toBe("notes/source.md");
  expect(workspaceSourceFile(doc, doc.rootId)).toBeUndefined();
  expect(workspaceSourceFile(doc, "missing")).toBeUndefined();
  const file = parseFile("source.md", "# Source\n");
  expect(workspaceSourceFile(file, file.rootId)).toBeUndefined();
});
