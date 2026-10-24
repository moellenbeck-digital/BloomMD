import type { MindMapDocument } from "@bloommd/core/browser";

/**
 * Collapsed ancestors that hide `nodeId`, outermost first. Opening a note from another app at a
 * node (e.g. Obsidian's "Open app") must show that node even when a branch above it is folded.
 */
export function collapsedAncestors(document: Pick<MindMapDocument, "nodes">, collapsedIds: ReadonlySet<string>, nodeId: string): string[] {
  const hidden: string[] = [];
  const seen = new Set<string>();
  let parent = document.nodes.get(nodeId)?.parentId ?? null;
  while (parent && !seen.has(parent)) {
    seen.add(parent);
    if (collapsedIds.has(parent)) hidden.unshift(parent);
    parent = document.nodes.get(parent)?.parentId ?? null;
  }
  return hidden;
}
