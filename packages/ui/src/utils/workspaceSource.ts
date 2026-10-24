import { fileNodeId, type MindMapDocument } from "@bloommd/core/browser";

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
