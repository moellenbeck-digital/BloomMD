import { HeadingDepthError, MAX_HEADING_LEVEL, type MindMapDocument, type MindMapNode } from "./types";

function generateId(): string {
  return crypto.randomUUID().slice(0, 8);
}

export function addNode(
  doc: MindMapDocument,
  parentId: string,
  title: string,
  content = "",
): MindMapNode {
  const parent = doc.nodes.get(parentId);
  if (!parent) throw new Error(`Parent node not found: ${parentId}`);
  if (parent.level >= MAX_HEADING_LEVEL) throw new HeadingDepthError();

  const id = generateId();
  const node: MindMapNode = {
    id,
    parentId,
    level: parent.level + 1,
    title,
    content,
    children: [],
  };

  doc.nodes.set(id, node);
  parent.children.push(id);

  return node;
}

export function deleteNode(doc: MindMapDocument, nodeId: string): void {
  if (nodeId === doc.rootId) {
    throw new Error("Cannot delete root node");
  }

  const node = doc.nodes.get(nodeId);
  if (!node) throw new Error(`Node not found: ${nodeId}`);

  // Recursively delete all descendants
  function deleteDescendants(id: string) {
    const n = doc.nodes.get(id);
    if (!n) return;
    for (const childId of n.children) {
      deleteDescendants(childId);
    }
    doc.nodes.delete(id);
  }

  deleteDescendants(nodeId);

  // Remove from parent's children
  if (node.parentId) {
    const parent = doc.nodes.get(node.parentId);
    if (parent) {
      parent.children = parent.children.filter((id) => id !== nodeId);
    }
  }
}

export function moveNode(
  doc: MindMapDocument,
  nodeId: string,
  newParentId: string,
): void {
  if (nodeId === doc.rootId) {
    throw new Error("Cannot move root node");
  }

  const node = doc.nodes.get(nodeId);
  if (!node) throw new Error(`Node not found: ${nodeId}`);

  const newParent = doc.nodes.get(newParentId);
  if (!newParent) throw new Error(`New parent not found: ${newParentId}`);

  // Prevent moving a node into its own subtree
  function isDescendant(ancestorId: string, candidateId: string): boolean {
    const ancestor = doc.nodes.get(ancestorId);
    if (!ancestor) return false;
    for (const childId of ancestor.children) {
      if (childId === candidateId) return true;
      if (isDescendant(childId, candidateId)) return true;
    }
    return false;
  }

  if (nodeId === newParentId) {
    throw new Error("Cannot move a node into itself");
  }

  if (isDescendant(nodeId, newParentId)) {
    throw new Error("Cannot move a node into its own subtree");
  }

  // The whole subtree shifts with the node, so the deepest descendant decides whether it fits.
  function subtreeDepth(id: string): number {
    const n = doc.nodes.get(id);
    if (!n) return 0;
    return 1 + Math.max(0, ...n.children.map(subtreeDepth));
  }

  if (newParent.level + subtreeDepth(nodeId) > MAX_HEADING_LEVEL) {
    throw new HeadingDepthError();
  }

  // Remove from old parent
  if (node.parentId) {
    const oldParent = doc.nodes.get(node.parentId);
    if (oldParent) {
      oldParent.children = oldParent.children.filter((id) => id !== nodeId);
    }
  }

  // Add to new parent
  newParent.children.push(nodeId);
  node.parentId = newParentId;

  // Update levels recursively
  function updateLevels(id: string, parentLevel: number) {
    const n = doc.nodes.get(id);
    if (!n) return;
    n.level = parentLevel + 1;
    for (const childId of n.children) {
      updateLevels(childId, n.level);
    }
  }

  updateLevels(nodeId, newParent.level);
}

export function renameNode(
  doc: MindMapDocument,
  nodeId: string,
  newTitle: string,
): void {
  const node = doc.nodes.get(nodeId);
  if (!node) throw new Error(`Node not found: ${nodeId}`);
  node.title = newTitle;
}
