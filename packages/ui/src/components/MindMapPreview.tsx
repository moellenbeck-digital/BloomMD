"use client";

import { useMemo } from "react";
import {
  Background,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  type Node,
  type NodeProps,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { MindMapDocument } from "@bloommd/core/browser";
import { layoutMindMap, type MindMapNodeData } from "../hooks/useMindMapLayout";
import { MindMapEdge } from "./MindMapEdge";

export interface MindMapPreviewProps {
  document: MindMapDocument;
  className?: string;
  ariaLabel?: string;
}

const LEVEL_STYLES: Record<number, string> = {
  1: "bg-[#1A1A1A] text-white border-[#1A1A1A] px-5 py-3 text-base shadow-lg ring-1 ring-[#FF6B35]/70",
  2: "bg-[#FF6B35] text-white border-[#FF6B35] px-4 py-2 text-sm shadow-md",
  3: "bg-[#FFF4EE] text-[#1A1A1A] border-[#FFD4BF] px-4 py-2 text-sm shadow-sm",
  4: "bg-white text-[var(--color-ink-muted)] border-[#E8E4DF] px-4 py-2 text-sm shadow-sm",
  5: "bg-[#F5F3F0] text-[var(--color-ink-muted)] border-[#D4CFC8] px-4 py-2 text-sm shadow-sm",
  6: "bg-[#E8E4DF] text-[var(--color-ink-muted)] border-[#D4CFC8] px-4 py-2 text-sm shadow-sm",
};

function levelStyle(level: number) {
  return LEVEL_STYLES[Math.min(level, 6)] ?? LEVEL_STYLES[4]!;
}

function PreviewNode({ data }: NodeProps<Node<MindMapNodeData>>) {
  return (
    <div
      className={`relative min-w-[88px] max-w-[220px] rounded-lg border-2 text-center font-[var(--font-display,Outfit,sans-serif)] font-semibold tracking-tight ${levelStyle(data.level)}`}
      data-testid="mindmap-preview-node"
      data-node-level={data.level}
    >
      <Handle type="target" position={Position.Left} isConnectable={false} className="!h-0 !w-0 !border-0 !bg-transparent" />
      <span className="block truncate">{data.label}</span>
      <Handle type="source" position={Position.Right} isConnectable={false} className="!h-0 !w-0 !border-0 !bg-transparent" />
    </div>
  );
}

const nodeTypes: NodeTypes = { mindmap: PreviewNode };
const edgeTypes = { mindmap: MindMapEdge };

function MindMapPreviewInner({ document, className, ariaLabel }: MindMapPreviewProps) {
  const graph = useMemo(() => layoutMindMap(document), [document]);

  return (
    <div
      className={`relative h-full min-h-[220px] w-full overflow-hidden rounded-lg border border-[#2A2A2A] bg-[#111111] ${className ?? ""}`}
      role="img"
      aria-label={ariaLabel ?? "BloomMD mind map preview"}
      data-testid="mindmap-preview"
    >
      <div className="absolute inset-0">
        <ReactFlow
          nodes={graph.nodes}
          edges={graph.edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          fitViewOptions={{ padding: 0.28, minZoom: 0.35, maxZoom: 1.15 }}
          minZoom={0.2}
          maxZoom={1.5}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          panOnDrag={false}
          panOnScroll={false}
          zoomOnScroll={false}
          zoomOnPinch={false}
          zoomOnDoubleClick={false}
          proOptions={{ hideAttribution: true }}
        >
          <Background color="#2A2A2A" gap={24} size={1} />
        </ReactFlow>
      </div>
    </div>
  );
}

export function MindMapPreview(props: MindMapPreviewProps) {
  return (
    <ReactFlowProvider>
      <MindMapPreviewInner {...props} />
    </ReactFlowProvider>
  );
}
