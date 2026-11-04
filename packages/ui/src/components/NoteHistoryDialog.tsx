import { useCallback, useEffect, useRef, useState } from "react";
import { History, RotateCcw } from "lucide-react";
import type { NoteRevision } from "@bloommd/core/browser";
import { useLocale } from "../i18n/LocaleContext";

export interface NoteHistoryDialogProps {
  filename: string;
  /** The versions of the note, newest first. */
  loadRevisions: () => Promise<NoteRevision[]>;
  /**
   * Makes the version the note's current one and resolves once the editor shows it. The error
   * message may be `VERSION_CONFLICT`, `SYNC_ROOM_ACTIVE`, `SYNC_ROOM_PENDING` or `READ_ONLY` for
   * the dialog to explain; anything else reads as a plain failure.
   */
  onRestore: (revision: NoteRevision) => Promise<void>;
  /** False for readers: the versions are listed, restoring is not offered. */
  canRestore?: boolean;
  onClose: () => void;
}

function formatTime(iso: string, locale: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(locale === "de" ? "de-DE" : "en-GB", { dateStyle: "medium", timeStyle: "medium" }).format(date);
}

function formatSize(bytes: number, locale: string): string {
  const number = new Intl.NumberFormat(locale === "de" ? "de-DE" : "en-GB", { maximumFractionDigits: 1 });
  return bytes < 1024 ? `${bytes} B` : `${number.format(bytes / 1024)} KB`;
}

type LoadState = { kind: "loading" } | { kind: "error" } | { kind: "ready"; revisions: NoteRevision[] };

/**
 * The version history of one note: the versions that saves replaced, newest first, each with
 * "Restore" behind a confirmation. Where the versions live (local folder, cloud) is the host's
 * business; the dialog only shows which one each entry came from.
 */
