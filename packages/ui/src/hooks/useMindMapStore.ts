import * as Y from "yjs";
import { create } from "zustand";
import type { MindMapDocument, MindMapNodeMetadata } from "@bloommd/core/browser";
import {
  HeadingDepthError,
  MAX_HEADING_LEVEL,
  isWorkspaceMindMap,
  documentToYDoc,
  yDocToDocument,
  yRenameNode,
  yMoveNode,
  yUpdateContentDiff,
  yAddNode,
  yDeleteNode,
  yUpdateFrontmatter,
  yUpdateNodeMetadata,
} from "@bloommd/core/browser";
import type { Node, Edge } from "@xyflow/react";
import { type EdgeMode, type MindMapNodeData } from "./useMindMapLayout";
import { initialWorkspaceCollapse } from "./workspace-view";
import { computeVisibleLayout } from "./visible-layout";
import { SyncProvider } from "../sync/SyncProvider";
import type { AwarenessIdentity, SyncFailure, SyncStatus } from "../sync/types";
import { cancelPendingNodeFocus, requestNodeFocus } from "../utils/nodeFocus";

export interface RemoteUser {
  clientID: number;
  name: string;
  email?: string;
  color: string;
  selectedNodeId: string | null;
}

export type CanvasMode = "map" | "outline" | "presentation";

export interface BranchSnapshot {
  title: string;
  content: string;
  metadata?: MindMapNodeMetadata;
  children: BranchSnapshot[];
}

export interface LocalViewState {
  focusNodeId: string | null;
  collapsedIds: string[];
  edgeMode: EdgeMode;
}

interface MindMapState {
  layoutPending: boolean;
  layoutFailed: boolean;
  document: MindMapDocument | null;
  readOnly: boolean;
  nodes: Node<MindMapNodeData>[];
  edges: Edge[];
  selectedNodeId: string | null;
  selectedNodeIds: string[];
  autoEditNodeId: string | null;
  lastCreatedNodeId: string | null;
  lastCreatedParentId: string | null;
  lastCreatedInitialTitle: string | null;
  editorVisible: boolean;
  collapsedIds: Set<string>;
  yDoc: Y.Doc | null;
  undoManager: Y.UndoManager | null;
  syncProvider: SyncProvider | null;
  syncStatus: SyncStatus;
  syncFailure: SyncFailure | null;
  remoteUsers: RemoteUser[];
  edgeMode: EdgeMode;
  canvasMode: CanvasMode;
  focusNodeId: string | null;
  copiedBranches: BranchSnapshot[];
  /** Last blocked structural edit, shown to the user and cleared on the next successful action. */
  statusMessage: string | null;

  setStatusMessage: (message: string | null) => void;
  setDocument: (doc: MindMapDocument | null) => void;
  setDocumentFilePath: (filePath: string) => void;
  setStorageMetadata: (storage: MindMapDocument["storage"]) => void;
  loadFromSync: (filePath: string, syncUrl: string, awarenessIdentity?: AwarenessIdentity) => void;
  connectSync: (syncUrl: string, awarenessIdentity?: AwarenessIdentity) => void;
  connectSyncUrl: (websocketUrl: string, refreshUrl?: () => Promise<string>, awarenessIdentity?: AwarenessIdentity) => void;
  retrySync: () => void;
  disconnectSync: () => Promise<void>;
  setSelectedNodeId: (id: string | null) => void;
  setSelectedNodeIds: (ids: string[]) => void;
  setAutoEditNodeId: (id: string | null) => void;
  /** Request inline rename after React Flow has mounted a newly-created node. */
  requestAutoEditNode: (id: string) => void;
  setEditorVisible: (visible: boolean) => void;
  toggleEditor: () => void;
  toggleCollapse: (nodeId: string) => void;
  updateNodeContent: (nodeId: string, content: string) => void;
  updateNodeMetadata: (nodeId: string, metadata: MindMapNodeMetadata | undefined) => void;
  renameNode: (nodeId: string, newTitle: string) => void;
  moveNode: (nodeId: string, newParentId: string, index?: number) => void;
  addChildNode: (parentId: string, title: string) => string | null;
  addSiblingNode: (nodeId: string, title: string) => string | null;
  deleteNodeAction: (nodeId: string) => string | null;
  undo: () => string | null;
  redo: () => string | null;
  canUndo: () => boolean;
  canRedo: () => boolean;
  relayout: () => void;
  setEdgeMode: (mode: EdgeMode) => void;
  setCanvasMode: (mode: CanvasMode) => void;
  setFocusNodeId: (nodeId: string | null) => void;
  copyBranches: (nodeIds?: string[]) => BranchSnapshot[];
  pasteBranches: (parentId?: string) => string[];
  applyViewState: (view: LocalViewState) => void;
}

