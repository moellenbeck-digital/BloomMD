"use client";

import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Panel,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
  PanOnScrollMode,
  type NodeTypes,
  type EdgeTypes,
  type Node,
  type OnNodeDrag,
  type Viewport,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  BookmarkPlus,
  ChevronLeft,
  ChevronRight,
  ClipboardCopy,
  ClipboardPaste,
  Focus,
  Globe2,
  Link2,
  ListTree,
  Network,
  Pencil,
  Presentation,
  Trash2,
  Redo2,
  Undo2,
} from "lucide-react";
import { useEffect, useCallback, useMemo, useRef, useState } from "react";
import { MindMapNode } from "./MindMapNode";
import { MindMapEdge } from "./MindMapEdge";
import { useMindMapStore, type LocalViewState } from "../hooks/useMindMapStore";
import type { RootRenameEvent } from "../hooks/useMindMapLayout";
import { dropTargetToMoveIntent, findCanvasDropTarget, type CanvasDropTarget } from "../utils/canvas-drag";
import { isNodeVisibleInViewport, focusNodeElement, isCurrentNodeFocusRequest, type NodeFocusRequest } from "../utils/nodeFocus";
import { useLocale } from "../i18n/LocaleContext";

const nodeTypes: NodeTypes = { mindmap: MindMapNode };
const edgeTypes: EdgeTypes = { mindmap: MindMapEdge };

interface SavedLocalView extends LocalViewState {
  id: string;
  name: string;
  viewport: Viewport;
}

function iconButton(active = false): string {
  return `flex h-8 w-8 items-center justify-center rounded-md border transition-colors ${active
    ? "border-[#FF6B35] bg-[#FFF4EE] text-[#C94D20]"
    : "border-[var(--color-border)] bg-[var(--color-surface-raised)] text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-sunken)] hover:text-[var(--color-ink)]"}`;
}

