import * as Y from "yjs";
import { HeadingDepthError, MAX_HEADING_LEVEL, type MindMapNodeMetadata } from "./types";

function generateId(): string {
  return crypto.randomUUID().slice(0, 8);
}

// ── Helpers ──

function getNode(yDoc: Y.Doc, nodeId: string): Y.Map<unknown> {
  const yNodes = yDoc.getMap<Y.Map<unknown>>("nodes");
  const yNode = yNodes.get(nodeId);
  if (!yNode) throw new Error(`Node not found: ${nodeId}`);
  return yNode;
}

function getChildren(yNode: Y.Map<unknown>): Y.Array<string> {
  return yNode.get("children") as Y.Array<string>;
}

function getRootId(yDoc: Y.Doc): string {
  const yMeta = yDoc.getMap("meta");
  return yMeta.get("rootId") as string;
}

// ── Operations ──

/**
 * Add a child node under `parentId`. Returns the new node's ID.
 */
export function yAddNode(
  yDoc: Y.Doc,
  parentId: string,
  title: string,
  content = "",
  index?: number,
  metadata?: MindMapNodeMetadata,
): string {
  const id = generateId();

  if ((getNode(yDoc, parentId).get("level") as number) >= MAX_HEADING_LEVEL) {
    throw new HeadingDepthError();
  }

  yDoc.transact(() => {
    const yNodes = yDoc.getMap<Y.Map<unknown>>("nodes");
    const yNodeContents = yDoc.getMap<Y.Text>("nodeContents");
    const parent = getNode(yDoc, parentId);
    const parentLevel = parent.get("level") as number;

    // Create node
    const yNode = new Y.Map<unknown>();
    yNode.set("id", id);
    yNode.set("parentId", parentId);
    yNode.set("level", parentLevel + 1);
    yNode.set("title", title);
    if (metadata) yNode.set("metadata", structuredClone(metadata));
    const yChildren = new Y.Array<string>();
    yNode.set("children", yChildren);
    yNodes.set(id, yNode);

    // Create content
    const yContent = new Y.Text();
    if (content) yContent.insert(0, content);
    yNodeContents.set(id, yContent);

    const children = getChildren(parent);
    const insertionIndex = index === undefined
      ? children.length
      : Math.max(0, Math.min(index, children.length));
    children.insert(insertionIndex, [id]);
  });

  return id;
}

/**
 * Recursively delete a node and all its descendants.
 */
export function yDeleteNode(yDoc: Y.Doc, nodeId: string): void {
  const rootId = getRootId(yDoc);
  if (nodeId === rootId) {
    throw new Error("Cannot delete root node");
  }

  yDoc.transact(() => {
    const yNodes = yDoc.getMap<Y.Map<unknown>>("nodes");
    const yNodeContents = yDoc.getMap<Y.Text>("nodeContents");
    const node = getNode(yDoc, nodeId);
    const parentId = node.get("parentId") as string | null;

    // Recursive delete
    function deleteDescendants(id: string) {
      const n = yNodes.get(id);
      if (!n) return;
      const children = getChildren(n);
      // Iterate backwards to avoid index shifting
      for (let i = children.length - 1; i >= 0; i--) {
        deleteDescendants(children.get(i));
      }
      yNodes.delete(id);
      yNodeContents.delete(id);
    }

    deleteDescendants(nodeId);

    // Remove from parent's children
    if (parentId) {
      const parent = yNodes.get(parentId);
      if (parent) {
        const parentChildren = getChildren(parent);
        const arr = parentChildren.toArray();
        const idx = arr.indexOf(nodeId);
        if (idx >= 0) parentChildren.delete(idx, 1);
      }
    }
  });
}

/**
 * Move a node to a new parent. Updates levels recursively.
 */
