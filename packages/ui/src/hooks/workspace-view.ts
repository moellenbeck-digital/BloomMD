import type { MindMapDocument, MindMapReference } from "@bloommd/core/browser";

export const COMPACT_WORKSPACE_FILE_THRESHOLD = 100;

/** Collapse file headings for the initial overview, without discarding document structure. */
export function initialWorkspaceCollapse(doc: MindMapDocument, previous: MindMapDocument | null, current: Set<string>): Set<string> {
  const collapsed = new Set([...current].filter((id) => doc.nodes.has(id)));
  if (doc.derived?.kind !== "workspace") return collapsed;
  const sameWorkspace = previous?.derived?.kind === "workspace" && previous.filePath === doc.filePath;
  if (!sameWorkspace) collapsed.clear();
  const files = [...doc.nodes.values()].filter((node) => node.metadata?.kind === "file");
  if (files.length >= COMPACT_WORKSPACE_FILE_THRESHOLD) {
    for (const node of files) {
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
