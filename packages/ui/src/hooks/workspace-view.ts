import type { MindMapDocument, MindMapReference } from "@bloommd/core/browser";

export const COMPACT_WORKSPACE_FILE_THRESHOLD = 100;
export const COMPACT_WORKSPACE_NODE_THRESHOLD = 200;

/** Start large overviews at the top directory level without discarding document structure. */
export function initialWorkspaceCollapse(doc: MindMapDocument, previous: MindMapDocument | null, current: Set<string>): Set<string> {
  const collapsed = new Set([...current].filter((id) => doc.nodes.has(id)));
  if (doc.derived?.kind !== "workspace") return collapsed;
  const sameWorkspace = previous?.derived?.kind === "workspace" && previous.filePath === doc.filePath;
  if (!sameWorkspace) collapsed.clear();
  const files = [...doc.nodes.values()].filter((node) => node.metadata?.kind === "file");
  // A handful of long documents can be more expensive than hundreds of short files.
  if (files.length >= COMPACT_WORKSPACE_FILE_THRESHOLD || doc.nodes.size >= COMPACT_WORKSPACE_NODE_THRESHOLD) {
    for (const node of doc.nodes.values()) {
      if (node.id === doc.rootId || (node.metadata?.kind !== "file" && node.metadata?.kind !== "folder")) continue;
      if (node.children.length > 0 && (!sameWorkspace || !previous.nodes.has(node.id))) collapsed.add(node.id);
    }
  }
  return collapsed;
}

/** Keep cross-file links navigable when their heading endpoints are collapsed. */
export function visibleWorkspaceReferences(doc: MindMapDocument, visible: ReadonlySet<string>): MindMapReference[] | undefined {
  if (doc.derived?.kind !== "workspace") return doc.references;
  const endpoint = (id: string): string | null => {
    const visited = new Set<string>();
    let current: string | null = id;
    while (current && !visited.has(current)) {
      if (visible.has(current)) return current;
      visited.add(current);
      current = doc.nodes.get(current)?.parentId ?? null;
    }
    return null;
  };
  return (doc.references ?? []).flatMap((reference) => {
    const sourceId = endpoint(reference.sourceId);
    const targetId = endpoint(reference.targetId);
    return sourceId && targetId && sourceId !== targetId ? [{ ...reference, sourceId, targetId }] : [];
  });
}