export function yMoveNode(
  yDoc: Y.Doc,
  nodeId: string,
  newParentId: string,
  index?: number,
): void {
  const rootId = getRootId(yDoc);
  if (nodeId === rootId) {
    throw new Error("Cannot move root node");
  }
  // A self-move would make the node its own parent. `isDescendant` cannot catch that, and the
  // resulting cycle makes updateLevels recurse until the stack overflows mid-transaction.
  if (nodeId === newParentId) {
    throw new Error("Cannot move a node into itself");
  }

  const yNodes = yDoc.getMap<Y.Map<unknown>>("nodes");

  // Check circular move
  function isDescendant(ancestorId: string, candidateId: string): boolean {
    const ancestor = yNodes.get(ancestorId);
    if (!ancestor) return false;
    const children = getChildren(ancestor).toArray();
    for (const childId of children) {
      if (childId === candidateId) return true;
      if (isDescendant(childId, candidateId)) return true;
    }
    return false;
  }

  if (isDescendant(nodeId, newParentId)) {
    throw new Error("Cannot move a node into its own subtree");
  }

  // The whole subtree shifts with the node, so the deepest descendant decides whether it fits.
  function subtreeDepth(id: string): number {
    const n = yNodes.get(id);
    if (!n) return 0;
    return 1 + Math.max(0, ...getChildren(n).toArray().map(subtreeDepth));
  }

  const targetLevel = (getNode(yDoc, newParentId).get("level") as number) + 1;
  if (targetLevel + subtreeDepth(nodeId) - 1 > MAX_HEADING_LEVEL) {
    throw new HeadingDepthError();
  }

  yDoc.transact(() => {
    const node = getNode(yDoc, nodeId);
    const oldParentId = node.get("parentId") as string | null;
    const newParent = getNode(yDoc, newParentId);

    let removedIndex = -1;

    // Remove from old parent
    if (oldParentId) {
      const oldParent = yNodes.get(oldParentId);
      if (oldParent) {
        const oldChildren = getChildren(oldParent);
        const arr = oldChildren.toArray();
        removedIndex = arr.indexOf(nodeId);
        if (removedIndex >= 0) oldChildren.delete(removedIndex, 1);
      }
    }

    // Add to new parent. Account for the removed item when reordering siblings.
    const newChildren = getChildren(newParent);
    const requestedIndex = index === undefined ? newChildren.length : index;
    const adjustedIndex = oldParentId === newParentId && removedIndex >= 0 && removedIndex < requestedIndex
      ? requestedIndex - 1
      : requestedIndex;
    newChildren.insert(Math.max(0, Math.min(adjustedIndex, newChildren.length)), [nodeId]);
    node.set("parentId", newParentId);

    // Update levels recursively
    function updateLevels(id: string, parentLevel: number) {
      const n = yNodes.get(id);
      if (!n) return;
      n.set("level", parentLevel + 1);
      const children = getChildren(n).toArray();
      for (const childId of children) {
        updateLevels(childId, parentLevel + 1);
      }
    }

    updateLevels(nodeId, newParent.get("level") as number);
  });
}

/**
 * Rename a node's title.
 */
export function yRenameNode(
  yDoc: Y.Doc,
  nodeId: string,
  newTitle: string,
): void {
  yDoc.transact(() => {
    const node = getNode(yDoc, nodeId);
    node.set("title", newTitle);
  });
}

export function yUpdateNodeMetadata(
  yDoc: Y.Doc,
  nodeId: string,
  metadata: MindMapNodeMetadata | undefined,
): void {
  yDoc.transact(() => {
    const node = getNode(yDoc, nodeId);
    node.set("metadata", metadata ? structuredClone(metadata) : null);
  });
}

/**
 * Replace a node's markdown content (string-level, Phase 7a).
 */
export function yUpdateContent(
  yDoc: Y.Doc,
  nodeId: string,
  content: string,
): void {
  yDoc.transact(() => {
    const yNodeContents = yDoc.getMap<Y.Text>("nodeContents");
    let yContent = yNodeContents.get(nodeId);
    if (!yContent) {
      yContent = new Y.Text();
      yNodeContents.set(nodeId, yContent);
    }
    yContent.delete(0, yContent.length);
    if (content) yContent.insert(0, content);
  });
}

/**
 * Update a single frontmatter field.
 */
export function yUpdateFrontmatter(
  yDoc: Y.Doc,
  key: string,
  value: unknown,
): void {
  yDoc.transact(() => {
    const yMeta = yDoc.getMap("meta");
    const fm = (yMeta.get("frontmatter") ?? {}) as Record<string, unknown>;
    const updated = { ...fm, [key]: value };
    yMeta.set("frontmatter", updated);
  });
}
