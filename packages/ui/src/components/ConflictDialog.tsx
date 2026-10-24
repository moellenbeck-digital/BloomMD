import { useMemo } from "react";
import { collapseUnchanged, diffLines, diffStats } from "@bloommd/core/browser";
import { useLocale } from "../i18n/LocaleContext";

export type ConflictResolution = "reload" | "keep-mine" | "save-copy";

export interface ConflictDialogProps {
  filename: string;
  /** The Markdown the user tried to save. */
  mine: string;
  /** The Markdown currently stored, written by someone or something else. */
  theirs: string;
  onResolve: (resolution: ConflictResolution) => void;
  onDismiss: () => void;
}

const LINE_STYLE: Record<string, string> = {
  added: "bg-[#EAF6E9] text-[#2F6B2B]",
  removed: "bg-[#FDECE7] text-[#9B3412]",
  equal: "text-[var(--color-ink-muted)]",
};

const PREFIX: Record<string, string> = { added: "+", removed: "-", equal: " " };

/**
 * Shown when a save is refused because the stored document moved on.
 *
 * The old behaviour was an error telling the user to reload before saving again, which silently
 * costs them their edit and never shows what the other version contains. Deciding requires seeing
 * the difference, so the diff is the dialog rather than an afterthought.
 *
 * Markdown stays the unit of comparison — including the `bloommd:id` comments — because that is what
 * actually gets written to disk and what the user can reason about afterwards.
 */
export function ConflictDialog({ filename, mine, theirs, onResolve, onDismiss }: ConflictDialogProps) {
  const { t } = useLocale();
  const { rows, stats } = useMemo(() => {
    const lines = diffLines(theirs, mine);
    return { rows: collapseUnchanged(lines), stats: diffStats(lines) };
  }, [mine, theirs]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onDismiss}>
      <section
        role="dialog"
        aria-modal="true"
        aria-label={t.conflictAriaLabel}
        data-testid="conflict-dialog"
        className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="border-b border-[var(--color-border)] px-5 py-4">
          <h2 className="text-lg font-semibold text-[var(--color-ink)]">{t.conflictTitle}</h2>
          <p className="mt-1 text-sm leading-6 text-[var(--color-ink-muted)]">
            {t.conflictDescription.replace("%filename%", filename)} {t.conflictStoredColor}, {t.conflictMineColor}.
          </p>
          <p className="mt-2 text-xs text-[var(--color-ink-muted)]">
            {t.conflictStats.replace("%added%", String(stats.added)).replace("%removed%", String(stats.removed)).replace("%unchanged%", String(stats.unchanged))}
          </p>
        </header>

        <div className="min-h-0 flex-1 overflow-auto bg-[var(--color-surface)]">
          <pre className="min-w-full font-mono text-xs leading-5" data-testid="conflict-diff">
            {rows.map((row, index) =>
              row.kind === "skipped" ? (
                <div key={`skip-${index}`} className="bg-[var(--color-surface-sunken)] px-4 py-1 text-[var(--color-ink-faint)]">
                  {t.conflictUnchangedLines.replace("%count%", String(row.count))}
                </div>
              ) : (
                <div key={`${row.kind}-${index}`} className={`px-4 ${LINE_STYLE[row.kind]}`}>
                  {PREFIX[row.kind]} {row.text || " "}
                </div>
              ),
            )}
          </pre>
        </div>

        <footer className="flex flex-col gap-2 border-t border-[var(--color-border)] px-5 py-4 sm:flex-row sm:justify-end">
          <button
            type="button"
            data-testid="conflict-reload"
            onClick={() => onResolve("reload")}
            className="inline-flex h-10 items-center justify-center rounded-md border border-[var(--color-border-strong)] px-4 text-sm font-semibold text-[var(--color-ink)] hover:bg-[var(--color-surface-sunken)]"
          >
            {t.conflictLoadStored}
          </button>
          <button
            type="button"
            data-testid="conflict-save-copy"
            onClick={() => onResolve("save-copy")}
            className="inline-flex h-10 items-center justify-center rounded-md border border-[var(--color-border-strong)] px-4 text-sm font-semibold text-[var(--color-ink)] hover:bg-[var(--color-surface-sunken)]"
          >
            {t.conflictSaveCopy}
          </button>
          <button
            type="button"
            data-testid="conflict-keep-mine"
            onClick={() => onResolve("keep-mine")}
            className="inline-flex h-10 items-center justify-center rounded-md bg-[#FF6B35] px-4 text-sm font-semibold text-white hover:bg-[#E95F2F]"
          >
            {t.conflictKeepMine}
          </button>
        </footer>
      </section>
    </div>
  );
}
