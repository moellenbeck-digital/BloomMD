import type { MindMapDocument } from "@bloommd/core/browser";

export type CanvasDropPosition = "before" | "inside" | "after";

export interface CanvasDropTarget {
  nodeId: string;
  position: CanvasDropPosition;
}

export interface CanvasNodeGeometry {
  id: string;
  position: { x: number; y: number };
  measured?: { width?: number; height?: number };
}

export interface CanvasMoveIntent {
  newParentId: string;
  index?: number;
}

const DEFAULT_NODE_WIDTH = 180;
const DEFAULT_NODE_HEIGHT = 54;
export const DEFAULT_DROP_THRESHOLD = 140;

export function findCanvasDropTarget(
  nodes: CanvasNodeGeometry[],
  draggedId: string,
  point: { x: number; y: number },
  threshold = DEFAULT_DROP_THRESHOLD,
): CanvasDropTarget | null {
  let closest: CanvasNodeGeometry | null = null;
  let minDistance = threshold;

  for (const candidate of nodes) {
    if (candidate.id === draggedId) continue;
    const width = candidate.measured?.width ?? DEFAULT_NODE_WIDTH;
    const height = candidate.measured?.height ?? DEFAULT_NODE_HEIGHT;
    const centerX = candidate.position.x + width / 2;
    const centerY = candidate.position.y + height / 2;
    const distance = Math.hypot(point.x - centerX, point.y - centerY);
    if (distance < minDistance) {
      minDistance = distance;
      closest = candidate;
    }
  }

  if (!closest) return null;

  const height = closest.measured?.height ?? DEFAULT_NODE_HEIGHT;
  const centerY = closest.position.y + height / 2;
  const relativeY = point.y - centerY;
  const position = Math.abs(relativeY) <= height * 0.28
    ? "inside"
    : relativeY < 0
      ? "before"
      : "after";

  return { nodeId: closest.id, position };
}

export function dropTargetToMoveIntent(doc: MindMapDocument, target: CanvasDropTarget): CanvasMoveIntent | null {
  if (target.position === "inside") return { newParentId: target.nodeId };

  const targetNode = doc.nodes.get(target.nodeId);
  if (!targetNode?.parentId) return null;

  const siblings = doc.nodes.get(targetNode.parentId)?.children ?? [];
  const targetIndex = siblings.indexOf(target.nodeId);
  if (targetIndex < 0) return null;

  return {
    newParentId: targetNode.parentId,
    index: targetIndex + (target.position === "after" ? 1 : 0),
  };
}
