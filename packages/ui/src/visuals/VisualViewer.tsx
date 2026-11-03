"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { Download, Minus, Plus, RotateCcw, X } from "lucide-react";
import { useLocale } from "../i18n/LocaleContext";
import { applyViewerCommand, INITIAL_VIEW, panBy, viewerCommandForKey, wheelFactor, zoomBy, zoomPercent, type ViewTransform } from "./visual-zoom";

export interface VisualViewerAction {
  id: string;
  label: string;
  /** Saves or exports what the viewer shows. A rejection is reported in the viewer. */
  run: () => Promise<void>;
}

export interface VisualViewerProps {
  kind: "image" | "diagram";
  /** URL of the picture: an image URL, or a data URL of the diagram's SVG. */
  src: string;
  alt: string;
  actions?: VisualViewerAction[];
  onClose: () => void;
}

const FOCUSABLE = "button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex='-1'])";

/**
 * The enlarged view of an image or diagram: zoom, pan, save, close.
 *
 * It only displays. It never touches the document, so opening, zooming and closing change neither
 * the Markdown text nor the file. It is a modal dialog: keyboard focus stays inside until it closes,
 * Esc closes it, and focus returns to what opened it.
 */
export function VisualViewer({ kind, src, alt, actions = [], onClose }: VisualViewerProps) {
  const { t } = useLocale();
  const [view, setView] = useState<ViewTransform>(INITIAL_VIEW);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const title = kind === "diagram" ? t.visualViewerDiagram : t.visualViewerImage;

  // Focus moves into the dialog and returns to the opener afterwards.
  useEffect(() => {
    const opener = window.document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    return () => opener?.focus?.();
  }, []);

  // The wheel zooms; the listener has to be non-passive to keep the page from scrolling behind.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = stage.getBoundingClientRect();
      const anchor = { x: event.clientX - rect.left - rect.width / 2, y: event.clientY - rect.top - rect.height / 2 };
      setView((current) => zoomBy(current, wheelFactor(event.deltaY), anchor));
    };
    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => stage.removeEventListener("wheel", onWheel);
  }, []);

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    // Nothing typed in the viewer may reach the editor or the app's shortcuts behind it.
    event.stopPropagation();
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === "Tab") {
      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const active = window.document.activeElement;
      if (event.shiftKey && (active === first || active === dialogRef.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
      return;
    }
    // A focused button keeps its own Enter/Space behaviour; arrows, +, - and 0 belong to the viewer.
    const command = viewerCommandForKey(event);
    if (command) {
      event.preventDefault();
      setView((current) => applyViewerCommand(current, command));
    }
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId) return;
    const dx = event.clientX - active.x;
    const dy = event.clientY - active.y;
    drag.current = { ...active, x: event.clientX, y: event.clientY };
    setView((current) => panBy(current, dx, dy));
  };
  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointerId === event.pointerId) drag.current = null;
  };

  const run = useCallback(async (action: VisualViewerAction) => {
    setError(null);
    setBusy(action.id);
    try {
      await action.run();
    } catch (failure) {
      console.error("[BloomMD] saving from the viewer failed:", failure);
      setError(t.visualSaveFailed);
    } finally {
      setBusy(null);
    }
  }, [t.visualSaveFailed]);

  const buttonClass = "inline-flex h-8 items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 text-xs font-medium text-[var(--color-ink)] transition-colors hover:bg-[var(--color-surface-sunken)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF6B35] disabled:opacity-50";

  const viewer = (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/70 p-4 sm:p-8"
      data-testid="visual-viewer-backdrop"
      onClick={(event) => {
        event.stopPropagation();
        if (event.target === event.currentTarget) onClose();
      }}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        data-testid="visual-viewer"
        data-kind={kind}
        className="flex h-full max-h-full w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl outline-none"
        onKeyDown={onKeyDown}
      >
        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--color-border)] px-3 py-2">
          <div role="toolbar" aria-label={title} className="flex flex-wrap items-center gap-2">
            <button type="button" className={buttonClass} aria-label={t.visualZoomOut} title={t.visualZoomOut} data-testid="visual-zoom-out" onClick={() => setView((current) => applyViewerCommand(current, "zoom-out"))}>
              <Minus className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            <span className="min-w-[3.5rem] text-center text-xs tabular-nums text-[var(--color-ink-muted)]" role="status" aria-label={t.visualZoomLevel} data-testid="visual-zoom-level">{zoomPercent(view)} %</span>
            <button type="button" className={buttonClass} aria-label={t.visualZoomIn} title={t.visualZoomIn} data-testid="visual-zoom-in" onClick={() => setView((current) => applyViewerCommand(current, "zoom-in"))}>
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            <button type="button" className={buttonClass} aria-label={t.visualZoomReset} title={t.visualZoomReset} data-testid="visual-zoom-reset" onClick={() => setView(INITIAL_VIEW)}>
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            {actions.map((action) => (
              <button key={action.id} type="button" className={buttonClass} disabled={busy !== null} data-testid={`visual-action-${action.id}`} onClick={() => void run(action)}>
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                {action.label}
              </button>
            ))}
          </div>
          <button type="button" className={`${buttonClass} ml-auto`} aria-label={t.visualClose} title={`${t.visualClose} (Esc)`} data-testid="visual-close" onClick={onClose}>
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
        {error && <p role="alert" data-testid="visual-viewer-error" className="border-b border-[var(--color-border)] bg-[#FFF4EE] px-3 py-1.5 text-xs text-[#1A1A1A]">{error}</p>}
        <div
          ref={stageRef}
          data-testid="visual-viewer-stage"
          className="relative flex min-h-0 flex-1 cursor-grab touch-none items-center justify-center overflow-hidden bg-white active:cursor-grabbing"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <img
            src={src}
            alt={alt}
            draggable={false}
            data-testid="visual-viewer-content"
            data-scale={view.scale}
            className="max-h-[92%] max-w-[92%] select-none object-contain"
            style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`, transformOrigin: "center center" }}
          />
        </div>
        <p className="border-t border-[var(--color-border)] px-3 py-1.5 text-[11px] text-[var(--color-ink-faint)]">{t.visualViewerHint}</p>
      </div>
    </div>
  );

  return createPortal(viewer, window.document.body);
}
