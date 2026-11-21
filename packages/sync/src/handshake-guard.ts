import type * as Y from "yjs";
import { yDocToDocument, yReplaceNodeEntry, type MindMapNode } from "@bloommd/core";

export const HANDSHAKE_GUARD_ORIGIN = "bloommd:handshake-guard";

function sameNode(left: MindMapNode, right: MindMapNode): boolean {
  return (
    left.title === right.title &&
    left.content === right.content &&
    left.parentId === right.parentId &&
    left.level === right.level &&
    JSON.stringify(left.children) === JSON.stringify(right.children) &&
    JSON.stringify(left.metadata ?? null) === JSON.stringify(right.metadata ?? null)
  );
}

/** The nodes of a room as they are now, for `repairHandshake`. */
export function snapshotNodes(yDoc: Y.Doc): Map<string, MindMapNode> {
  return yDocToDocument(yDoc).nodes;
}

/**
 * A client answers the server's SyncStep1 with SyncStep2 right after it connects. A client without
 * queued offline edits has nothing to say that the room does not know, so that answer must not
 * change a node. It can, though: every client builds its own Y.Doc from the file, and a handshake
 * answer that arrives late (an older connection, a slow network) lets that copy win a node entry
 * after other clients already edited it. The edit is hidden and no conflict copy appears (#261).
 *
 * Call after applying such a message with the nodes from before it. Every node the message changed
 * is written back as it was.
 *
 * @returns the ids that were put back
 */
export function repairHandshake(yDoc: Y.Doc, before: Map<string, MindMapNode>): string[] {
  const after = yDocToDocument(yDoc).nodes;
  const repaired: string[] = [];
  for (const [id, node] of before) {
    const current = after.get(id);
    if (current && sameNode(node, current)) continue;
    yReplaceNodeEntry(yDoc, id, node, HANDSHAKE_GUARD_ORIGIN);
    repaired.push(id);
  }
  for (const id of after.keys()) {
    if (before.has(id)) continue;
    yReplaceNodeEntry(yDoc, id, null, HANDSHAKE_GUARD_ORIGIN);
    repaired.push(id);
  }
  return repaired;
}
