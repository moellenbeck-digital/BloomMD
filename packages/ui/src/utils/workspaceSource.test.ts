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

import { fileNodeId, folderNodeId } from "@bloommd/core/browser";
import { resolveWorkspaceSourceNode, workspaceCreationFolder, workspaceNodeKind, workspaceSourceTarget } from "./workspaceSource";

test("overview targets distinguish repeated headings and ignore attached resource kinds", () => {
  const markdown = "# Project\n\n## Same\n\nFirst\n\n## Same\n\nSecond\n";
  const overview = buildWorkspaceMindMap([
    { path: "notes/a.md", markdown },
    { path: "notes/b.md", markdown },
  ]);
  const candidates = [...overview.nodes.values()].filter((node) => node.title === "Same");
  const second = candidates.find((node) => node.content.includes("Second") && workspaceSourceFile(overview, node.id) === "notes/b.md")!;
  second.metadata = { kind: "folder", file: "assets" };
  const target = workspaceSourceTarget(overview, second.id)!;
  expect(target.file).toBe("notes/b.md");
  expect(workspaceNodeKind(overview, second.id)).toBe("heading");
  const source = parseFile("notes/b.md", markdown);
  const resolved = resolveWorkspaceSourceNode(source, target)!;
  expect(source.nodes.get(resolved)?.content).toContain("Second");
  expect(resolved).not.toBe(second.id);
  expect(workspaceCreationFolder(overview, second.id)).toBe("notes");
  expect(workspaceCreationFolder(overview, folderNodeId("notes"))).toBe("notes");
  expect(workspaceCreationFolder(overview, overview.rootId)).toBe("");
});

test("source navigation fails closed when the target was removed or changed", () => {
  const markdown = "# Project\n\n## Section\n\nBefore\n";
  const overview = buildWorkspaceMindMap([{ path: "a.md", markdown }]);
  const heading = [...overview.nodes.values()].find((node) => node.title === "Section")!;
  const target = workspaceSourceTarget(overview, heading.id)!;
  expect(resolveWorkspaceSourceNode(parseFile("a.md", "# Project\n"), target)).toBeUndefined();
  expect(resolveWorkspaceSourceNode(parseFile("a.md", markdown.replace("Before", "After")), target)).toBeUndefined();
  expect(resolveWorkspaceSourceNode(parseFile("a.md", markdown.replace("Section", "Renamed")), target)).toBeUndefined();
  expect(workspaceSourceTarget(overview, overview.rootId)).toBeUndefined();
  const fileTarget = workspaceSourceTarget(overview, fileNodeId("a.md"))!;
  const source = parseFile("a.md", markdown);
  expect(resolveWorkspaceSourceNode(source, fileTarget)).toBe(source.rootId);
});


test("opens a heading when the matching H1 was folded into the file card", () => {
  const markdown = "# KI im Alltag\n\n## Anwendungsfälle\n\nIdeen\n";
  const overview = buildWorkspaceMindMap([{ path: "Team/KI im Alltag.md", markdown }]);
  const heading = [...overview.nodes.values()].find((node) => node.title === "Anwendungsfälle")!;
  expect(heading.parentId).toBe(fileNodeId("Team/KI im Alltag.md"));
  const target = workspaceSourceTarget(overview, heading.id)!;
  const source = parseFile(target.file, markdown);
  const id = resolveWorkspaceSourceNode(source, target)!;
  expect(source.nodes.get(id)?.title).toBe("Anwendungsfälle");
});
