import { describe, expect, test } from "bun:test";
import { buildWorkspaceMindMap, fileNodeId, type MindMapNode } from "@bloommd/core/browser";
import {
  NODE_KIND_COPY,
  countChildKinds,
  directResourcePreviewUrl,
  metadataForKindChange,
  nodeResourceIssue,
  resourcePreviewKind,
  shouldShowPrimaryMarkdownEditor,
  workspaceReferencesForNode,
} from "./node-panel-model";

function node(id: string, kind?: MindMapNode["metadata"]["kind"]): MindMapNode {
  return {
    id,
    parentId: null,
    level: 1,
    title: id,
    content: "",
    children: [],
    ...(kind ? { metadata: { kind } } : {}),
  };
}

describe("node panel model", () => {
  test("keeps structural workspace nodes out of the primary markdown editor", () => {
    expect(shouldShowPrimaryMarkdownEditor("workspace")).toBe(false);
    expect(shouldShowPrimaryMarkdownEditor("folder")).toBe(false);
    expect(shouldShowPrimaryMarkdownEditor("file")).toBe(false);
    expect(shouldShowPrimaryMarkdownEditor("pdf")).toBe(false);
  });

  test("keeps semantic nodes editable", () => {
    expect(shouldShowPrimaryMarkdownEditor("topic")).toBe(true);
    expect(shouldShowPrimaryMarkdownEditor("task")).toBe(true);
    expect(shouldShowPrimaryMarkdownEditor("decision")).toBe(true);
    expect(shouldShowPrimaryMarkdownEditor("source")).toBe(true);
    expect(shouldShowPrimaryMarkdownEditor("web")).toBe(true);
    expect(shouldShowPrimaryMarkdownEditor("portal")).toBe(true);
  });

  test("counts child node kinds for structure panels", () => {
    expect(countChildKinds([
      node("folder", "folder"),
      node("file", "file"),
      node("pdf", "pdf"),
      node("topic"),
      node("task", "task"),
    ])).toEqual({ folders: 1, files: 2, sections: 2 });
  });

  test("uses user-facing labels instead of raw technical kinds", () => {
    expect(NODE_KIND_COPY.file.label).toBe("Datei");
    expect(NODE_KIND_COPY.folder.label).toBe("Ordner");
    expect(NODE_KIND_COPY.topic.label).toBe("Thema / Notiz");
  });

  test("previews PDFs and image file resources", () => {
    expect(resourcePreviewKind("pdf", "paper.pdf")).toBe("pdf");
    expect(resourcePreviewKind("file", "assets/diagram.PNG")).toBe("image");
    expect(resourcePreviewKind("file", "notes.md")).toBe("unsupported");
    expect(resourcePreviewKind("topic", "assets/diagram.png")).toBe("unsupported");
  });

  test("only direct URLs can be embedded without an app shell resolver", () => {
    expect(directResourcePreviewUrl("https://example.com/paper.pdf")).toBe("https://example.com/paper.pdf");
    expect(directResourcePreviewUrl("blob:mock/0")).toBe("blob:mock/0");
    expect(directResourcePreviewUrl("assets/diagram.png")).toBeNull();
  });

  test("reports missing resource targets for resource nodes", () => {
    expect(nodeResourceIssue(node("file", "file"))).toBe("Für diesen Node ist keine Datei ausgewählt.");
    expect(nodeResourceIssue(node("pdf", "pdf"))).toBe("Für diesen Node ist keine Datei ausgewählt.");
    expect(nodeResourceIssue(node("portal", "portal"))).toBe("Für diesen Map-Verweis ist keine Ziel-Map ausgewählt.");
    expect(nodeResourceIssue(node("web", "web"))).toBe("Für diesen Node ist keine URL hinterlegt.");
  });

  test("accepts complete resource targets", () => {
    expect(nodeResourceIssue({ ...node("file", "file"), metadata: { kind: "file", file: "docs/readme.md" } })).toBeNull();
    expect(nodeResourceIssue({ ...node("portal", "portal"), metadata: { kind: "portal", file: "target.md" } })).toBeNull();
    expect(nodeResourceIssue({ ...node("web", "web"), metadata: { kind: "web", url: "https://example.com" } })).toBeNull();
    expect(nodeResourceIssue({ ...node("source", "source"), metadata: { kind: "source", url: "ftp://example.com" } })).toBe("Die URL muss mit http:// oder https:// beginnen.");
  });

  test("explains the same derived workspace references that the canvas renders", () => {
    const doc = buildWorkspaceMindMap([
      { path: "Speicherung.md", markdown: "# Speicherung\n\nSiehe [[Graphentheorie]].\n" },
      { path: "Graphentheorie.md", markdown: "# Graphentheorie\n" },
    ]);
    const sourceId = fileNodeId("Speicherung.md");
    const targetId = fileNodeId("Graphentheorie.md");

    expect(workspaceReferencesForNode(doc, sourceId)).toEqual([
      expect.objectContaining({
        otherNodeId: targetId,
        otherNodeTitle: "Graphentheorie",
        direction: "outgoing",
        origin: "[[Graphentheorie]] · Speicherung.md:3",
      }),
    ]);
    expect(workspaceReferencesForNode(doc, targetId)).toEqual([
      expect.objectContaining({
        otherNodeId: sourceId,
        otherNodeTitle: "Speicherung",
        direction: "incoming",
        origin: "[[Graphentheorie]] · Speicherung.md:3",
      }),
    ]);
  });

  test("keeps the linked note and relations when the node kind changes", () => {
    const linked = { kind: "web" as const, url: "https://example.com", note: "Arbeit", relations: [{ target: "x" }] };
    expect(metadataForKindChange(linked, "task")).toEqual({ kind: "task", note: "Arbeit", relations: [{ target: "x" }] });
    expect(metadataForKindChange(linked, "topic")).toEqual({ kind: "topic", note: "Arbeit", relations: [{ target: "x" }] });
    expect(metadataForKindChange({ kind: "web", url: "https://example.com" }, "topic")).toBeUndefined();
    expect(metadataForKindChange({ kind: "task", relations: [] }, "decision")).toEqual({ kind: "decision" });
    expect(metadataForKindChange(undefined, "task")).toEqual({ kind: "task" });
  });
});
