"use client";

import { useEffect, useMemo, useState } from "react";
import { Pencil, X } from "lucide-react";
import { filenameForTitleInPath } from "@bloommd/core/browser";
import { useLocale } from "../i18n/LocaleContext";

export interface RenameMindmapDialogProps {
  open: boolean;
  filename: string;
  title: string;
  error?: string | null;
  onSubmit: (title: string) => Promise<boolean>;
  onClose: () => void;
}

/**
 * Renames the document identity explicitly. The node editor remains responsible for node titles;
 * this dialog makes the separate file operation visible and predictable.
 */
export function RenameMindmapDialog({ open, filename, title, error, onSubmit, onClose }: RenameMindmapDialogProps) {
  const { t } = useLocale();
  const [draft, setDraft] = useState(title);
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDraft(title);
    setBusy(false);
    setSubmitError(null);
  }, [filename, open, title]);

  const nextFilename = useMemo(() => filenameForTitleInPath(filename, draft), [draft, filename]);
  const canSubmit = draft.trim().length > 0 && !busy;

  if (!open) return null;

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setSubmitError(null);
    try {
      const success = await onSubmit(draft.trim());
      if (!success) setBusy(false);
    } catch (submitError: unknown) {
      console.error("[BloomMD] Rename dialog submission failed:", submitError);
      setBusy(false);
      setSubmitError(t.renameFailed);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={() => { if (!busy) onClose(); }}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="rename-mindmap-title"
        aria-describedby="rename-mindmap-description"
        data-testid="rename-mindmap-dialog"
        className="w-full max-w-md overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-raised)] text-[var(--color-ink)] shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-center gap-3 border-b border-[var(--color-border)] px-5 py-4">
          <Pencil size={19} className="shrink-0 text-[#FF6B35]" aria-hidden="true" />
          <h2 id="rename-mindmap-title" className="flex-1 text-base font-semibold">{t.renameMindmapTitle}</h2>
          <button type="button" onClick={onClose} disabled={busy} aria-label={t.close} className="rounded-md p-1.5 text-[var(--color-ink-faint)] hover:bg-[var(--color-surface-sunken)] hover:text-[var(--color-ink)] disabled:opacity-40">
            <X size={17} />
          </button>
        </header>

        <form onSubmit={(event) => void submit(event)}>
          <div className="space-y-4 px-5 py-5">
            <p id="rename-mindmap-description" className="text-sm leading-5 text-[var(--color-ink-muted)]">
              {t.renameMindmapDescription}
            </p>

            <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5">
              <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--color-ink-faint)]">{t.renameMindmapCurrentFile}</div>
              <code className="mt-1 block truncate text-xs text-[var(--color-ink-muted)]">{filename}</code>
            </div>

            <label className="block">
              <span className="text-xs font-medium text-[var(--color-ink-muted)]">{t.renameMindmapTitleLabel}</span>
              <input
                autoFocus
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => { if (event.key === "Escape" && !busy) onClose(); }}
                data-testid="rename-mindmap-input"
                className="mt-1 h-11 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm text-[var(--color-ink)] outline-none focus:border-[#FF6B35] focus:ring-2 focus:ring-[#FF6B35]/20"
              />
            </label>

            <div className="rounded-lg border border-[#FF6B35]/35 bg-[#FF6B35]/[0.07] px-3 py-2.5">
              <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#FF6B35]">{t.renameMindmapNewFile}</div>
              <code className="mt-1 block truncate text-xs text-[var(--color-ink)]">{nextFilename}</code>
            </div>

            {(error || submitError) && <p role="alert" data-testid="rename-mindmap-error" className="text-sm text-[#B84218]">{error || submitError}</p>}
          </div>

          <footer className="flex justify-end gap-2 border-t border-[var(--color-border)] px-5 py-4">
            <button type="button" onClick={onClose} disabled={busy} className="h-10 rounded-md border border-[var(--color-border-strong)] px-4 text-sm font-semibold text-[var(--color-ink)] hover:bg-[var(--color-surface-sunken)] disabled:opacity-40">
              {t.cancel}
            </button>
            <button type="submit" disabled={!canSubmit} data-testid="rename-mindmap-submit" className="h-10 rounded-md bg-[#FF6B35] px-4 text-sm font-semibold text-white hover:bg-[#E95F2F] disabled:cursor-not-allowed disabled:opacity-40">
              {busy ? t.renameMindmapBusy : t.rename}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
