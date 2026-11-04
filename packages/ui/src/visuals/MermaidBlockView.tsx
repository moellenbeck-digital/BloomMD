"use client";

import { useEffect, useMemo, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { AlertTriangle, Code2, Eye, Maximize2 } from "lucide-react";
import { useLocale } from "../i18n/LocaleContext";
import { renderMermaid, type MermaidRenderResult } from "./mermaid-render";
import { deliverExportFile, diagramExportFile, standaloneSvg, svgDataUrl } from "./visual-export";
import { useVisuals } from "./visuals-context";

type RenderState =
  | { status: "empty" }
  | { status: "rendering" }
  | { status: "ready"; svg: string }
  | { status: "error"; message: string; line?: number; loadFailed?: boolean };

const RENDER_DEBOUNCE_MS = 300;

/** Render state of a mermaid source: rendering, the SVG, the syntax error, or empty. Re-renders when the source changes. */
export function useMermaidDiagram(code: string, debounceMs: number): RenderState {
  const [state, setState] = useState<RenderState>(() => (code.trim() ? { status: "rendering" } : { status: "empty" }));
  useEffect(() => {
    if (!code.trim()) {
      setState({ status: "empty" });
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void renderMermaid(code).then((result: MermaidRenderResult) => {
        if (cancelled) return;
        setState(result.ok ? { status: "ready", svg: result.svg } : { status: "error", message: result.message, line: result.line, loadFailed: result.loadFailed });
      });
    }, debounceMs);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [code, debounceMs]);
  return state;
}

/**
 * View of a code block of language `mermaid`: the diagram by default, the source on demand.
 *
 * The source is the only thing that is stored; the diagram is derived from it. Rendering, switching
 * between source and preview and enlarging never write to the document — only typing in the source
 * field does, like in any other code block.
 */
export function MermaidBlockView({ code, onCodeChange }: { code: string; onCodeChange: (code: string) => void }) {
  const { t } = useLocale();
  const visuals = useVisuals();
  const [mode, setMode] = useState<"preview" | "edit">(code.trim() ? "preview" : "edit");
  const state = useMermaidDiagram(code, mode === "edit" ? RENDER_DEBOUNCE_MS : 0);
  const diagramUrl = useMemo(() => (state.status === "ready" ? svgDataUrl(standaloneSvg(state.svg)) : null), [state]);
  const showSource = mode === "edit" || state.status === "error" || state.status === "empty";

  const enlarge = () => {
    if (state.status !== "ready" || !diagramUrl) return;
    const svg = state.svg;
    const name = `${visuals.title || "mindmap"}-diagram`;
    visuals.openViewer({
      kind: "diagram",
      src: diagramUrl,
      alt: t.visualMermaidTitle,
      actions: [
        { id: "diagram-svg", label: t.visualSaveDiagramSvg, run: async () => deliverExportFile(await diagramExportFile(svg, "svg", name)) },
        { id: "diagram-png", label: t.visualSaveDiagramPng, run: async () => deliverExportFile(await diagramExportFile(svg, "png", name)) },
      ],
    });
  };

  const stopEditorKeys = (event: ReactKeyboardEvent) => event.stopPropagation();
  const buttonClass = "inline-flex h-7 items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-xs font-medium text-[var(--color-ink-muted)] transition-colors hover:bg-[var(--color-surface-sunken)] hover:text-[var(--color-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF6B35]";

  return (
    <div
      contentEditable={false}
      data-testid="mermaid-block"
      data-mermaid-state={state.status}
      data-mermaid-mode={mode}
      className="my-3 overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]"
      onKeyDown={stopEditorKeys}
    >
      <div className="flex items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface-sunken)] px-2.5 py-1.5">
        <span className="text-xs font-semibold text-[var(--color-ink-muted)]">{t.visualMermaidTitle}</span>
        <div className="ml-auto flex items-center gap-1.5">
          {state.status === "ready" && (
            <button type="button" className={buttonClass} data-testid="mermaid-enlarge" aria-label={t.visualEnlarge} title={t.visualEnlarge} onClick={enlarge}>
              <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
          {mode === "preview" ? (
            <button type="button" className={buttonClass} data-testid="mermaid-edit" aria-label={t.visualMermaidEditSource} onClick={() => setMode("edit")}>
              <Code2 className="h-3.5 w-3.5" aria-hidden="true" />
              {t.visualMermaidEditSource}
            </button>
          ) : (
            <button type="button" className={buttonClass} data-testid="mermaid-preview" aria-label={t.visualMermaidShowPreview} onClick={() => setMode("preview")}>
              <Eye className="h-3.5 w-3.5" aria-hidden="true" />
              {t.visualMermaidShowPreview}
            </button>
          )}
        </div>
      </div>

      {state.status === "ready" && diagramUrl && (
        <button
          type="button"
          data-testid="mermaid-diagram"
          aria-label={`${t.visualMermaidTitle} — ${t.visualEnlarge}`}
          className="flex w-full cursor-zoom-in justify-center bg-white p-3 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#FF6B35]"
          onClick={enlarge}
        >
          <img src={diagramUrl} alt={t.visualMermaidTitle} draggable={false} className="h-auto max-h-[28rem] max-w-full" />
        </button>
      )}
      {state.status === "rendering" && <p className="px-3 py-4 text-xs text-[var(--color-ink-muted)]" aria-busy="true" data-testid="mermaid-rendering">{t.visualMermaidRendering}</p>}
      {state.status === "empty" && <p className="px-3 py-3 text-xs text-[var(--color-ink-muted)]" data-testid="mermaid-empty">{t.visualMermaidEmpty}</p>}
      {state.status === "error" && (
        <div role="status" data-testid="mermaid-error" className="flex gap-2 border-b border-[#FFD4BF] bg-[#FFF4EE] px-3 py-2.5 text-[#1A1A1A]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#FF6B35]" aria-hidden="true" />
          <div className="min-w-0 text-xs">
            <p className="font-semibold">{state.loadFailed ? t.visualMermaidLoadFailed : t.visualMermaidErrorTitle}{state.line ? ` — ${t.visualMermaidErrorLine} ${state.line}` : ""}</p>
            {!state.loadFailed && <pre data-testid="mermaid-error-message" className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] text-[#5A4A42]">{state.message}</pre>}
            {!state.loadFailed && <p className="mt-1 text-[#5A4A42]">{t.visualMermaidErrorHint}</p>}
          </div>
        </div>
      )}

      {showSource && (
        <textarea
          data-testid="mermaid-source"
          aria-label={t.visualMermaidSourceLabel}
          value={code}
          rows={Math.min(16, Math.max(4, code.split("\n").length + 1))}
          readOnly={visuals.readOnly}
          spellCheck={false}
          className="block w-full resize-y border-t border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 font-mono text-xs text-[var(--color-ink)] outline-none focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#FF6B35]"
          onChange={(event) => {
            // Typing in the source keeps the source open, also when the diagram turns valid meanwhile.
            setMode("edit");
            onCodeChange(event.target.value);
          }}
        />
      )}
    </div>
  );
}
