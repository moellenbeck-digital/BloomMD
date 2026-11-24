import { fileNodeId, folderNodeId, headingNodeId, type MindMapDocument } from "@bloommd/core/browser";

export interface WorkspaceSourceTarget {
  file: string;
  /** Deterministic overview ID, validated against a fresh traversal of the source. */
  heading?: { id: string; content: string };
}

export function workspaceNodeKind(document: MindMapDocument | null, id: string): "folder" | "file" | "heading" | undefined {
  if (document?.derived?.kind !== "workspace") return;
  const node = document.nodes.get(id);
  if (!node) return;
  if (id === document.rootId || (node.metadata?.kind === "folder" && id === folderNodeId(node.metadata.file ?? ""))) return "folder";
  if (node.metadata?.kind === "file" && id === fileNodeId(node.metadata.file ?? "")) return "file";
  return "heading";
}

export function workspaceSourceTarget(document: MindMapDocument | null, id: string): WorkspaceSourceTarget | undefined {
  const file = workspaceSourceFile(document, id);
  if (!document || !file) return;
  if (id === fileNodeId(file)) return { file };
  return { file, heading: { id, content: document.nodes.get(id)?.content ?? "" } };
}

/** Fail closed if the source changed: open the file instead of guessing an editing target. */
export function resolveWorkspaceSourceNode(document: MindMapDocument, target: WorkspaceSourceTarget): string | undefined {
  if (!target.heading) return document.rootId;
  let ordinal = 0;
  let match: string | undefined;
  const visit = (id: string) => {
    const node = document.nodes.get(id);
    if (!node) return;
    // The overview may fold a matching H1 into its file card. Its remaining IDs still
    // refer to the original traversal, so reconstruct them rather than following its parents.
    const overviewId = headingNodeId(target.file, ordinal++, node.title);
    if (overviewId === target.heading?.id && node.content === target.heading.content) match = id;
    node.children.forEach(visit);
  };
  for (const node of document.nodes.values()) if (node.parentId === null) visit(node.id);
  return match;
}

export function workspaceCreationFolder(document: MindMapDocument | null, id: string | null): string {
  if (!document || !id || document.derived?.kind !== "workspace") return "";
  if (id === document.rootId) return "";
  if (workspaceNodeKind(document, id) === "folder") return document.nodes.get(id)?.metadata?.file ?? "";
  const file = workspaceSourceFile(document, id);
  return file?.includes("/") ? file.slice(0, file.lastIndexOf("/")) : "";
}

/** Find the real Markdown file behind a node in the derived workspace overview. */
export function workspaceSourceFile(document: MindMapDocument | null | undefined, nodeId: string): string | undefined {
  if (document?.derived?.kind !== "workspace") return;
  let node = document.nodes.get(nodeId);
  const visited = new Set<string>();
  while (node && !visited.has(node.id)) {
    visited.add(node.id);
    if (node.metadata?.kind === "file" && node.metadata.file && node.id === fileNodeId(node.metadata.file)) return node.metadata.file;
    node = node.parentId ? document.nodes.get(node.parentId) : undefined;
  }
}

export function openWorkspaceSource(file: string): void {
  window.dispatchEvent(new window.CustomEvent("bloommd:open-resource", { detail: { kind: "file", file } }));
}
