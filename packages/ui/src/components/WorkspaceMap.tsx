"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Background, Controls, Panel, PanOnScrollMode, ReactFlow, ReactFlowProvider, type NodeTypes } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  buildWorkspaceGraph,
  DEFAULT_GRAPH_LAYERS,
  graphCounts,
  type GraphLayers,
  type WorkspaceFileInput,
} from "@bloommd/core/browser";
import { layoutWorkspaceMap } from "../hooks/useWorkspaceMapLayout";
import { GraphLayerControls } from "./GraphLayerControls";
import { WorkspaceMapNode } from "./WorkspaceMapNode";
import { useLocale } from "../i18n/LocaleContext";

const nodeTypes: NodeTypes = { workspace: WorkspaceMapNode };

export interface WorkspaceMapProps {
  files: WorkspaceFileInput[];
  /** Distinguishes the stored view setting per workspace. */
  workspaceKey: string;
  /** Called when a file node is activated, so the host can open its document map. */
  onOpenFile?: (path: string) => void;
}

const STORAGE_PREFIX = "bloommd:graph-layers:";

/**
 * Reads the stored layer setting.
 *
 * A workspace view is a local preference, not document content — it never belongs in Markdown, and
 * storing it per workspace keeps a book outline from inheriting the settings of a code notebook.
 * Any failure falls back to the default rather than breaking the map: private browsing modes and
 * disabled storage both throw here.
 */
function loadLayers(workspaceKey: string): GraphLayers {
  if (typeof window === "undefined") return DEFAULT_GRAPH_LAYERS;
  try {
    const stored = window.localStorage.getItem(STORAGE_PREFIX + workspaceKey);
    if (!stored) return DEFAULT_GRAPH_LAYERS;
    const parsed = JSON.parse(stored) as Partial<GraphLayers>;
    return {
      folders: parsed.folders ?? DEFAULT_GRAPH_LAYERS.folders,
      references: parsed.references ?? DEFAULT_GRAPH_LAYERS.references,
      backlinks: parsed.backlinks ?? DEFAULT_GRAPH_LAYERS.backlinks,
      brokenLinks: parsed.brokenLinks ?? DEFAULT_GRAPH_LAYERS.brokenLinks,
    };
  } catch {
    return DEFAULT_GRAPH_LAYERS;
  }
}

function WorkspaceMapInner({ files, workspaceKey, onOpenFile }: WorkspaceMapProps) {
  const { t } = useLocale();
  const [layers, setLayers] = useState<GraphLayers>(DEFAULT_GRAPH_LAYERS);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Read after mount: localStorage is unavailable during server rendering, and seeding state from
  // it directly would make the first client render disagree with the server's.
  useEffect(() => {
    setLayers(loadLayers(workspaceKey));
    setSelectedId(null);
  }, [workspaceKey]);

  const updateLayers = useCallback(
    (next: GraphLayers) => {
      setLayers(next);
      try {
        window.localStorage.setItem(STORAGE_PREFIX + workspaceKey, JSON.stringify(next));
      } catch {
        // A view preference is not worth failing the map over.
      }
    },
    [workspaceKey],
  );

  const graph = useMemo(() => buildWorkspaceGraph(files), [files]);
  const counts = useMemo(() => graphCounts(graph), [graph]);
  const { nodes, edges } = useMemo(() => layoutWorkspaceMap(graph, layers, selectedId), [graph, layers, selectedId]);

  const isEmpty = files.length === 0;

  return (
    <div className="h-full w-full" data-testid="workspace-map">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        minZoom={0.1}
        panOnDrag
        panOnScroll
        panOnScrollSpeed={0.8}
        panOnScrollMode={PanOnScrollMode.Free}
        zoomOnPinch
        zoomOnScroll={false}
        proOptions={{ hideAttribution: true }}
        onNodeClick={(_, node) => setSelectedId((current) => (current === node.id ? null : node.id))}
        onNodeDoubleClick={(_, node) => {
          const path = (node.data as { path?: string; kind?: string }).path;
          if (path && (node.data as { kind?: string }).kind === "file") onOpenFile?.(path);
        }}
        onPaneClick={() => setSelectedId(null)}
      >
        <Background gap={20} size={1} />
        <Controls showInteractive={false} />
        <Panel position="top-left">
          <GraphLayerControls layers={layers} counts={counts} onChange={updateLayers} hasSelection={selectedId !== null} />
        </Panel>
        {isEmpty && (
          <Panel position="top-center">
            <p className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-4 py-2 text-sm text-[var(--color-ink-muted)]">
              {t.workspaceMapEmpty}
            </p>
          </Panel>
        )}
      </ReactFlow>
    </div>
  );
}

export function WorkspaceMap(props: WorkspaceMapProps) {
  return (
    <ReactFlowProvider>
      <WorkspaceMapInner {...props} />
    </ReactFlowProvider>
  );
}
