import dagre from "dagre";
import type { Edge, Node } from "@xyflow/react";
import {
  filterWorkspaceGraph,
  type GraphLayers,
  type WorkspaceGraph,
  type WorkspaceNodeKind,
} from "@bloommd/core/browser";

export interface WorkspaceMapNodeData {
  [key: string]: unknown;
  label: string;
  kind: WorkspaceNodeKind;
  path: string;
  /** Files contained directly, shown on folder nodes. */
  childCount: number;
}

const NODE_HEIGHT = 40;
const FOLDER_MIN_WIDTH = 120;
const FILE_MIN_WIDTH = 150;

/**
 * Positions the workspace map.
 *
 * Structure edges drive the layout and reference edges deliberately do not: a cross-link is a
 * relationship, not a place in the hierarchy, and feeding it to dagre drags files out of the folder
 * they belong to. That is exactly the "unreadable graph" the layer controls exist to avoid.
 */
export function layoutWorkspaceMap(
  graph: WorkspaceGraph,
  layers: GraphLayers,
  selectedNodeId: string | null,
): { nodes: Node<WorkspaceMapNodeData>[]; edges: Edge[] } {
  const view = filterWorkspaceGraph(graph, layers, selectedNodeId);

  const childCounts = new Map<string, number>();
  for (const edge of graph.edges) {
    if (edge.kind !== "structure") continue;
    childCounts.set(edge.source, (childCounts.get(edge.source) ?? 0) + 1);
  }

  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "LR", nodesep: 24, ranksep: 90, marginx: 24, marginy: 24 });
  g.setDefaultEdgeLabel(() => ({}));

  for (const node of view.nodes) {
    const minimum = node.kind === "folder" ? FOLDER_MIN_WIDTH : FILE_MIN_WIDTH;
    const width = Math.max(minimum, Math.min(node.label.length * 8 + 48, 260));
    g.setNode(node.id, { width, height: NODE_HEIGHT });
  }
  for (const edge of view.edges) {
    if (edge.kind === "structure") g.setEdge(edge.source, edge.target);
  }

  dagre.layout(g);

  const nodes: Node<WorkspaceMapNodeData>[] = view.nodes.map((node): Node<WorkspaceMapNodeData> => {
    const positioned = g.node(node.id) as { x: number; y: number; width: number; height: number } | undefined;
    return {
      id: node.id,
      type: "workspace",
      position: {
        x: (positioned?.x ?? 0) - (positioned?.width ?? FILE_MIN_WIDTH) / 2,
        y: (positioned?.y ?? 0) - NODE_HEIGHT / 2,
      },
      selected: node.id === selectedNodeId,
      data: {
        label: node.label,
        kind: node.kind,
        path: node.path,
        childCount: childCounts.get(node.id) ?? 0,
      },
    };
  });

  const edges: Edge[] = view.edges.map((edge) => {
    if (edge.kind === "structure") {
      return {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: "smoothstep",
        style: { stroke: "var(--color-border-strong)", strokeWidth: 1.5 },
      };
    }

    // A broken or ambiguous link has no target node. It is drawn back onto its own file so the
    // problem is visible on the map instead of being silently dropped.
    const target = edge.target ?? edge.source;
    const unresolved = edge.resolution !== "resolved";
    return {
      id: edge.id,
      source: edge.source,
      target,
      type: "straight",
      animated: false,
      label: unresolved ? edge.raw : undefined,
      labelStyle: { fontSize: 10, fill: "#9B3412" },
      style: {
        stroke: unresolved ? "#C2410C" : "#7C5CFF",
        strokeWidth: 1.25,
        // Dashed keeps references visually subordinate to the structure they cut across.
        strokeDasharray: unresolved ? "2 3" : "5 4",
        opacity: unresolved ? 0.75 : 0.9,
      },
    };
  });

  return { nodes, edges };
}