let layoutWorkerFactory: (() => Worker) | null = null;
let activeLayoutWorker: Worker | null = null;
let layoutGeneration = 0;

/** Hosts opt into their bundler's worker entrypoint; other consumers remain synchronous. */
export function configureLayoutWorker(factory: (() => Worker) | null): void {
  cancelLayout();
  layoutWorkerFactory = factory;
}

function cancelLayout(): void {
  layoutGeneration += 1;
  activeLayoutWorker?.terminate();
  activeLayoutWorker = null;
}

function computeLayout(
  doc: MindMapDocument, collapsedIds: Set<string>, focusNodeId: string | null, edgeMode: EdgeMode,
): ReturnType<typeof computeVisibleLayout> {
  cancelLayout();
  if (!layoutWorkerFactory) return computeVisibleLayout(doc, collapsedIds, focusNodeId, edgeMode);
  const generation = layoutGeneration;
  const previous = useMindMapStore.getState();
  // Do not carry another document's geometry into a new workspace.
  const retained = previous.document?.filePath === doc.filePath
    ? { nodes: previous.nodes, edges: previous.edges } : { nodes: [], edges: [] };
  useMindMapStore.setState({ layoutPending: true, layoutFailed: false });
  const fail = (error: unknown) => {
    if (generation !== layoutGeneration) return;
    console.error("Background layout failed", error);
    if (typeof window !== "undefined") window.dispatchEvent(new window.CustomEvent("bloommd:layout-error", { detail: typeof error === "object" && error !== null && "message" in error ? String(error.message) : String(error) }));
    cancelLayout();
    useMindMapStore.setState({ layoutPending: false, layoutFailed: true });
  };
  try {
    const worker = layoutWorkerFactory();
    activeLayoutWorker = worker;
    worker.onmessage = (event: MessageEvent<ReturnType<typeof computeVisibleLayout>>) => {
      if (generation !== layoutGeneration) return;
      worker.terminate();
      activeLayoutWorker = null;
      useMindMapStore.setState({ ...event.data, layoutPending: false, layoutFailed: false });
      if (typeof window !== "undefined") window.dispatchEvent(new window.CustomEvent("bloommd:layout-ready", { detail: { nodeCount: event.data.nodes.length } }));
    };
    worker.onerror = fail;
    worker.onmessageerror = fail;
    worker.postMessage({ doc, collapsedIds, focusNodeId, edgeMode });
  } catch (error) {
    fail(error);
  }
  return retained;
}

function fallbackForRemovedSelection(
  previousDoc: MindMapDocument | null,
  currentDoc: MindMapDocument,
  selectedNodeId: string | null,
): string | null {
  if (!selectedNodeId || currentDoc.nodes.has(selectedNodeId)) return null;

  const previousNode = previousDoc?.nodes.get(selectedNodeId);
  const parentId = previousNode?.parentId;
  if (parentId && currentDoc.nodes.has(parentId)) return parentId;
  return currentDoc.rootId;
}

function newlyPresentNodeId(previousDoc: MindMapDocument | null, currentDoc: MindMapDocument): string | null {
  for (const node of currentDoc.nodes.values()) {
    if (!previousDoc?.nodes.has(node.id)) return node.id;
  }
  return null;
}

function buildSyncWebSocketUrl(syncUrl: string, filename: string): string {
  let base = syncUrl.endsWith("/") ? syncUrl.slice(0, -1) : syncUrl;
  let token: string | undefined;

  try {
    const parsed = new URL(syncUrl);
    token ??= parsed.searchParams.get("token") ?? undefined;
    parsed.search = "";
    base = parsed.toString().replace(/\/$/, "");
  } catch {
    // Keep the original string for relative or non-standard URLs.
  }

  const url = `${base}/ws/${encodeURIComponent(filename)}`;
  if (!token) return url;
  return `${url}?token=${encodeURIComponent(token)}`;
}

function emitSyncE2EEvent(name: string, detail: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(`bloommd:sync:${name}`, { detail }));
}

/**
 * Structural edits can be refused by the core operations (heading depth, circular moves). The
 * refusal must reach the user instead of looking like an unresponsive canvas.
 */
function reportBlockedEdit(set: (partial: Partial<MindMapState>) => void, error: unknown): null {
  const message = error instanceof Error ? error.message : "This change is not possible.";
  console.warn("[bloommd] structural edit blocked:", message);
  set({ statusMessage: message });
  return null;
}

let requestAutoEditToken = 0;

function scheduleAfterRender(callback: () => void): void {
  if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
    window.requestAnimationFrame(() => window.requestAnimationFrame(callback));
    return;
  }
  setTimeout(() => setTimeout(callback, 0), 0);
}