export function NoteHistoryDialog({ filename, loadRevisions, onRestore, canRestore = true, onClose }: NoteHistoryDialogProps) {
  const { t, locale } = useLocale();
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [confirming, setConfirming] = useState<NoteRevision | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const loadRequest = useRef(0);
  // Hosts pass inline callbacks; the latest ones are used without reloading on every render.
  const callbacks = useRef({ loadRevisions, onRestore });
  callbacks.current = { loadRevisions, onRestore };

  const load = useCallback(async () => {
    const request = ++loadRequest.current;
    try {
      const revisions = await callbacks.current.loadRevisions();
      if (loadRequest.current === request) setState({ kind: "ready", revisions });
    } catch (error) {
      console.error("[BloomMD] Loading the note history failed:", error);
      if (loadRequest.current === request) setState({ kind: "error" });
    }
  }, []);

  useEffect(() => {
    setState({ kind: "loading" });
    void load();
    return () => {
      loadRequest.current += 1;
    };
  }, [load, filename]);

  const restore = useCallback(async () => {
    if (!confirming) return;
    setRestoring(true);
    setMessage(null);
    try {
      await callbacks.current.onRestore(confirming);
      setConfirming(null);
      setMessage({ kind: "success", text: t.historyRestored });
      // The version that was current is now an entry of its own.
      await load();
    } catch (error) {
      console.error("[BloomMD] Restoring a note version failed:", error);
      const code = error instanceof Error ? error.message : "";
      setConfirming(null);
      setMessage({
        kind: "error",
        text:
          code === "VERSION_CONFLICT" ? t.historyRestoreConflict
          : code === "SYNC_ROOM_ACTIVE" || code === "SYNC_ROOM_PENDING" ? t.historyRestoreRoomActive
          : code === "READ_ONLY" ? t.historyRestoreReadOnly
          : t.historyRestoreFailed,
      });
    } finally {
      setRestoring(false);
    }
  }, [confirming, load, t]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.stopPropagation();
        if (confirming) setConfirming(null);
        else onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={t.historyAriaLabel}
        data-testid="note-history-dialog"
        className="flex max-h-[85vh] w-full max-w-xl flex-col overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="border-b border-[var(--color-border)] px-5 py-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-[var(--color-ink)]">
            <History size={18} aria-hidden="true" />
            <span className="min-w-0 truncate">{t.historyTitle.replace("%filename%", filename)}</span>
          </h2>
          <p className="mt-1 text-sm leading-6 text-[var(--color-ink-muted)]">{t.historyDescription}</p>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto bg-[var(--color-surface)] p-3">
          {message && (
            <p
              role={message.kind === "error" ? "alert" : "status"}
              data-testid={`note-history-${message.kind}`}
              className={`mb-3 rounded-md px-3 py-2 text-sm ${message.kind === "error" ? "bg-[#FDECE7] text-[#9B3412]" : "bg-[#EAF6E9] text-[#2F6B2B]"}`}
            >
              {message.text}
            </p>
          )}

          {state.kind === "loading" && (
            <p className="p-3 text-sm text-[var(--color-ink-faint)]" data-testid="note-history-loading">{t.historyLoading}</p>
          )}
          {state.kind === "error" && (
            <p className="p-3 text-sm text-[#9B3412]" role="alert" data-testid="note-history-load-error">{t.historyLoadFailed}</p>
          )}
          {state.kind === "ready" && state.revisions.length === 0 && (
            <div className="px-3 py-8 text-center" data-testid="note-history-empty">
              <p className="text-sm font-semibold text-[var(--color-ink)]">{t.historyEmptyTitle}</p>
              <p className="mt-1 text-sm text-[var(--color-ink-muted)]">{t.historyEmpty}</p>
            </div>
          )}
          {state.kind === "ready" && state.revisions.length > 0 && (
            <ol className="space-y-1.5" data-testid="note-history-list">
              {state.revisions.map((revision) => (
                <li
                  key={`${revision.source}:${revision.id}`}
                  data-testid="note-history-entry"
                  className="flex items-center gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-3 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-[var(--color-ink)]">{t.historyReplacedAt.replace("%time%", formatTime(revision.replacedAt, locale))}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-[var(--color-ink-muted)]">
                      <span data-testid="note-history-source" className="rounded bg-[var(--color-surface-sunken)] px-1.5 py-px font-semibold">
                        {revision.source === "cloud" ? t.historySourceCloud : t.historySourceLocal}
                      </span>
                      {revision.version !== undefined && <span>{t.historyVersion.replace("%version%", String(revision.version))}</span>}
                      {revision.author && <span>{t.historyAuthor.replace("%author%", revision.author)}</span>}
                      <span>{formatSize(revision.size, locale)}</span>
                    </p>
                  </div>
                  {canRestore && (
                    <button
                      type="button"
                      data-testid="note-history-restore"
                      disabled={restoring}
                      onClick={() => { setMessage(null); setConfirming(revision); }}
                      className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-[var(--color-border-strong)] px-3 text-sm font-semibold text-[var(--color-ink)] hover:bg-[var(--color-surface-sunken)] disabled:opacity-50"
                    >
                      <RotateCcw size={14} aria-hidden="true" />
                      {t.historyRestore}
                    </button>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>

        {confirming && (
          <div role="alertdialog" aria-label={t.historyRestoreConfirmTitle} data-testid="note-history-confirm" className="border-t border-[var(--color-border)] bg-[var(--color-surface-raised)] px-5 py-4">
            <p className="text-sm font-semibold text-[var(--color-ink)]">{t.historyRestoreConfirmTitle}</p>
            <p className="mt-1 text-sm leading-6 text-[var(--color-ink-muted)]">{t.historyRestoreConfirm.replace("%time%", formatTime(confirming.replacedAt, locale))}</p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                data-testid="note-history-confirm-cancel"
                disabled={restoring}
                onClick={() => setConfirming(null)}
                className="inline-flex h-10 items-center justify-center rounded-md border border-[var(--color-border-strong)] px-4 text-sm font-semibold text-[var(--color-ink)] hover:bg-[var(--color-surface-sunken)] disabled:opacity-50"
              >
                {t.cancel}
              </button>
              <button
                type="button"
                data-testid="note-history-confirm-restore"
                disabled={restoring}
                onClick={() => void restore()}
                className="inline-flex h-10 items-center justify-center rounded-md bg-[#FF6B35] px-4 text-sm font-semibold text-white hover:bg-[#E95F2F] disabled:opacity-50"
              >
                {restoring ? t.historyRestoring : t.historyRestoreConfirmAction}
              </button>
            </div>
          </div>
        )}

        <footer className="flex justify-end border-t border-[var(--color-border)] px-5 py-3">
          <button
            type="button"
            data-testid="note-history-close"
            onClick={onClose}
            className="inline-flex h-10 items-center justify-center rounded-md border border-[var(--color-border-strong)] px-4 text-sm font-semibold text-[var(--color-ink)] hover:bg-[var(--color-surface-sunken)]"
          >
            {t.close}
          </button>
        </footer>
      </section>
    </div>
  );
}