function OutlineView() {
  const doc = useMindMapStore((state) => state.document);
  const selectedNodeId = useMindMapStore((state) => state.selectedNodeId);
  const setSelectedNodeId = useMindMapStore((state) => state.setSelectedNodeId);
  const setEditorVisible = useMindMapStore((state) => state.setEditorVisible);
  const focusNodeId = useMindMapStore((state) => state.focusNodeId);

  const rows = useMemo(() => {
    if (!doc) return [];
    const result: Array<{ id: string; depth: number }> = [];
    const walk = (id: string, depth: number) => {
      const node = doc.nodes.get(id);
      if (!node) return;
      result.push({ id, depth });
      node.children.forEach((childId) => walk(childId, depth + 1));
    };
    if (focusNodeId && doc.nodes.has(focusNodeId)) walk(focusNodeId, 0);
    else for (const node of doc.nodes.values()) if (node.parentId === null) walk(node.id, 0);
    return result;
  }, [doc, focusNodeId]);

  if (!doc) return null;
  return (
    <div className="h-full overflow-auto bg-[var(--color-surface)] px-4 pb-5 pt-28 sm:px-8 sm:py-5" data-testid="outline-view">
      <div className="mx-auto max-w-4xl border-y border-[var(--color-border)]">
        {rows.map(({ id, depth }) => {
          const node = doc.nodes.get(id)!;
          return (
            <button
              key={id}
              type="button"
              onClick={() => {
                setSelectedNodeId(id);
                setEditorVisible(true);
              }}
              className={`flex min-h-11 w-full items-center gap-3 border-b border-[var(--color-border)] px-3 text-left last:border-b-0 ${selectedNodeId === id ? "bg-[#FFF4EE]" : "hover:bg-[var(--color-surface-sunken)]"}`}
              style={{ paddingLeft: `${12 + depth * 24}px` }}
            >
              <span className="w-7 shrink-0 font-mono text-[10px] font-semibold text-[#C94D20]">H{node.level}</span>
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--color-ink)]">{node.title}</span>
              {node.metadata?.kind && node.metadata.kind !== "topic" && (
                <span className="text-xs text-[var(--color-ink-faint)]">{node.metadata.kind}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PresentationView() {
  const { t } = useLocale();
  const doc = useMindMapStore((state) => state.document);
  const selectedNodeId = useMindMapStore((state) => state.selectedNodeId);
  const setSelectedNodeId = useMindMapStore((state) => state.setSelectedNodeId);
  const focusNodeId = useMindMapStore((state) => state.focusNodeId);
  const ordered = useMemo(() => {
    if (!doc) return [];
    const ids: string[] = [];
    const walk = (id: string) => {
      const node = doc.nodes.get(id);
      if (!node) return;
      ids.push(id);
      node.children.forEach(walk);
    };
    if (focusNodeId && doc.nodes.has(focusNodeId)) walk(focusNodeId);
    else for (const node of doc.nodes.values()) if (node.parentId === null) walk(node.id);
    return ids;
  }, [doc, focusNodeId]);
  const currentIndex = Math.max(0, ordered.indexOf(selectedNodeId ?? ""));
  const current = doc?.nodes.get(ordered[currentIndex] ?? "");
  if (!current) return null;
  const websitePreview = (current.metadata?.kind === "web" || current.metadata?.kind === "source") && current.metadata.url
    ? current.metadata
    : null;
  let websiteHost = "";
  if (websitePreview?.url) {
    try { websiteHost = new URL(websitePreview.url).hostname.replace(/^www\./, ""); } catch { /* Keep the URL visible if it is incomplete. */ }
  }

  return (
    <section className="flex h-full flex-col bg-[var(--color-surface)] px-5 pb-5 pt-32 sm:p-10" data-testid="presentation-view">
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center">
        <div className="font-mono text-xs font-semibold uppercase text-[#C94D20]">H{current.level} · {currentIndex + 1}/{ordered.length}</div>
        <h1 className="mt-4 max-w-4xl text-4xl font-semibold leading-tight text-[var(--color-ink)] sm:text-6xl">{current.title}</h1>
        {websitePreview && (
          <article className="mt-7 max-w-2xl overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] shadow-sm" data-testid="presentation-website-preview">
            {websitePreview.previewImage && <img src={websitePreview.previewImage} alt={websitePreview.previewTitle || current.title} loading="lazy" className="max-h-64 w-full object-cover" />}
            <div className="grid gap-2 p-5">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[#C94D20]"><Globe2 size={14} /> {websiteHost || t.website}</div>
              <h2 className="text-xl font-semibold text-[var(--color-ink)]">{websitePreview.previewTitle || current.title}</h2>
              {(websitePreview.previewDescription || current.content) && <p className="text-sm leading-6 text-[var(--color-ink-muted)]">{websitePreview.previewDescription || current.content.slice(0, 280)}</p>}
              <a href={websitePreview.url} target="_blank" rel="noreferrer" className="mt-1 inline-flex w-fit items-center gap-2 text-sm font-semibold text-[#C94D20] hover:underline">{t.openWebsite} <Link2 size={14} /></a>
            </div>
          </article>
        )}
        {current.content && <div className="mt-7 max-w-3xl whitespace-pre-wrap text-lg leading-8 text-[var(--color-ink-muted)]">{current.content}</div>}
      </div>
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between border-t border-[var(--color-border)] pt-4">
        <button type="button" className={iconButton()} disabled={currentIndex === 0} onClick={() => setSelectedNodeId(ordered[currentIndex - 1] ?? null)} aria-label={t.previousNode}><ChevronLeft size={18} /></button>
        <div className="h-1 flex-1 mx-4 bg-[var(--color-border)]"><div className="h-full bg-[#FF6B35]" style={{ width: `${((currentIndex + 1) / ordered.length) * 100}%` }} /></div>
        <button type="button" className={iconButton()} disabled={currentIndex === ordered.length - 1} onClick={() => setSelectedNodeId(ordered[currentIndex + 1] ?? null)} aria-label={t.nextNode}><ChevronRight size={18} /></button>
      </div>
    </section>
  );
}

export interface MindMapCanvasProps {
  /** Mount only nodes intersecting the viewport (enabled by the desktop host). */
  onlyRenderVisibleElements?: boolean;
  onRootRename?: (event: RootRenameEvent) => void;
  /** Opens a host-provided, node-scoped assistant workflow for the selected node. */
  onAskAgent?: () => void;
  /** Activity belonging to the selected node's agent action. */
  agentActivity?: { queuedOrRunning: number; pendingProposals: number };
}

function MindMapCanvasInner({ onRootRename, onAskAgent, agentActivity, onlyRenderVisibleElements = false }: MindMapCanvasProps) {
  const { t } = useLocale();
  const storeNodes = useMindMapStore((state) => state.nodes);
  const storeEdges = useMindMapStore((state) => state.edges);
  const document = useMindMapStore((state) => state.document);
  const selectedNodeId = useMindMapStore((state) => state.selectedNodeId);
  const selectedNodeIds = useMindMapStore((state) => state.selectedNodeIds);
  const setSelectedNodeId = useMindMapStore((state) => state.setSelectedNodeId);
  const setSelectedNodeIds = useMindMapStore((state) => state.setSelectedNodeIds);
  const moveNode = useMindMapStore((state) => state.moveNode);
  const relayout = useMindMapStore((state) => state.relayout);
  const edgeMode = useMindMapStore((state) => state.edgeMode);
  const setEdgeMode = useMindMapStore((state) => state.setEdgeMode);
  const canvasMode = useMindMapStore((state) => state.canvasMode);
  const setCanvasMode = useMindMapStore((state) => state.setCanvasMode);
  const focusNodeId = useMindMapStore((state) => state.focusNodeId);
  const setFocusNodeId = useMindMapStore((state) => state.setFocusNodeId);
  const collapsedIds = useMindMapStore((state) => state.collapsedIds);
  const copyBranches = useMindMapStore((state) => state.copyBranches);
  const pasteBranches = useMindMapStore((state) => state.pasteBranches);
  const layoutPending = useMindMapStore((state) => state.layoutPending);
  const layoutFailed = useMindMapStore((state) => state.layoutFailed);
  const statusMessage = useMindMapStore((state) => state.statusMessage);
  const setStatusMessage = useMindMapStore((state) => state.setStatusMessage);
  const applyViewState = useMindMapStore((state) => state.applyViewState);
  const undo = useMindMapStore((state) => state.undo);
  const redo = useMindMapStore((state) => state.redo);
  const canUndo = useMindMapStore((state) => state.canUndo());
  const canRedo = useMindMapStore((state) => state.canRedo());

  const [nodes, setNodes, onNodesChange] = useNodesState(storeNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(storeEdges);
  const [dropTarget, setDropTarget] = useState<CanvasDropTarget | null>(null);
  const [savedViews, setSavedViews] = useState<SavedLocalView[]>([]);
  const [selectedViewId, setSelectedViewId] = useState("");
  const draggedNodeRef = useRef<string | null>(null);
  const fittedDocumentRef = useRef<string | null>(null);
  const pendingFocusRef = useRef<NodeFocusRequest | null>(null);
  const { fitView, getNode, getViewport, setCenter, setViewport } = useReactFlow();
  const viewStorageKey = `bloommd:views:${document?.frontmatter.id || document?.filePath || "none"}`;
  const documentViewKey = document ? `${document.frontmatter.id}:${document.filePath}` : null;

  useEffect(() => { setNodes(storeNodes); setEdges(storeEdges); }, [storeNodes, storeEdges, setNodes, setEdges]);
  useEffect(() => {
    if (canvasMode !== "map" || !documentViewKey || storeNodes.length === 0 || fittedDocumentRef.current === documentViewKey) return;
    fittedDocumentRef.current = documentViewKey;
    const frame = requestAnimationFrame(() => { void fitView({ padding: 0.3, duration: 0 }); });
    return () => cancelAnimationFrame(frame);
  }, [canvasMode, documentViewKey, fitView, storeNodes.length]);
  useEffect(() => {
    if (canvasMode !== "map") return;
    const nodesContainer = window.document.querySelector<HTMLElement>("#mindmap-canvas .react-flow__nodes");
    if (!nodesContainer) return;

    nodesContainer.setAttribute("role", "tree");
    nodesContainer.setAttribute("aria-label", t.mindMap);
    return () => {
      nodesContainer.removeAttribute("role");
      nodesContainer.removeAttribute("aria-label");
    };
  }, [canvasMode, t.mindMap]);
  useEffect(() => {
    const focusNode = (event: Event) => {
      const { nodeId, requestId, reveal } = (event as CustomEvent<Partial<NodeFocusRequest>>).detail ?? {};
      if (!nodeId || typeof requestId !== "number" || !isCurrentNodeFocusRequest(requestId)) return;
      pendingFocusRef.current = { nodeId, requestId, reveal };
      requestAnimationFrame(() => {
        if (!isCurrentNodeFocusRequest(requestId)) return;
        focusNodeElement(nodeId);
        if (reveal === false) { pendingFocusRef.current = null; return; }
        const node = getNode(nodeId);
        if (!node) return;
        const width = node.measured?.width ?? node.width ?? 180;
        const height = node.measured?.height ?? node.height ?? 54;
        const viewport = getViewport();
        const canvas = window.document.getElementById("mindmap-canvas");
        if (canvas && isNodeVisibleInViewport(
          { ...node.position, width, height }, viewport,
          { width: canvas.clientWidth, height: canvas.clientHeight },
        )) {
          pendingFocusRef.current = null;
          return;
        }
        void setCenter(node.position.x + width / 2, node.position.y + height / 2, {
          duration: 250,
          zoom: viewport.zoom,
        }).then(() => {
          // A culled node mounts after the viewport reaches it. Focus only the current request.
          requestAnimationFrame(() => {
            if (isCurrentNodeFocusRequest(requestId)) {
              focusNodeElement(nodeId);
              pendingFocusRef.current = null;
            }
          });
        });
      });
    };
    if (pendingFocusRef.current) {
      const pending = pendingFocusRef.current;
      if (isCurrentNodeFocusRequest(pending.requestId)) {
        focusNode(new window.CustomEvent("bloommd:focus-node", { detail: pending }));
      } else pendingFocusRef.current = null;
    }
    window.addEventListener("bloommd:focus-node", focusNode);
    return () => window.removeEventListener("bloommd:focus-node", focusNode);
  }, [getNode, getViewport, setCenter, storeNodes]);
  useEffect(() => {
    try { setSavedViews(JSON.parse(localStorage.getItem(viewStorageKey) ?? "[]") as SavedLocalView[]); }
    catch { setSavedViews([]); }
  }, [viewStorageKey]);

  const onNodeDragStart: OnNodeDrag<Node> = useCallback((_, node) => { draggedNodeRef.current = node.id; }, []);
  const onNodeDrag: OnNodeDrag<Node> = useCallback((_, node) => {
    setDropTarget(findCanvasDropTarget(nodes, node.id, {
      x: node.position.x + (node.measured?.width ?? 180) / 2,
      y: node.position.y + (node.measured?.height ?? 54) / 2,
    }));
  }, [nodes]);
  const onNodeDragStop: OnNodeDrag<Node> = useCallback(() => {
    const draggedId = draggedNodeRef.current;
    draggedNodeRef.current = null;
    const target = dropTarget;
    setDropTarget(null);
    if (!draggedId || !target || !document) { relayout(); return; }
    const moveIntent = dropTargetToMoveIntent(document, target);
    if (!moveIntent) { relayout(); return; }
    moveNode(draggedId, moveIntent.newParentId, moveIntent.index);
  }, [document, dropTarget, moveNode, relayout]);

  const saveLocalView = useCallback(() => {
    const next: SavedLocalView = {
      id: crypto.randomUUID(),
      name: `View ${savedViews.length + 1}`,
      viewport: getViewport(),
      focusNodeId,
      collapsedIds: [...collapsedIds],
      edgeMode,
    };
    const updated = [...savedViews, next];
    setSavedViews(updated);
    setSelectedViewId(next.id);
    localStorage.setItem(viewStorageKey, JSON.stringify(updated));
  }, [collapsedIds, edgeMode, focusNodeId, getViewport, savedViews, viewStorageKey]);

  const loadView = useCallback((id: string) => {
    const view = savedViews.find((entry) => entry.id === id);
    if (!view) return;
    applyViewState(view);
    void setViewport(view.viewport, { duration: 250 });
  }, [applyViewState, savedViews, setViewport]);

  const renameView = useCallback((id: string) => {
    const view = savedViews.find((entry) => entry.id === id);
    if (!view) return;
    const name = window.prompt(t.viewNamePrompt, view.name)?.trim();
    if (!name || name === view.name) return;
    const updated = savedViews.map((entry) => entry.id === id ? { ...entry, name } : entry);
    setSavedViews(updated);
    localStorage.setItem(viewStorageKey, JSON.stringify(updated));
  }, [savedViews, t.viewNamePrompt, viewStorageKey]);

  const deleteView = useCallback((id: string) => {
    const view = savedViews.find((entry) => entry.id === id);
    if (!view || !window.confirm(t.deleteSavedViewConfirm.replace("%name%", view.name))) return;
    const updated = savedViews.filter((entry) => entry.id !== id);
    setSavedViews(updated);
    localStorage.setItem(viewStorageKey, JSON.stringify(updated));
  }, [savedViews, t.deleteSavedViewConfirm, viewStorageKey]);

  const dropPositionLabel = dropTarget?.position === "before"
    ? t.dropBefore
    : dropTarget?.position === "after"
      ? t.dropAfter
      : t.dropInside;

  const styledNodes = useMemo(() => nodes.map((node) => ({
    ...node,
    data: {
      ...node.data,
      dropPosition: dropTarget?.nodeId === node.id ? dropTarget.position : undefined,
      ...(node.id === document?.rootId && onRootRename ? { onRootRename } : {}),
      ...(node.id === selectedNodeId && onAskAgent ? { onAskAgent, agentActivity } : {}),
    },
  })), [agentActivity, document?.rootId, dropTarget, nodes, onAskAgent, onRootRename, selectedNodeId]);

  const modeToolbar = (
    <div className="absolute left-3 top-3 z-20 flex max-w-[calc(100%-1.5rem)] flex-wrap items-center gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-1 shadow-sm" aria-label={t.canvasModes} data-testid="view-mode-toggle">
      <button type="button" className={iconButton(canvasMode === "map")} onClick={() => setCanvasMode("map")} title={t.mindMap} aria-label={t.mindMap} data-testid="view-mode-map"><Network size={16} /></button>
      <button type="button" className={iconButton(canvasMode === "outline")} onClick={() => setCanvasMode("outline")} title={t.outline} aria-label={t.outline} data-testid="view-mode-outline"><ListTree size={16} /></button>
      <button type="button" className={iconButton(canvasMode === "presentation")} onClick={() => setCanvasMode("presentation")} title={t.presentation} aria-label={t.presentation} data-testid="view-mode-presentation"><Presentation size={16} /></button>
      <span className="mx-1 h-5 w-px bg-[var(--color-border)]" />
      <label className="sr-only" htmlFor="edge-mode">{t.edgeMode}</label>
      <select id="edge-mode" className="h-8 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-2 text-xs text-[var(--color-ink)]" value={edgeMode} onChange={(event) => setEdgeMode(event.target.value as typeof edgeMode)} aria-label={t.edgeMode} data-testid="edge-mode">
        <option value="hierarchy">{t.structure}</option>
        <option value="links">{t.links}</option>
        <option value="backlinks">{t.backlinks}</option>
        <option value="all">{t.allRelations}</option>
      </select>
      <span className="mx-1 h-5 w-px bg-[var(--color-border)]" />
      <button type="button" className={iconButton()} disabled={!canUndo} onClick={undo} title={`${t.undo} (Cmd/Ctrl+Z)`} aria-label={t.undo} data-testid="canvas-undo"><Undo2 size={16} /></button>
      <button type="button" className={iconButton()} disabled={!canRedo} onClick={redo} title={`${t.redo} (Cmd/Ctrl+Shift+Z)`} aria-label={t.redo} data-testid="canvas-redo"><Redo2 size={16} /></button>
      <span className="mx-1 h-5 w-px bg-[var(--color-border)]" />
      <button type="button" className={iconButton(Boolean(focusNodeId))} disabled={!selectedNodeId} onClick={() => setFocusNodeId(focusNodeId ? null : selectedNodeId)} title={focusNodeId ? t.exitFocus : t.focusBranch} aria-label={focusNodeId ? t.exitFocus : t.focusBranch} data-testid="canvas-focus"><Focus size={16} /></button>
      <button type="button" className={iconButton()} disabled={selectedNodeIds.length === 0} onClick={() => copyBranches()} title={t.copyBranches} aria-label={t.copyBranches} data-testid="canvas-copy"><ClipboardCopy size={16} /></button>
      <button type="button" className={iconButton()} onClick={() => pasteBranches()} title={t.pasteBranches} aria-label={t.pasteBranches} data-testid="canvas-paste"><ClipboardPaste size={16} /></button>
      <button type="button" className={iconButton()} onClick={saveLocalView} title={t.saveLocalView} aria-label={t.saveLocalView}><BookmarkPlus size={16} /></button>
      {savedViews.length > 0 && <>
        <select className="h-8 max-w-32 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-2 text-xs text-[var(--color-ink)]" value={selectedViewId} onChange={(event) => { setSelectedViewId(event.target.value); loadView(event.target.value); }} aria-label={t.loadSavedView}><option value="" disabled>{t.views}</option>{savedViews.map((view) => <option key={view.id} value={view.id}>{view.name}</option>)}</select>
        <button type="button" className={iconButton()} disabled={!selectedViewId} onClick={() => renameView(selectedViewId)} title={t.renameSavedView} aria-label={t.renameSavedView}><Pencil size={15} /></button>
        <button type="button" className={iconButton()} disabled={!selectedViewId} onClick={() => { deleteView(selectedViewId); setSelectedViewId(""); }} title={t.deleteSavedView} aria-label={t.deleteSavedView}><Trash2 size={15} /></button>
      </>}
    </div>
  );

  return (
    <div
      className="relative h-full w-full"
      id="mindmap-canvas"
      tabIndex={-1}
      data-testid="mindmap-canvas"
      onClickCapture={(event) => {
        const target = event.target as HTMLElement | null;
        if (target?.closest('[data-testid="node-action-ask-agent"]')) {
          onAskAgent?.();
          return;
        }
        if (target?.closest(".react-flow__pane")) setSelectedNodeId(null);
      }}
    >
      {modeToolbar}
      {(layoutPending || layoutFailed) && <div role="status" className="absolute left-1/2 top-16 z-10 -translate-x-1/2 rounded-md bg-[var(--color-surface-raised)] px-3 py-2 text-sm text-[var(--color-ink)] shadow-md">
        {layoutPending ? t.layoutInProgress : t.layoutFailed}
        {layoutFailed && <button type="button" onClick={relayout} className="ml-3 underline">{t.retryLayout}</button>}
      </div>}
      {canvasMode === "outline" ? <OutlineView /> : canvasMode === "presentation" ? <PresentationView /> : (
        <ReactFlow
            onlyRenderVisibleElements={onlyRenderVisibleElements}
            nodes={styledNodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={(_, node) => setSelectedNodeId(node.id)}
            onPaneClick={() => setSelectedNodeId(null)}
            onSelectionChange={({ nodes: selected }) => {
            // React Flow can briefly emit an empty selection while nodes are being replaced after a Yjs edit.
            // Keep the active editor open; an explicit pane click still clears selection below.
            if (selected.length === 0) return;

            const storeState = useMindMapStore.getState();
            const availableNodeIds = new Set(storeState.nodes.map((node) => node.id));
            const selectedIds = selected
              .map((node) => node.id)
              .filter((nodeId) => availableNodeIds.has(nodeId));
            if (selectedIds.length === 0) return;

            const activeNodeId = storeState.selectedNodeId;
            // During a node rename React Flow may emit the previous selection after its node
            // elements were reconciled. Never let that transient snapshot steal the store's
            // active node; a real click/keyboard mutation updates the store first.
            if (activeNodeId && !selectedIds.includes(activeNodeId)) return;

            const orderedIds = activeNodeId && selectedIds.includes(activeNodeId)
              ? [...selectedIds.filter((nodeId) => nodeId !== activeNodeId), activeNodeId]
              : selectedIds;

            setSelectedNodeIds(orderedIds);
            }}
            onNodeDragStart={onNodeDragStart}
            onNodeDrag={onNodeDrag}
            onNodeDragStop={onNodeDragStop}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            fitView
            fitViewOptions={{ padding: 0.3 }}
            minZoom={0.1}
            maxZoom={2}
            deleteKeyCode={null}
            selectionKeyCode="Shift"
            multiSelectionKeyCode="Shift"
            selectionOnDrag
            panOnDrag
            panOnScroll
            panOnScrollSpeed={0.8}
            panOnScrollMode={PanOnScrollMode.Free}
            zoomOnDoubleClick={false}
            zoomOnPinch
            zoomOnScroll={false}
            proOptions={{ hideAttribution: true }}
          >
            <Background color="#D8D4CE" gap={24} size={1} />
            <Controls position="bottom-right" data-testid="react-flow-controls" />
            <MiniMap data-testid="react-flow-minimap" className="hidden sm:block" position="bottom-left" nodeColor={(node) => (node.data as { metadata?: { kind?: string } }).metadata?.kind === "portal" ? "#2684FF" : "#FF6B35"} maskColor="rgba(26,26,26,0.06)" />
            {dropTarget && <Panel position="bottom-center"><div className="rounded-md border border-[#FF6B35] bg-[var(--color-surface-raised)] px-3 py-1.5 text-xs font-semibold text-[var(--color-ink)] shadow-md">{dropPositionLabel}</div></Panel>}
            {statusMessage && (
              <Panel position="top-center" className="mt-14">
                <div role="status" className="flex items-center gap-3 rounded-md border border-[#FF6B35] bg-[var(--color-surface-raised)] px-3 py-1.5 text-xs text-[var(--color-ink)] shadow-md">
                  <span>{statusMessage}</span>
                  <button type="button" onClick={() => setStatusMessage(null)} aria-label={t.dismissMessage} className="text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]">×</button>
                </div>
              </Panel>
            )}
        </ReactFlow>
      )}
    </div>
  );
}

export function MindMapCanvas(props: MindMapCanvasProps = {}) {
  return <ReactFlowProvider><MindMapCanvasInner {...props} /></ReactFlowProvider>;
}
