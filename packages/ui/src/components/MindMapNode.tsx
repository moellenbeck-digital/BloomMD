import { workspaceSourceFile, openWorkspaceSource } from "../utils/workspaceSource";
import { memo, useCallback, useState, useRef, useEffect } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import {
  AlertTriangle,
  BookOpen,
  CalendarDays,
  Bot,
  CheckSquare,
  CornerDownRight,
  Edit3,
  ExternalLink,
  File,
  FileText,
  Globe2,
  Link2,
  Plus,
  Scale,
  Signpost,
  Square,
  Folder,
  Network,
  UserRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { MindMapNodeData } from "../hooks/useMindMapLayout";
import { useMindMapStore } from "../hooks/useMindMapStore";
import { nodeResourceIssue } from "./node-panel-model";
import { getPresenceInitials, getPresenceLabel } from "../sync/presence";
import { useLocale } from "../i18n/LocaleContext";
import { cancelPendingNodeFocus, requestNodeFocus } from "../utils/nodeFocus";

interface LevelStyle {
  bg: string;
  text: string;
  border: string;
  ring: string;
  inputBg: string;
}

const LEVEL_STYLES: Record<number, LevelStyle> = {
  1: {
    bg: "bg-[#1A1A1A]",
    text: "text-white",
    border: "border-[#1A1A1A]",
    ring: "ring-[#FF6B35]",
    inputBg: "bg-[#2a2a2a] text-white placeholder-gray-500",
  },
  2: {
    bg: "bg-[#FF6B35]",
    text: "text-white",
    border: "border-[#FF6B35]",
    ring: "ring-[#FF6B35]",
    inputBg: "bg-[#e85a28] text-white placeholder-orange-200",
  },
  3: {
    bg: "bg-[#FFF4EE]",
    text: "text-[#1A1A1A]",
    border: "border-[#FFD4BF]",
    ring: "ring-[#FF6B35]",
    inputBg: "bg-[#FFE8DA] text-[#1A1A1A] placeholder-[var(--color-ink-faint)]",
  },
  4: {
    bg: "bg-white",
    text: "text-[var(--color-ink-muted)]",
    border: "border-[#E8E4DF]",
    ring: "ring-[#F7931E]",
    inputBg: "bg-[#F5F3F0] text-[var(--color-ink-muted)] placeholder-[var(--color-ink-faint)]",
  },
  5: {
    bg: "bg-[#F5F3F0]",
    text: "text-[var(--color-ink-muted)]",
    border: "border-[#D4CFC8]",
    ring: "ring-[#F7931E]",
    inputBg: "bg-[#E8E4DF] text-[var(--color-ink-muted)] placeholder-[var(--color-ink-faint)]",
  },
  6: {
    bg: "bg-[#E8E4DF]",
    text: "text-[var(--color-ink-muted)]",
    border: "border-[#D4CFC8]",
    ring: "ring-[#F7931E]",
    inputBg: "bg-[#D4CFC8] text-[var(--color-ink-muted)] placeholder-[var(--color-ink-faint)]",
  },
};

function getStyle(level: number): LevelStyle {
  if (level >= 6) return LEVEL_STYLES[6]!;
  return LEVEL_STYLES[level] ?? LEVEL_STYLES[4]!;
}

const KIND_ICONS: Record<string, LucideIcon> = {
  topic: Signpost,
  workspace: Network,
  folder: Folder,
  portal: ExternalLink,
  web: Globe2,
  file: File,
  pdf: FileText,
  source: BookOpen,
  task: CheckSquare,
  decision: Scale,
};

function MindMapNodeComponent({ id, data, selected }: NodeProps) {
  const nodeData = data as unknown as MindMapNodeData;
  const { t } = useLocale();
  const style = getStyle(nodeData.level);
  const toggleCollapse = useMindMapStore((s) => s.toggleCollapse);
  const renameNode = useMindMapStore((s) => s.renameNode);
  const document = useMindMapStore((s) => s.document);
  const readOnly = useMindMapStore((s) => s.readOnly);
  const onRootRename = nodeData.onRootRename;
  const updateNodeMetadata = useMindMapStore((s) => s.updateNodeMetadata);
  const setSelectedNodeId = useMindMapStore((s) => s.setSelectedNodeId);
  const selectedNodeId = useMindMapStore((s) => s.selectedNodeId);
  const autoEditNodeId = useMindMapStore((s) => s.autoEditNodeId);
  const setAutoEditNodeId = useMindMapStore((s) => s.setAutoEditNodeId);
  const requestAutoEditNode = useMindMapStore((s) => s.requestAutoEditNode);
  const addChildNode = useMindMapStore((s) => s.addChildNode);
  const addSiblingNode = useMindMapStore((s) => s.addSiblingNode);
  const setEditorVisible = useMindMapStore((s) => s.setEditorVisible);
  const remoteUsers = useMindMapStore((s) => s.remoteUsers);
  const usersOnThisNode = remoteUsers.filter((u) => u.selectedNodeId === id);
  const hasChildren = nodeData.childCount > 0;
  const hasLinks = (nodeData.linkCount ?? 0) > 0;
  const isSelected = selected || selectedNodeId === id;
  const metadata = nodeData.metadata;
  const sourceFile = workspaceSourceFile(document, id);
  const KindIcon = KIND_ICONS[metadata?.kind ?? "topic"] ?? Signpost;
  const resourceIssue = nodeResourceIssue({
    id,
    title: nodeData.label,
    level: nodeData.level,
    content: nodeData.content,
    parentId: null,
    children: [],
    metadata,
  }, t);

  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(nodeData.label);
  const inputRef = useRef<HTMLInputElement>(null);
  const editStartValueRef = useRef(nodeData.label);
  const skipBlurCommitRef = useRef(false);

  useEffect(() => {
    if (editing) {
      // Pending canvas focus is cancelled before editing; do not steal focus back later.
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  // Auto-edit when triggered from store (e.g. after creating a new mindmap)
  useEffect(() => {
    if (autoEditNodeId === id) {
      cancelPendingNodeFocus();
      if (readOnly) { setAutoEditNodeId(null); return; }
      skipBlurCommitRef.current = false;
      setEditValue(nodeData.label);
      editStartValueRef.current = nodeData.label;
      setEditing(true);
      setAutoEditNodeId(null);
    }
  }, [autoEditNodeId, id, nodeData.label, readOnly, setAutoEditNodeId]);

  const onToggle = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      toggleCollapse(id);
    },
    [id, toggleCollapse],
  );

  const startEditing = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (readOnly || (e.target as HTMLElement).closest("button, input")) return;
      cancelPendingNodeFocus();
      skipBlurCommitRef.current = false;
      setEditValue(nodeData.label);
      editStartValueRef.current = nodeData.label;
      setEditing(true);
    },
    [nodeData.label, readOnly],
  );

  const openResource = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!metadata || metadata.kind === "topic") return;
    if ((metadata.kind === "web" || metadata.kind === "source") && metadata.url) {
      try {
        const url = new URL(metadata.url);
        if (url.protocol === "http:" || url.protocol === "https:") window.open(url.toString(), "_blank", "noopener,noreferrer");
      } catch { /* Invalid URLs remain editable in the node inspector. */ }
      return;
    }
    window.dispatchEvent(new CustomEvent("bloommd:open-resource", {
      detail: { nodeId: id, kind: metadata.kind, file: metadata.file, targetNodeId: metadata.targetNodeId, url: metadata.url },
    }));
  }, [id, metadata]);

  const onDoubleClick = useCallback((e: React.MouseEvent) => {
    startEditing(e);
  }, [startEditing]);

  const toggleTask = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (metadata?.kind !== "task") return;
    updateNodeMetadata(id, { ...metadata, status: metadata.status === "done" ? "open" : "done" });
  }, [id, metadata, updateNodeMetadata]);

  const commitRename = useCallback((restoreFocus = false) => {
    const trimmed = editValue.trim();
    if (!readOnly && trimmed && trimmed !== nodeData.label) {
      const previousTitle = nodeData.label;
      if (id === document?.rootId && onRootRename) {
        // The host owns the root rename because it must persist the frontmatter and move the
        // Markdown file as one operation. Do not optimistically rename the Y.Doc here: doing so
        // would let a failed file move leave the title and path out of sync.
        skipBlurCommitRef.current = true;
        setEditing(false);
        void Promise.resolve(onRootRename({ nodeId: id, previousTitle, newTitle: trimmed }))
          .catch((error: unknown) => {
            console.error("[BloomMD] Root rename failed:", error);
          })
          .finally(() => {
            if (restoreFocus) requestNodeFocus(id);
          });
        return;
      }
      renameNode(id, trimmed);
    }
    setEditing(false);
    if (restoreFocus) requestNodeFocus(id);
  }, [document?.rootId, editValue, id, nodeData.label, onRootRename, readOnly, renameNode]);

  const cancelRename = useCallback(() => {
    skipBlurCommitRef.current = true;
    setEditValue(editStartValueRef.current);
    setEditing(false);
    requestNodeFocus(id);
  }, [id]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      e.stopPropagation();
      if (e.nativeEvent.isComposing) return;
      if (e.key === "Enter") {
        e.preventDefault();
        commitRename(true);
      } else if (e.key === "Escape") {
        e.preventDefault();
        cancelRename();
      }
    },
    [cancelRename, commitRename],
  );

  const onNodeKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (editing || readOnly || e.nativeEvent.isComposing || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;

      if (e.key.toLowerCase() === "r") {
        e.preventDefault();
        e.stopPropagation();
        setAutoEditNodeId(id);
        return;
      }
    },
    [editing, readOnly, id, setAutoEditNodeId],
  );

  const isRoot = nodeData.level === 1;

  const createChild = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const newId = addChildNode(id, t.newNodeTitle);
      if (newId) {
        setSelectedNodeId(newId);
        requestAutoEditNode(newId);
      }
    },
    [addChildNode, id, requestAutoEditNode, setSelectedNodeId, t.newNodeTitle],
  );

  const createSibling = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const newId = addSiblingNode(id, t.newNodeTitle);
      if (newId) {
        setSelectedNodeId(newId);
        requestAutoEditNode(newId);
      }
    },
    [addSiblingNode, id, requestAutoEditNode, setSelectedNodeId, t.newNodeTitle],
  );

  const openEditor = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setSelectedNodeId(id);
      setEditorVisible(true);
    },
    [id, setEditorVisible, setSelectedNodeId],
  );

  const agentBadgeCount = (nodeData.agentActivity?.queuedOrRunning ?? 0) + (nodeData.agentActivity?.pendingProposals ?? 0);
  const agentHasProposal = (nodeData.agentActivity?.pendingProposals ?? 0) > 0;

  return (
    <div
      data-testid="mindmap-node"
      data-node-id={id}
      data-node-label={nodeData.label}
      data-selected={isSelected ? "true" : "false"}
      data-node-kind={metadata?.kind ?? "topic"}
      tabIndex={selectedNodeId === id || (selectedNodeId === null && isRoot) ? 0 : -1}
      role="treeitem"
      aria-selected={isSelected}
      aria-level={nodeData.level}
      aria-expanded={hasChildren ? !nodeData.collapsed : undefined}
      onClick={(e) => {
        if (editing || (e.target as HTMLElement).closest("button, input")) return;
        setSelectedNodeId(id);
        requestNodeFocus(id, false);
      }}
      onKeyDown={onNodeKeyDown}
      className={`
        relative rounded-lg border-2 cursor-pointer
        transition-colors duration-150
        font-[var(--font-display,Outfit,sans-serif)]
        ${isRoot ? "px-5 py-3" : "px-4 py-2"}
        min-w-[80px] max-w-[280px] text-center
        ${style.bg} ${style.text} ${style.border}
        ${isSelected
          ? `ring-2 ring-offset-2 ${style.ring} shadow-lg`
          : "shadow-sm hover:shadow-md"}
      `}
      onDoubleClick={onDoubleClick}
    >
      {nodeData.dropPosition === "before" && <div className="pointer-events-none absolute -top-2 left-0 right-0 h-1 bg-[#FF6B35]" data-testid="drop-before" />}
      {nodeData.dropPosition === "after" && <div className="pointer-events-none absolute -bottom-2 left-0 right-0 h-1 bg-[#FF6B35]" data-testid="drop-after" />}
      {nodeData.dropPosition === "inside" && <div className="pointer-events-none absolute inset-0 rounded-lg ring-4 ring-[#FF6B35]/60" data-testid="drop-inside" />}
      <Handle
        type="target"
        position={Position.Left}
        className="!w-2.5 !h-2.5 !bg-[#D4CFC8] !border-2 !border-white !-left-[6px]"
      />

      {editing ? (
        <input
          ref={inputRef}
          data-testid="node-rename-input"
          value={editValue}
          onInput={(e) => setEditValue(e.currentTarget.value)}
          onBlur={() => {
            if (skipBlurCommitRef.current) {
              skipBlurCommitRef.current = false;
              return;
            }
            commitRename(false);
          }}
          onKeyDown={onKeyDown}
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          className={`
            nodrag nopan font-medium w-full text-center
            rounded-md px-1 py-0 border-0 outline-none
            font-[var(--font-display,Outfit,sans-serif)]
            ${isRoot ? "text-base" : "text-sm"}
            ${style.inputBg}
          `}
        />
      ) : (
        <div className={`flex items-center justify-center gap-2 font-semibold tracking-tight ${isRoot ? "text-base" : "text-sm"}`}>
          {metadata?.kind === "task" ? (
            <button type="button" disabled={readOnly} onClick={toggleTask} className="nodrag shrink-0" title={t.toggleTask} aria-label={t.toggleTask}>{metadata.status === "done" ? <CheckSquare size={15} /> : <Square size={15} />}</button>
          ) : metadata?.kind && metadata.kind !== "topic" ? <KindIcon size={15} className="shrink-0" aria-hidden="true" /> : null}
          <span className={`truncate ${metadata?.kind === "task" && metadata.status === "done" ? "line-through opacity-70" : ""}`}>{nodeData.label}</span>
        </div>
      )}

      {metadata?.decision && <div className="mt-1 font-mono text-[9px] uppercase opacity-70" data-testid="node-decision-state">{metadata.decision === "accepted" ? t.acceptedStatus : metadata.decision === "rejected" ? t.rejectedStatus : t.proposedStatus}</div>}
      {(metadata?.due || metadata?.assignee) && (
        <div className="mt-1 flex flex-wrap justify-center gap-1 text-[10px]" data-testid="node-task-facts">
          {metadata.due && (() => {
            const overdue = metadata.status !== "done" && metadata.due < new Date().toISOString().slice(0, 10);
            return (
              <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 ${overdue ? "bg-red-500/15 font-semibold text-red-600" : "bg-black/5 opacity-80"}`} title={overdue ? `${t.overdueSince} ${metadata.due}` : `${t.dueDate} ${metadata.due}`}>
                <CalendarDays size={11} aria-hidden="true" />{metadata.due}
              </span>
            );
          })()}
          {metadata.assignee && <span className="inline-flex items-center gap-1 rounded-full bg-black/5 px-1.5 py-0.5 opacity-80" title={`${metadata.kind === "decision" ? t.decidedBy : t.responsible}: ${metadata.assignee}`}><UserRound size={11} aria-hidden="true" />{metadata.assignee}</span>}
        </div>
      )}

      {hasLinks && (
        <div
          data-testid="node-link-badge"
          className="absolute -top-3 -right-3 flex h-6 min-w-6 items-center justify-center gap-1 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-1.5 text-[10px] font-semibold text-[#FF6B35] shadow-sm"
          title={`${nodeData.linkCount} ${nodeData.linkCount === 1 ? t.link : t.linksPlural}`}
        >
          <Link2 size={12} />
          <span>{nodeData.linkCount}</span>
        </div>
      )}

      {resourceIssue && (
        <div
          data-testid="node-resource-issue-badge"
          className={`absolute ${hasLinks ? "top-4" : "-top-3"} -right-3 flex h-6 w-6 items-center justify-center rounded-full border border-red-200 bg-red-50 text-red-700 shadow-sm`}
          title={resourceIssue}
          aria-label={resourceIssue}
        >
          <AlertTriangle size={13} />
        </div>
      )}

      <Handle
        type="source"
        position={Position.Right}
        className="!w-2.5 !h-2.5 !bg-[#D4CFC8] !border-2 !border-white !-right-[6px]"
      />

      {usersOnThisNode.length > 0 && (
        <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 flex gap-0.5 z-10" data-testid="remote-user-presence">
          {usersOnThisNode.map((user) => (
            <span
              key={user.clientID}
              className="inline-flex h-4 min-w-4 items-center justify-center rounded-full border-2 border-white px-0.5 text-[8px] font-bold leading-none text-white shadow-sm"
              style={{ backgroundColor: user.color }}
              title={getPresenceLabel(user.name, user.email)}
              aria-label={getPresenceLabel(user.name, user.email)}
              data-testid="remote-user-presence-badge"
            >
              {getPresenceInitials(user.name, user.email, String(user.clientID))}
            </span>
          ))}
        </div>
      )}

      {hasChildren && (
        <button
          onClick={onToggle}
          className={`
            absolute -right-3.5 top-1/2 -translate-y-1/2
            w-7 h-7 rounded-full
            bg-white border-2
            text-xs font-bold
            flex items-center justify-center
            transition-all duration-150 z-10
            ${nodeData.collapsed
              ? "border-[#FF6B35] text-[#FF6B35] hover:bg-[#FFF4EE]"
              : "border-[#D4CFC8] text-[var(--color-ink-faint)] hover:border-[#FF6B35] hover:text-[#FF6B35]"}
          `}
        >
          {nodeData.collapsed ? `+${nodeData.childCount}` : "−"}
        </button>
      )}

      {isSelected && !editing && (
        <div
          data-testid="node-action-toolbar"
          className="absolute left-1/2 top-full z-20 mt-2 flex -translate-x-1/2 items-center gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-1 shadow-lg"
          onClick={(e) => e.stopPropagation()}
        >
          {!readOnly && <button
            type="button"
            onClick={createChild}
            className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-sunken)] hover:text-[#FF6B35]"
            title={t.addChild}
            aria-label={t.addChild}
            data-testid="node-action-add-child"
          >
            <Plus size={15} />
          </button>}
          {!readOnly && !isRoot && (
            <button
              type="button"
              onClick={createSibling}
              className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-sunken)] hover:text-[#FF6B35]"
              title={t.addSibling}
              aria-label={t.addSibling}
              data-testid="node-action-add-sibling"
            >
              <CornerDownRight size={15} />
            </button>
          )}
          <button
            type="button"
            onClick={openEditor}
            className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-sunken)] hover:text-[#FF6B35]"
            title={t.editNodeContent}
            aria-label={t.editNodeContent}
            data-testid="node-action-open-editor"
          >
            <Edit3 size={15} />
          </button>
          {nodeData.onAskAgent && (
            <button
              type="button"
              className={`nodrag nopan relative flex h-7 w-7 items-center justify-center rounded-md hover:bg-[var(--color-surface-sunken)] ${agentHasProposal ? "text-[#C94D20]" : "text-[var(--color-ink-muted)] hover:text-[#FF6B35]"}`}
              title={agentHasProposal ? "Agent-Vorschlag prüfen" : "Agent für diesen Knoten fragen"}
              aria-label={agentHasProposal ? "Agent-Vorschlag prüfen" : "Agent für diesen Knoten fragen"}
              data-testid="node-action-ask-agent"
            >
              <Bot size={15} />
              {agentBadgeCount > 0 && (
                <span
                  className={`absolute -right-1.5 -top-1.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full px-0.5 text-[8px] font-bold text-white ${agentHasProposal ? "bg-[#FF6B35]" : "bg-[var(--color-ink-muted)]"}`}
                  data-testid="node-agent-action-badge"
                >
                  {agentBadgeCount}
                </span>
              )}
            </button>
          )}
          {sourceFile && <button type="button" onClick={() => openWorkspaceSource(sourceFile)} className="nodrag nopan px-2 text-xs" data-testid="node-action-open-source">{t.openSourceFile}</button>}
          {metadata && !(sourceFile && metadata.kind === "file" && metadata.file === sourceFile) && metadata.kind !== "topic" && metadata.kind !== "task" && metadata.kind !== "decision" && (
            <button
              type="button"
              onClick={openResource}
              className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-sunken)] hover:text-[#FF6B35]"
              title={t.openResource}
              aria-label={t.openResource}
              data-testid="node-action-open-resource"
            >
              <ExternalLink size={15} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export const MindMapNode = memo(MindMapNodeComponent);
