import { memo } from "react";
import { BaseEdge, getBezierPath, type EdgeProps } from "@xyflow/react";
import type { EdgeRelation } from "../hooks/useMindMapLayout";

function MindMapEdgeComponent(props: EdgeProps) {
  const relation = (props.data?.relation ?? "hierarchy") as EdgeRelation;
  const workspaceContent = relation === "hierarchy" && props.data?.workspaceContent === true;
  const [edgePath] = getBezierPath({
    sourceX: props.sourceX,
    sourceY: props.sourceY,
    targetX: props.targetX,
    targetY: props.targetY,
    sourcePosition: props.sourcePosition,
    targetPosition: props.targetPosition,
    curvature: 0.4,
  });

  return (
    <BaseEdge
      id={props.id}
      path={edgePath}
      data-testid="mindmap-edge"
      data-relation={relation}
      style={{
        stroke: workspaceContent ? "var(--color-ink-faint)" : relation === "link" ? "#FF6B35" : relation === "backlink" ? "#2684FF" : "#D4CFC8",
        strokeWidth: workspaceContent ? 1.25 : relation === "hierarchy" ? 2 : 1.75,
        strokeDasharray: relation === "link" ? "7 5" : relation === "backlink" ? "2 5" : undefined,
        strokeLinecap: "round",
      }}
    />
  );
}

export const MindMapEdge = memo(MindMapEdgeComponent);
