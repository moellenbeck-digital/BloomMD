import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import { FileText, Folder } from "lucide-react";
import type { WorkspaceMapNodeData } from "../hooks/useWorkspaceMapLayout";

/**
 * A folder or a file on the workspace map.
 *
 * Folders read as containers and files as documents — different shape, weight and icon — because
 * the whole point of the map is telling the arrangement apart from the things arranged. Colour
 * alone would not carry that distinction for anyone who cannot separate the two hues.
 */
export function WorkspaceMapNode({ data, selected }: NodeProps<Node<WorkspaceMapNodeData>>) {
  const isFolder = data.kind === "folder";

  return (
    <div
      title={data.path}
      data-testid={`workspace-node-${data.kind}`}
      className={`flex h-10 items-center gap-2 border px-3 text-sm transition ${
        isFolder
          ? "rounded-md border-dashed border-[var(--color-border-strong)] bg-[var(--color-surface-sunken)] font-semibold text-[var(--color-ink-muted)]"
          : "rounded-lg border-[var(--color-border)] bg-[var(--color-surface-raised)] text-[var(--color-ink)] shadow-sm"
      } ${selected ? "ring-2 ring-[#FF6B35]" : ""}`}
    >
      <Handle type="target" position={Position.Left} className="!h-1.5 !w-1.5 !border-0 !bg-[var(--color-border-strong)]" />
      {isFolder ? <Folder size={14} aria-hidden /> : <FileText size={14} aria-hidden />}
      <span className="max-w-[190px] truncate">{data.label}</span>
      {isFolder && data.childCount > 0 && (
        <span className="ml-auto rounded bg-[var(--color-surface)] px-1.5 text-xs tabular-nums text-[var(--color-ink-faint)]">
          {data.childCount}
        </span>
      )}
      <Handle type="source" position={Position.Right} className="!h-1.5 !w-1.5 !border-0 !bg-[var(--color-border-strong)]" />
    </div>
  );
}
