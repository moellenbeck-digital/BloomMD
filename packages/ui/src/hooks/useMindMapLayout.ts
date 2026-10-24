import dagre from "dagre";
import type { Node, Edge } from "@xyflow/react";
import type { MindMapDocument, MindMapNodeMetadata } from "@bloommd/core/browser";
import { extractLinksFromMarkdown, extractMapLinksFromMarkdown } from "../utils/links";

export type EdgeMode = "hierarchy" | "links" | "backlinks" | "all";
export type EdgeRelation = "hierarchy" | "link" | "backlink";

export interface RootRenameEvent {
  nodeId: string;
  previousTitle: string;
  newTitle: string;
}

export interface MindMapNodeData {
  [key: string]: unknown;
  label: string;
  level: number;
  content: string;
  collapsed?: boolean;
  childCount: number;
  linkCount: number;
  metadata?: MindMapNodeMetadata;
  dropPosition?: "before" | "inside" | "after";
  onRootRename?: (event: RootRenameEvent) => void | Promise<void>;
  /** Optional host action for a node-scoped workspace agent. */
  onAskAgent?: () => void;
  agentActivity?: { queuedOrRunning: number; pendingProposals: number };
}

export function layoutMindMap(doc: MindMapDocument, edgeMode: EdgeMode = "hierarchy"): {
  nodes: Node<MindMapNodeData>[];
  edges: Edge[];
} {
  const g = new dagre.graphlib.Graph();
  const direction = doc.frontmatter.layout?.direction ?? "LR";
  const isWorkspaceDocument = doc.derived?.kind === "workspace";

  g.setGraph({
    rankdir: direction,
    nodesep: 40,
    ranksep: 100,
    marginx: 20,
    marginy: 20,
  });
  g.setDefaultEdgeLabel(() => ({}));

  for (const [id, node] of doc.nodes) {
    const estimatedWidth = Math.max(140, Math.min(node.title.length * 9 + 40, 280));
    g.setNode(id, { width: estimatedWidth, height: 44 });
    if (node.parentId) {
      g.setEdge(node.parentId, id);
    }
  }

  dagre.layout(g);

  const derivedLinkCounts = new Map<string, number>();
  for (const reference of doc.references ?? []) {
    derivedLinkCounts.set(reference.sourceId, (derivedLinkCounts.get(reference.sourceId) ?? 0) + 1);
  }

  const rfNodes: Node<MindMapNodeData>[] = [...doc.nodes.values()].map(
    (node) => {
      const pos = g.node(node.id);
      return {
        id: node.id,
        type: "mindmap",
        position: { x: pos.x - pos.width / 2, y: pos.y - pos.height / 2 },
        data: {
          label: node.title,
          level: node.level,
          content: node.content,
          collapsed: node.collapsed,
          childCount: node.children.length,
          linkCount: extractLinksFromMarkdown(node.content).length
            + (isWorkspaceDocument ? 0 : extractMapLinksFromMarkdown(node.content).length)
            + (derivedLinkCounts.get(node.id) ?? 0),
          ...(node.metadata ? { metadata: node.metadata } : {}),
        },
      };
    },
  );

  const hierarchyEdges: Edge[] = [...doc.nodes.values()]
    .filter((node) => node.parentId)
    .map((node) => ({
      id: `hierarchy:${node.parentId}-${node.id}`,
      source: node.parentId!,
      target: node.id,
      type: "mindmap",
      data: { relation: "hierarchy" satisfies EdgeRelation },
    }));

  const referenceEdges: Edge[] = [];
  const seenReferences = new Set<string>();
  const currentFilename = doc.filePath.split("/").pop()?.replace(/\.md$/i, "") ?? "";

  const pushReferenceEdge = (sourceId: string, targetId: string) => {
    if (!doc.nodes.has(targetId) || targetId === sourceId) return;
    const key = `${sourceId}:${targetId}`;
    if (seenReferences.has(key)) return;
    seenReferences.add(key);
    const relation: EdgeRelation = edgeMode === "backlinks" ? "backlink" : "link";
    referenceEdges.push({
      id: `${relation}:${key}`,
      source: relation === "backlink" ? targetId : sourceId,
      target: relation === "backlink" ? sourceId : targetId,
      type: "mindmap",
      data: { relation },
    });
  };

  for (const node of doc.nodes.values()) {
    const targets = new Set<string>();
    const metadataFile = node.metadata?.file?.split("/").pop()?.replace(/\.md$/i, "") ?? null;
    if (node.metadata?.targetNodeId && (!metadataFile || metadataFile === currentFilename)) {
      targets.add(node.metadata.targetNodeId);
    }
    for (const link of extractMapLinksFromMarkdown(node.content)) {
      const linkFile = link.targetFile?.replace(/\.md$/i, "") ?? null;
      if (link.targetNodeId && (!linkFile || linkFile === currentFilename)) {
        targets.add(link.targetNodeId);
      }
    }

    for (const targetId of targets) {
      pushReferenceEdge(node.id, targetId);
    }
  }

  for (const reference of doc.references ?? []) {
    pushReferenceEdge(reference.sourceId, reference.targetId);
  }

  const rfEdges = edgeMode === "hierarchy"
    ? hierarchyEdges
    : edgeMode === "all"
      ? [...hierarchyEdges, ...referenceEdges]
      : referenceEdges;

  return { nodes: rfNodes, edges: rfEdges };
}
