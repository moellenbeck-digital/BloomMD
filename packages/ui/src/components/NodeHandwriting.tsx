"use client";

import { useCallback, useContext, useEffect, useState } from "react";
import { PenLine, Pencil, Plus } from "lucide-react";
import { createInkDocument, parseInkSvg, serializeInkSvg, type InkDocument } from "@bloommd/ink/ink-document";
import { InkEditor } from "@bloommd/ink/ink-editor";
import { InkPreview } from "@bloommd/ink/ink-preview";
import "@bloommd/ink/ink.css";
import { appendInkEmbed, InkAttachmentsContext, inkEmbedNames } from "../ink/attachments";
import { useLocale } from "../i18n/LocaleContext";
import { useMindMapStore } from "../hooks/useMindMapStore";

interface Drawing {
  name: string;
  document: InkDocument | null;
  /** Saved by a newer BloomMD: shown, never rewritten in the older format. */
  readOnly: boolean;
}

/** Handwriting of a node: thumbnails of its drawings and a full-screen Apple Pencil editor. */
export function NodeHandwriting({ nodeId, content, notePath, readOnly }: { nodeId: string; content: string; notePath: string; readOnly: boolean }) {
  const attachments = useContext(InkAttachmentsContext);
  const { t } = useLocale();
  const updateNodeContent = useMindMapStore((state) => state.updateNodeContent);
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [editing, setEditing] = useState<{ name: string | null; document: InkDocument; readOnly: boolean } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const names = inkEmbedNames(content).join("\n");

  useEffect(() => {
    if (!attachments) return;
    let cancelled = false;
    void Promise.all(names.split("\n").filter(Boolean).map(async (name): Promise<Drawing> => {
      try {
        const parsed = parseInkSvg(await attachments.read(name, notePath));
        return { name, document: parsed?.document ?? null, readOnly: parsed?.readOnly ?? false };
      } catch {
        return { name, document: null, readOnly: false };
      }
    })).then((loaded) => { if (!cancelled) setDrawings(loaded); });
    return () => { cancelled = true; };
  }, [attachments, names, notePath]);

  const save = useCallback(async () => {
    if (!attachments || !editing) return;
    if (editing.readOnly) {
      setEditing(null);
      return;
    }
    try {
      const name = await attachments.write(editing.name, serializeInkSvg(editing.document), notePath);
      // A new drawing, or a copy because the drawing changed elsewhere meanwhile: embed it too.
      if (name !== editing.name) {
        const current = useMindMapStore.getState().document?.nodes.get(nodeId)?.content ?? content;
        updateNodeContent(nodeId, appendInkEmbed(current, name));
      }
      setDrawings((list) => {
        const rest = list.filter((entry) => entry.name !== name);
        return [...rest, { name, document: editing.document, readOnly: false }];
      });
      setNotice(editing.name && name !== editing.name ? `${t.drawingSavedAsCopy} ${name}` : null);
      setEditing(null);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t.handwritingSaveFailed);
    }
  }, [attachments, content, editing, nodeId, notePath, t.drawingSavedAsCopy, t.handwritingSaveFailed, updateNodeContent]);

  if (!attachments) return null;

  return (
    <section className="grid gap-2 border-b border-[var(--color-border)] px-4 py-3" data-testid="node-handwriting">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]"><PenLine size={14} className="text-[#FF6B35]" aria-hidden="true" />{t.handwriting}</span>
        {!readOnly && (
          <button type="button" onClick={() => setEditing({ name: null, document: createInkDocument(), readOnly: false })} className="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-[var(--color-border)] px-3 text-xs font-semibold" data-testid="node-handwriting-new">
            <Plus size={14} aria-hidden="true" />{t.newDrawing}
          </button>
        )}
      </div>
      {drawings.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {drawings.map((drawing) => (
            <div key={drawing.name} className="relative overflow-hidden rounded-md border border-[var(--color-border)] bg-white">
              {drawing.document
                ? <InkPreview document={drawing.document} handlers={{ onHoverLink: () => undefined, onOpenLink: (target) => attachments.openNote?.(target) }} label={drawing.name} />
                : <div className="grid h-24 place-items-center text-xs text-[var(--color-ink-muted)]">{t.drawingUnavailable}</div>}
              {drawing.document && drawing.readOnly && (
                <span className="absolute inset-x-1 bottom-1 rounded bg-white/90 px-1.5 py-0.5 text-[10px] leading-4 text-[var(--color-ink-muted)]">{t.drawingNewerFormat}</span>
              )}
              {!readOnly && !drawing.readOnly && drawing.document && (
                <button type="button" onClick={() => setEditing({ name: drawing.name, document: drawing.document!, readOnly: false })} aria-label={`${t.editDrawing}: ${drawing.name}`} title={t.editDrawing} className="absolute right-1 top-1 grid h-11 w-11 place-items-center rounded-md bg-white/90 shadow-sm">
                  <Pencil size={15} aria-hidden="true" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {notice && <p role="status" className="text-xs text-[var(--color-ink-muted)]">{notice}</p>}
      {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
      {editing && (
        <div className="fixed inset-0 z-[60] flex flex-col bg-white pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]" data-testid="node-handwriting-editor">
          <InkEditor
            document={editing.document}
            readOnly={readOnly || editing.readOnly}
            onChange={(next) => setEditing((current) => (current ? { ...current, document: next } : current))}
            onDone={() => void save()}
            onPickNote={attachments.pickNote ?? (async () => null)}
            onHoverLink={() => undefined}
            onOpenLink={(target) => attachments.openNote?.(target)}
          />
        </div>
      )}
    </section>
  );
}
