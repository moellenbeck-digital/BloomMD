"use client";

import { useCallback, useRef, useState, useEffect, type ReactNode } from "react";
import { LazyNodeEditor } from "./LazyNodeEditor";
import { useLocale } from "../i18n/LocaleContext";

const STORAGE_KEY = "bloommd-editor-width";
const DEFAULT_WIDTH = 380;
const MIN_WIDTH = 280;
const MAX_RATIO = 0.55;

interface ResizableEditorProps {
  agentPanel?: ReactNode;
  agentOpen?: boolean;
  agentBadge?: number;
  onAgentOpenChange?: (open: boolean) => void;
}

export function ResizableEditor({ agentPanel, agentOpen = false, agentBadge = 0, onAgentOpenChange }: ResizableEditorProps) {
  const { t } = useLocale();
  const [width, setWidth] = useState(() => {
    if (typeof window === "undefined") return DEFAULT_WIDTH;
    const stored = localStorage.getItem(STORAGE_KEY);
    const parsed = stored ? Number.parseInt(stored, 10) : DEFAULT_WIDTH;
    return Number.isFinite(parsed) ? Math.max(MIN_WIDTH, parsed) : DEFAULT_WIDTH;
  });

  const dragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(width));
  }, [width]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    dragging.current = true;
    startX.current = e.clientX;
    startWidth.current = width;

    const onPointerMove = (ev: PointerEvent) => {
      if (!dragging.current) return;
      const delta = startX.current - ev.clientX;
      const maxWidth = window.innerWidth * MAX_RATIO;
      const newWidth = Math.min(maxWidth, Math.max(MIN_WIDTH, startWidth.current + delta));
      setWidth(newWidth);
    };

    const onPointerUp = () => {
      dragging.current = false;
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);
  }, [width]);

  const onKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const delta = event.key === "ArrowLeft" ? 16 : -16;
    setWidth((current) => Math.min(window.innerWidth * MAX_RATIO, Math.max(MIN_WIDTH, current + delta)));
  }, []);

  return (
    <div className="flex h-full shrink-0" style={{ width }} data-testid="node-editor">
      {/* Drag handle */}
      <div
        onPointerDown={onPointerDown}
        onKeyDown={onKeyDown}
        role="separator"
        aria-label={t.editorWidth}
        aria-orientation="vertical"
        aria-valuemin={MIN_WIDTH}
        aria-valuemax={Math.round((typeof window === "undefined" ? 1200 : window.innerWidth) * MAX_RATIO)}
        aria-valuenow={Math.round(width)}
        data-testid="editor-resize-handle"
        tabIndex={0}
        className="w-1.5 h-full cursor-col-resize bg-[var(--color-border)] hover:bg-[#FF6B35] active:bg-[#FF6B35] transition-colors shrink-0 flex items-center justify-center"
      >
        <div className="w-0.5 h-8 rounded-full bg-[var(--color-border-strong)] opacity-0 hover:opacity-100 transition-opacity" />
      </div>
      {/* Inspector */}
      <div className="flex-1 min-w-0 h-full overflow-hidden">
        {agentPanel && onAgentOpenChange && (
          <div className="flex h-11 items-end gap-1 border-b border-[var(--color-border)] bg-[var(--color-surface-raised)] px-3" role="tablist" aria-label="Knoten-Inspector">
            <button
              type="button"
              role="tab"
              aria-selected={!agentOpen}
              onClick={() => onAgentOpenChange(false)}
              className={`relative h-10 px-2.5 text-sm font-semibold transition-colors ${!agentOpen ? "border-b-2 border-[#FF6B35] text-[var(--color-ink)]" : "text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]"}`}
            >
              Inhalt
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={agentOpen}
              onClick={() => onAgentOpenChange(true)}
              className={`relative h-10 px-2.5 text-sm font-semibold transition-colors ${agentOpen ? "border-b-2 border-[#FF6B35] text-[#C94D20]" : "text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]"}`}
              data-testid="inspector-agent-tab"
            >
              Agent
              {agentBadge > 0 && <span className="ml-1.5 inline-flex min-w-4 items-center justify-center rounded-full bg-[#FF6B35] px-1 py-0.5 text-[10px] leading-none text-white">{agentBadge}</span>}
            </button>
          </div>
        )}
        <div className={`${agentPanel && onAgentOpenChange ? "h-[calc(100%-2.75rem)]" : "h-full"} overflow-y-auto`}>
          {agentPanel && agentOpen ? agentPanel : <LazyNodeEditor />}
        </div>
      </div>
    </div>
  );
}