function isAutoEditTargetVisible(id: string): boolean {
  if (typeof document === "undefined") return true;
  const canvas = document.getElementById("mindmap-canvas");
  if (!canvas || !canvas.clientWidth || !canvas.clientHeight) return true;
  const node = document.querySelector<HTMLElement>(`[data-node-id="${id}"]`);
  if (!node) return false;
  const bounds = node.getBoundingClientRect();
  const viewport = canvas.getBoundingClientRect();
  return bounds.left >= viewport.left && bounds.top >= viewport.top &&
    bounds.right <= viewport.right && bounds.bottom <= viewport.bottom;
}

export const useMindMapStore = create<MindMapState>((set, get) => ({
  layoutPending: false,
  layoutFailed: false,
  document: null,
  readOnly: false,
  nodes: [],
  edges: [],
  selectedNodeId: null,
  selectedNodeIds: [],
  autoEditNodeId: null,
  lastCreatedNodeId: null,
  lastCreatedParentId: null,
  lastCreatedInitialTitle: null,
  editorVisible: false,
  collapsedIds: new Set(),
  yDoc: null,
  undoManager: null,
  syncProvider: null,
  syncStatus: "disconnected" as SyncStatus,
  syncFailure: null,
  remoteUsers: [],
  edgeMode: "hierarchy",
  canvasMode: "map",
  focusNodeId: null,
  copiedBranches: [],
  statusMessage: null,

  setStatusMessage: (statusMessage) => set({ statusMessage }),

  setDocument: (doc) => {
    cancelPendingNodeFocus();
    cancelLayout();
    // A status message belongs to the document it was raised for; never carry it across navigation.
    set({ layoutPending: false, layoutFailed: false, statusMessage: null });
    // Cleanup previous sync provider FIRST (before destroying Y.Doc)
    const prevProvider = get().syncProvider;
    if (prevProvider) prevProvider.destroy();

    // Cleanup previous Y.Doc
    const prev = get().yDoc;
    if (prev) prev.destroy();

    // Handle null/reset case
    if (!doc) {
      set({ yDoc: null, undoManager: null, syncProvider: null, syncStatus: "disconnected", syncFailure: null, remoteUsers: [], document: null, readOnly: false, nodes: [], edges: [], selectedNodeId: null, selectedNodeIds: [], lastCreatedNodeId: null, lastCreatedParentId: null, lastCreatedInitialTitle: null });
      return;
    }

    // Create Y.Doc from MindMapDocument
    const yDoc = documentToYDoc(doc);

    // UndoManager tracks structural changes AND content edits
    const undoManager = new Y.UndoManager(
      [yDoc.getMap("nodes"), yDoc.getMap("nodeContents")],
      { captureTimeout: 500 },
    );

    // Observe structural changes → recompute layout + fix stale selection
    const yNodes = yDoc.getMap("nodes");
    let observedDocument: MindMapDocument | null = doc;
    yNodes.observeDeep(() => {
      const currentDoc = yDocToDocument(yDoc);
      const { collapsedIds, focusNodeId, edgeMode } = get();
      const { nodes, edges } = computeLayout(currentDoc, collapsedIds, focusNodeId, edgeMode);

      const sel = get().selectedNodeId;
      const fallbackId = fallbackForRemovedSelection(observedDocument, currentDoc, sel);
      const selectionUpdate = fallbackId
        ? { selectedNodeId: fallbackId, selectedNodeIds: [fallbackId] }
        : {};

      set({ document: currentDoc, nodes, edges, ...selectionUpdate });
      observedDocument = currentDoc;
      if (fallbackId) requestNodeFocus(fallbackId);
    });

    // Observe content changes (remote edits) → update document for editor re-render
    const yNodeContents = yDoc.getMap<Y.Text>("nodeContents");
    yNodeContents.observeDeep(() => {
      const currentDoc = get().document;
      if (!currentDoc) return;

      let changed = false;
      const updatedNodes = new Map(currentDoc.nodes);

      for (const [id, node] of updatedNodes) {
        const yText = yNodeContents.get(id)?.toString() ?? "";
        if (yText !== node.content) {
          updatedNodes.set(id, { ...node, content: yText });
          changed = true;
        }
      }

      if (changed) {
        const updatedDoc = { ...currentDoc, nodes: updatedNodes };
        const { collapsedIds, focusNodeId, edgeMode } = get();
        const { nodes, edges } = computeLayout(updatedDoc, collapsedIds, focusNodeId, edgeMode);
        set({ document: updatedDoc, nodes, edges });
      }
    });

    // Initial layout + select root node. Workspace documents should show cross-links immediately.
    const collapsedIds = initialWorkspaceCollapse(doc, get().document, get().collapsedIds);
    const edgeMode = doc.derived?.kind === "workspace" ? "all" : get().edgeMode;
    const { nodes, edges } = computeLayout(doc, collapsedIds, null, edgeMode);
    set({ collapsedIds, yDoc, undoManager, syncProvider: null, syncStatus: "disconnected", syncFailure: null, remoteUsers: [], document: doc, readOnly: isWorkspaceMindMap(doc) || doc.storage?.permission === "read", nodes, edges, selectedNodeId: doc.rootId, selectedNodeIds: [doc.rootId], lastCreatedNodeId: null, lastCreatedParentId: null, lastCreatedInitialTitle: null, focusNodeId: null, edgeMode });
  },

  setStorageMetadata: (storage) => {
    const { document: doc, yDoc } = get();
    if (!doc) return;
    if (yDoc) {
      yDoc.getMap("meta").set("storage", storage ? structuredClone(storage) : null);
    }
    set({ document: { ...doc, storage }, readOnly: isWorkspaceMindMap(doc) || storage?.permission === "read" });
  },

  setDocumentFilePath: (filePath) => {
    const { document: doc, yDoc } = get();
    if (!doc) return;
    if (yDoc) yDoc.getMap("meta").set("filePath", filePath);
    set({ document: { ...doc, filePath } });
  },

  loadFromSync: (filePath, syncUrl, awarenessIdentity) => {
    cancelPendingNodeFocus();
    cancelLayout();
    set({ layoutPending: false, layoutFailed: false });
    // Cleanup previous state
    const prevProvider = get().syncProvider;
    if (prevProvider) prevProvider.destroy();
    const prev = get().yDoc;
    if (prev) prev.destroy();

    // Create empty Y.Doc — sync server will populate it via SyncStep1
    const yDoc = new Y.Doc();

    const undoManager = new Y.UndoManager(
      [yDoc.getMap("nodes"), yDoc.getMap("nodeContents")],
      { captureTimeout: 500 },
    );

    // Observe structural changes → recompute layout when sync data arrives
    const yNodes = yDoc.getMap("nodes");
    let observedDocument: MindMapDocument | null = null;
    yNodes.observeDeep(() => {
      const currentDoc = yDocToDocument(yDoc);
      // Skip if doc has no nodes yet (still waiting for sync)
      if (currentDoc.nodes.size === 0) return;
      const { collapsedIds, focusNodeId, edgeMode } = get();
      const { nodes, edges } = computeLayout(currentDoc, collapsedIds, focusNodeId, edgeMode);
      const sel = get().selectedNodeId;
      const fallbackId = fallbackForRemovedSelection(observedDocument, currentDoc, sel);
      const selectionUpdate = fallbackId
        ? { selectedNodeId: fallbackId, selectedNodeIds: [fallbackId] }
        : {};
      set({ document: currentDoc, nodes, edges, ...selectionUpdate });
      observedDocument = currentDoc;
      if (fallbackId) requestNodeFocus(fallbackId);
    });

    // Observe content changes
    const yNodeContents = yDoc.getMap<Y.Text>("nodeContents");
    yNodeContents.observeDeep(() => {
      const currentDoc = get().document;
      if (!currentDoc) return;
      let changed = false;
      const updatedNodes = new Map(currentDoc.nodes);
      for (const [id, node] of updatedNodes) {
        const yText = yNodeContents.get(id)?.toString() ?? "";
        if (yText !== node.content) {
          updatedNodes.set(id, { ...node, content: yText });
          changed = true;
        }
      }
      if (changed) {
        const updatedDoc = { ...currentDoc, nodes: updatedNodes };
        const { collapsedIds, focusNodeId, edgeMode } = get();
        const { nodes, edges } = computeLayout(updatedDoc, collapsedIds, focusNodeId, edgeMode);
        set({ document: updatedDoc, nodes, edges });
      }
    });

    // Set initial empty state
    set({
      yDoc, undoManager,
      syncProvider: null, syncStatus: "disconnected", syncFailure: null, remoteUsers: [],
      document: null, readOnly: false, nodes: [], edges: [],
      selectedNodeId: null,
      selectedNodeIds: [],
      lastCreatedNodeId: null,
      lastCreatedParentId: null,
      lastCreatedInitialTitle: null,
    });

    // Connect sync immediately — server will populate the Y.Doc
    const filename = filePath.split("/").pop() ?? "";
    if (!filename) return;

    const url = buildSyncWebSocketUrl(syncUrl, filename);
    const provider = new SyncProvider({
      url,
      doc: yDoc,
      awarenessIdentity,
      onStatusChange: (status) => {
        set({ syncStatus: status, ...(status !== "failed" ? { syncFailure: null } : {}) });
        // Keep the last known collaborators during an automatic reconnect. Explicit provider
        // destruction and access revocation clear presence below.
      },
      onAccessRevoked: () => {
        set({
          readOnly: true,
          syncStatus: "disconnected",
          remoteUsers: [],
          statusMessage: "Der Zugriff auf diesen Workspace wurde entzogen.",
        });
      },
      onFailure: (failure) => set({ syncFailure: failure, remoteUsers: [] }),
      onAwarenessChange: (states) => {
        const localClientID = yDoc.clientID;
        const users: RemoteUser[] = [];
        for (const [clientID, state] of states) {
          if (clientID === localClientID || !state) continue;
          users.push({
            clientID,
            name: state.name ?? `User ${clientID % 1000}`,
            email: state.email,
            color: state.color ?? "#999",
            selectedNodeId: state.selectedNodeId ?? null,
          });
        }
        set({ remoteUsers: users });
      },
    });

    set({ syncProvider: provider, syncStatus: "connecting" });
    provider.connect();
  },

  connectSync: (syncUrl, awarenessIdentity) => {
    const doc = get().document;
    if (!doc) return;
    const filename = doc.filePath.split("/").pop() ?? "";
    if (!filename) return;
    const websocketUrl = buildSyncWebSocketUrl(syncUrl, filename);
    emitSyncE2EEvent("connect", {});
    get().connectSyncUrl(websocketUrl, undefined, awarenessIdentity);
  },

  connectSyncUrl: (websocketUrl, refreshUrl, awarenessIdentity) => {
    const { yDoc, syncProvider: existing, document: doc } = get();
    if (!yDoc || !doc) return;

    if (existing) existing.destroy();
    const provider = new SyncProvider({
      url: websocketUrl,
      doc: yDoc,
      awarenessIdentity,
      refreshUrl,
      onStatusChange: (status) => {
        emitSyncE2EEvent("status", { status });
        set({ syncStatus: status, ...(status !== "failed" ? { syncFailure: null } : {}) });
        // Keep the last known collaborators during an automatic reconnect. Explicit provider
        // destruction and access revocation clear presence below.
      },
      onAccessRevoked: () => {
        emitSyncE2EEvent("access-revoked", {});
        set({
          readOnly: true,
          syncStatus: "disconnected",
          remoteUsers: [],
          statusMessage: "Der Zugriff auf diesen Workspace wurde entzogen.",
        });
      },
      onFailure: (failure) => {
        emitSyncE2EEvent("failure", { ...failure });
        set({ syncFailure: failure, remoteUsers: [] });
      },
      onAwarenessChange: (states) => {
        const localClientID = yDoc.clientID;
        const users: RemoteUser[] = [];
        for (const [clientID, state] of states) {
          if (clientID === localClientID || !state) continue;
          users.push({
            clientID,
            name: state.name ?? `User ${clientID % 1000}`,
            email: state.email,
            color: state.color ?? "#999",
            selectedNodeId: state.selectedNodeId ?? null,
          });
        }
        set({ remoteUsers: users });
      },
    });

    set({ syncProvider: provider, syncStatus: "connecting" });
    provider.connect();

    // Broadcast current selection if any
    const sel = get().selectedNodeId;
    if (sel) {
      provider.setLocalAwarenessField("selectedNodeId", sel);
    }
  },

  retrySync: () => {
    get().syncProvider?.retry();
  },

  disconnectSync: async () => {
    const { syncProvider } = get();
    if (syncProvider) await syncProvider.disconnectAndWait();
    set({ syncProvider: null, syncStatus: "disconnected", syncFailure: null, remoteUsers: [] });
  },

  setSelectedNodeId: (id) => {
    const current = get();
    if (current.selectedNodeId === id && (id === null ? current.selectedNodeIds.length === 0 : current.selectedNodeIds.length === 1 && current.selectedNodeIds[0] === id)) {
      return;
    }
    // When deselecting, also close the editor
    const creationUpdate = current.lastCreatedNodeId && current.lastCreatedNodeId !== id
      ? { lastCreatedNodeId: null, lastCreatedParentId: null, lastCreatedInitialTitle: null }
      : {};
    if (id === null) {
      set({ selectedNodeId: null, selectedNodeIds: [], editorVisible: false, ...creationUpdate });
    } else {
      set({ selectedNodeId: id, selectedNodeIds: [id], ...creationUpdate });
    }
    // Broadcast selection to remote users
    const { syncProvider } = get();
    if (syncProvider) {
      syncProvider.setLocalAwarenessField("selectedNodeId", id);
    }
  },
  setSelectedNodeIds: (ids) => {
    const unique = Array.from(new Set(ids));
    const current = get().selectedNodeIds;
    if (current.length === unique.length && current.every((id, index) => id === unique[index])) return;
    set({ selectedNodeIds: unique, selectedNodeId: unique.at(-1) ?? null });
  },
  setAutoEditNodeId: (id) => {
    // Manual rename requests (R, file import, etc.) supersede a delayed create request.
    requestAutoEditToken += 1;
    set({ autoEditNodeId: id });
  },
  requestAutoEditNode: (id) => {
    const token = ++requestAutoEditToken;
    // Clear a previous one-shot request first. Otherwise a stale request can be consumed by
    // an older node while React Flow is reconciling a delete/create sequence.
    set({ autoEditNodeId: null });
    scheduleAfterRender(() => {
      if (token !== requestAutoEditToken) return;
      if (!get().document?.nodes.has(id)) return;
      requestNodeFocus(id);
      const startedAt = Date.now();
      let retriedReveal = false;
      const editWhenVisible = () => {
        if (token !== requestAutoEditToken || !get().document?.nodes.has(id)) return;
        const elapsed = Date.now() - startedAt;
        if (isAutoEditTargetVisible(id) || elapsed >= 1500) {
          set({ autoEditNodeId: id });
          return;
        }
        if (elapsed >= 450 && !retriedReveal) {
          retriedReveal = true;
          requestNodeFocus(id);
        }
        window.setTimeout(editWhenVisible, 50);
      };
      editWhenVisible();
    });
  },
  setEditorVisible: (visible) => set({ editorVisible: visible }),
  toggleEditor: () => {
    const { selectedNodeId, editorVisible } = get();
    if (!selectedNodeId) return;
    set({ editorVisible: !editorVisible });
  },

  toggleCollapse: (nodeId) => {
    const { document: doc, collapsedIds, focusNodeId, edgeMode } = get();
    if (!doc) return;

    const next = new Set(collapsedIds);
    if (next.has(nodeId)) {
      next.delete(nodeId);
    } else {
      next.add(nodeId);
    }

    const { nodes, edges } = computeLayout(doc, next, focusNodeId, edgeMode);
    set({ collapsedIds: next, nodes, edges });
  },

  updateNodeContent: (nodeId, content) => {
    const { yDoc, document: doc, readOnly } = get();
    if (readOnly) { reportBlockedEdit(set, new Error("This workspace is read-only.")); return; }
    if (!yDoc || !doc) return;

    // Character-level diff update for proper CRDT merge during collaboration
    const oldContent = doc.nodes.get(nodeId)?.content ?? "";
    yUpdateContentDiff(yDoc, nodeId, oldContent, content);

    // Update the local document reference directly for immediate read-back
    const node = doc.nodes.get(nodeId);
    if (node) {
      node.content = content;
      set({ document: { ...doc } });
    }
  },

  updateNodeMetadata: (nodeId, metadata) => {
    const { yDoc, readOnly } = get();
    if (readOnly) { reportBlockedEdit(set, new Error("This workspace is read-only.")); return; }
    if (!yDoc) return;
    yUpdateNodeMetadata(yDoc, nodeId, metadata);
  },

  renameNode: (nodeId, newTitle) => {
    const { yDoc, document: doc, readOnly } = get();
    if (readOnly) { reportBlockedEdit(set, new Error("This workspace is read-only.")); return; }
    if (!yDoc || !doc) return;

    yDoc.transact(() => {
      yRenameNode(yDoc, nodeId, newTitle);
      // When renaming the root node, also update the frontmatter title
      if (nodeId === doc.rootId) {
        yUpdateFrontmatter(yDoc, "title", newTitle);
      }
    });
    if (get().lastCreatedNodeId !== nodeId) {
      set({ lastCreatedNodeId: null, lastCreatedParentId: null, lastCreatedInitialTitle: null });
    }
    // → nodes.observeDeep callback updates store automatically
  },

  moveNode: (nodeId, newParentId, index) => {
    const { yDoc, readOnly } = get();
    if (readOnly) { reportBlockedEdit(set, new Error("This workspace is read-only.")); return; }
    if (!yDoc) return;

    try {
      yMoveNode(yDoc, nodeId, newParentId, index);
      set({ statusMessage: null, lastCreatedNodeId: null, lastCreatedParentId: null, lastCreatedInitialTitle: null });
      // → nodes.observeDeep callback updates store automatically
    } catch (error) {
      // Circular move or too deep → tell the user and relayout to reset the visual state.
      reportBlockedEdit(set, error);
      const { document: doc, collapsedIds, focusNodeId, edgeMode } = get();
      if (doc) {
        const { nodes, edges } = computeLayout(doc, collapsedIds, focusNodeId, edgeMode);
        set({ nodes, edges });
      }
    }
  },

  addChildNode: (parentId, title) => {
    const { yDoc, readOnly } = get();
    if (readOnly) return reportBlockedEdit(set, new Error("This workspace is read-only."));
    if (!yDoc) return null;
    try {
      const id = yAddNode(yDoc, parentId, title);
      set({ statusMessage: null, lastCreatedNodeId: id, lastCreatedParentId: parentId, lastCreatedInitialTitle: title });
      return id;
    } catch (error) {
      return reportBlockedEdit(set, error);
    }
    // → nodes.observeDeep callback updates store automatically
  },

  addSiblingNode: (nodeId, title) => {
    const { yDoc, document: doc, readOnly } = get();
    if (readOnly) return reportBlockedEdit(set, new Error("This workspace is read-only."));
    if (!yDoc || !doc) return null;
    const node = doc.nodes.get(nodeId);
    if (!node?.parentId) return null; // Can't add sibling to root
    try {
      const id = yAddNode(yDoc, node.parentId, title);
      set({ statusMessage: null, lastCreatedNodeId: id, lastCreatedParentId: node.parentId, lastCreatedInitialTitle: title });
      return id;
    } catch (error) {
      return reportBlockedEdit(set, error);
    }
    // → nodes.observeDeep callback updates store automatically
  },

  deleteNodeAction: (nodeId) => {
    const { yDoc, document: doc, readOnly } = get();
    if (readOnly) { reportBlockedEdit(set, new Error("This workspace is read-only.")); return null; }
    if (!yDoc || !doc) return null;
    if (nodeId === doc.rootId) return null; // Can't delete root
    const node = doc.nodes.get(nodeId);
    if (!node?.parentId) return null; // Root has no parent — extra safety
    const parentId = node.parentId;
    yDeleteNode(yDoc, nodeId);
    const currentDoc = get().document;
    const fallbackId = currentDoc?.nodes.has(parentId) ? parentId : currentDoc?.rootId ?? null;
    if (fallbackId) get().setSelectedNodeId(fallbackId);
    set({ lastCreatedNodeId: null, lastCreatedParentId: null, lastCreatedInitialTitle: null });
    if (fallbackId) requestNodeFocus(fallbackId);
    return fallbackId;
    // → nodes.observeDeep callback updates store automatically
  },

  undo: () => {
    if (get().readOnly) { reportBlockedEdit(set, new Error("This workspace is read-only.")); return null; }
    const { undoManager: um, document: beforeDoc, selectedNodeId, lastCreatedNodeId, lastCreatedParentId, lastCreatedInitialTitle } = get();
    if (!um || !um.canUndo()) return null;

    let focusId = selectedNodeId;
    const shouldUndoNewNode = Boolean(
      lastCreatedNodeId && selectedNodeId === lastCreatedNodeId && beforeDoc?.nodes.has(lastCreatedNodeId),
    );

    if (shouldUndoNewNode && lastCreatedNodeId) {
      // A first rename may have been captured separately from the insertion. Consume that rename
      // and the insertion as one user-facing undo, but do not cross unrelated edits in the stack.
      um.undo();
      const afterFirstUndo = get().document?.nodes.get(lastCreatedNodeId);
      if (afterFirstUndo && afterFirstUndo.title === lastCreatedInitialTitle && um.canUndo()) {
        um.undo();
      }
      const currentDoc = get().document;
      focusId = lastCreatedParentId && currentDoc?.nodes.has(lastCreatedParentId)
        ? lastCreatedParentId
        : currentDoc?.rootId ?? null;
      set({ lastCreatedNodeId: null, lastCreatedParentId: null, lastCreatedInitialTitle: null });
    } else {
      um.undo();
      const currentDoc = get().document;
      const restoredId = beforeDoc && currentDoc ? newlyPresentNodeId(beforeDoc, currentDoc) : null;
      if (restoredId) {
        focusId = restoredId;
      } else if (!currentDoc?.nodes.has(focusId ?? "")) {
        const previousNode = beforeDoc && focusId ? beforeDoc.nodes.get(focusId) : undefined;
        focusId = previousNode?.parentId && currentDoc?.nodes.has(previousNode.parentId)
          ? previousNode.parentId
          : currentDoc?.rootId ?? null;
      }
    }

    if (focusId) {
      get().setSelectedNodeId(focusId);
      requestNodeFocus(focusId);
    }
    return focusId;
  },

  redo: () => {
    if (get().readOnly) { reportBlockedEdit(set, new Error("This workspace is read-only.")); return null; }
    const { undoManager: um, document: beforeDoc, selectedNodeId } = get();
    if (!um || !um.canRedo()) return null;
    um.redo();
    const currentDoc = get().document;
    const restoredId = beforeDoc && currentDoc ? newlyPresentNodeId(beforeDoc, currentDoc) : null;
    const selectedParentId = beforeDoc && selectedNodeId ? beforeDoc.nodes.get(selectedNodeId)?.parentId : null;
    const focusId = restoredId
      ?? (selectedNodeId && currentDoc?.nodes.has(selectedNodeId)
        ? selectedNodeId
        : selectedParentId && currentDoc?.nodes.has(selectedParentId)
          ? selectedParentId
          : currentDoc?.rootId ?? null);
    if (focusId) {
      get().setSelectedNodeId(focusId);
      requestNodeFocus(focusId);
    }
    return focusId;
  },

  canUndo: () => get().undoManager?.canUndo() ?? false,
  canRedo: () => get().undoManager?.canRedo() ?? false,

  relayout: () => {
    const { document: doc, collapsedIds, focusNodeId, edgeMode } = get();
    if (!doc) return;
    const { nodes, edges } = computeLayout(doc, collapsedIds, focusNodeId, edgeMode);
    set({ nodes, edges });
  },

  setEdgeMode: (edgeMode) => {
    const { document: doc, collapsedIds, focusNodeId } = get();
    if (!doc) {
      set({ edgeMode });
      return;
    }
    const { nodes, edges } = computeLayout(doc, collapsedIds, focusNodeId, edgeMode);
    set({ edgeMode, nodes, edges });
  },

  setCanvasMode: (canvasMode) => set({ canvasMode }),

  setFocusNodeId: (focusNodeId) => {
    const { document: doc, collapsedIds, edgeMode } = get();
    if (!doc) return;
    const validFocus = focusNodeId && doc.nodes.has(focusNodeId) ? focusNodeId : null;
    const { nodes, edges } = computeLayout(doc, collapsedIds, validFocus, edgeMode);
    set({ focusNodeId: validFocus, nodes, edges });
  },

  copyBranches: (nodeIds) => {
    const doc = get().document;
    if (!doc) return [];
    const requested = nodeIds?.length ? nodeIds : get().selectedNodeIds;
    const selected = new Set(requested.length ? requested : get().selectedNodeId ? [get().selectedNodeId!] : []);
    const roots = [...selected].filter((id) => {
      let parentId = doc.nodes.get(id)?.parentId ?? null;
      while (parentId) {
        if (selected.has(parentId)) return false;
        parentId = doc.nodes.get(parentId)?.parentId ?? null;
      }
      return doc.nodes.has(id);
    });
    const snapshot = (id: string): BranchSnapshot => {
      const node = doc.nodes.get(id)!;
      return {
        title: node.title,
        content: node.content,
        ...(node.metadata ? { metadata: structuredClone(node.metadata) } : {}),
        children: node.children.map(snapshot),
      };
    };
    const copiedBranches = roots.map(snapshot);
    set({ copiedBranches });
    return copiedBranches;
  },

  pasteBranches: (parentId) => {
    const { yDoc, document: doc, copiedBranches, selectedNodeId, readOnly } = get();
    if (readOnly) return reportBlockedEdit(set, new Error("This workspace is read-only.")) ?? [];
    if (!yDoc || !doc || copiedBranches.length === 0) return [];
    const targetId = parentId ?? selectedNodeId ?? doc.rootId;
    const target = doc.nodes.get(targetId);
    if (!target) return [];

    // Checked before the transaction starts: a rejection mid-paste would leave half a branch behind.
    const branchDepth = (branch: BranchSnapshot): number =>
      1 + Math.max(0, ...branch.children.map(branchDepth));
    const deepest = Math.max(0, ...copiedBranches.map(branchDepth));
    if (target.level + deepest > MAX_HEADING_LEVEL) {
      return reportBlockedEdit(set, new HeadingDepthError()) ?? [];
    }

    const created: string[] = [];
    const insert = (branch: BranchSnapshot, target: string): string => {
      const id = yAddNode(yDoc, target, branch.title, branch.content);
      if (branch.metadata) yUpdateNodeMetadata(yDoc, id, branch.metadata);
      for (const child of branch.children) insert(child, id);
      return id;
    };
    yDoc.transact(() => {
      for (const branch of copiedBranches) created.push(insert(branch, targetId));
    });
    if (created.length > 0) set({ selectedNodeId: created[0]!, selectedNodeIds: created, statusMessage: null });
    return created;
  },

  applyViewState: (view) => {
    const doc = get().document;
    if (!doc) return;
    const collapsedIds = new Set(view.collapsedIds.filter((id) => doc.nodes.has(id)));
    const focusNodeId = view.focusNodeId && doc.nodes.has(view.focusNodeId) ? view.focusNodeId : null;
    const { nodes, edges } = computeLayout(doc, collapsedIds, focusNodeId, view.edgeMode);
    set({ collapsedIds, focusNodeId, edgeMode: view.edgeMode, nodes, edges });
  },
}));
