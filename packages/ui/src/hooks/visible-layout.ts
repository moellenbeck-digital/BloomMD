import type { MindMapDocument, MindMapNode } from "@bloommd/core/browser";
import type { Node, Edge } from "@xyflow/react";
import { layoutMindMap, type EdgeMode, type MindMapNodeData } from "./useMindMapLayout";
import { visibleWorkspaceReferences } from "./workspace-view";

function getVisibleNodes(
  doc: MindMapDocument,
  collapsedIds: Set<string>,
  focusNodeId: string | null,
): Map<string, MindMapNode> {
  const visible = new Map<string, MindMapNode>();

  function walk(nodeId: string) {
    const node = doc.nodes.get(nodeId);
    if (!node) return;
    visible.set(nodeId, node);
    if (!collapsedIds.has(nodeId)) {
      for (const childId of node.children) {
        walk(childId);
      }
    }
  }

  if (focusNodeId && doc.nodes.has(focusNodeId)) {
    walk(focusNodeId);
  } else {
    for (const node of doc.nodes.values()) {
      if (node.parentId === null) walk(node.id);
    }
  }
  return visible;
}

export function computeVisibleLayout(
  doc: MindMapDocument,
  collapsedIds: Set<string>,
  focusNodeId: string | null,
  edgeMode: EdgeMode,
): { nodes: Node<MindMapNodeData>[]; edges: Edge[] } {
  const visibleNodes = getVisibleNodes(doc, collapsedIds, focusNodeId);
  const filteredDoc: MindMapDocument = {
    ...doc,
    nodes: visibleNodes,
    references: visibleWorkspaceReferences(doc, new Set(visibleNodes.keys())),
  };
  const result = layoutMindMap(filteredDoc, edgeMode);

  // Mark collapsed nodes with their hidden child count
  return {
    nodes: result.nodes.map((n) => {
      const srcNode = doc.nodes.get(n.id);
      if (srcNode && collapsedIds.has(n.id) && srcNode.children.length > 0) {
        return {
          ...n,
          data: { ...n.data, collapsed: true, childCount: srcNode.children.length },
        };
      }
      return n;
    }),
    edges: result.edges,
  };
}

