/**
 * Version history of one note: the last versions that were replaced by a save.
 *
 * Local folders keep them as backup files (`FileStore`, `.bloommd/backups`), cloud workspaces as
 * rows of `bloom_document_revisions` (written by the sync server). Both keep the same number, so
 * the interface can show them the same way. Browser-safe: no Node imports.
 */

/** Versions kept per note. Writing the 21st version removes the oldest one. */
export const NOTE_HISTORY_LIMIT = 20;

export type NoteHistorySource = "local" | "cloud";

export interface NoteRevision {
  /** Opaque handle for restoring: the backup file name (local) or the revision id (cloud). */
  id: string;
  source: NoteHistorySource;
  /** ISO time at which this version was replaced by the next one. */
  replacedAt: string;
  /** Size of the Markdown in bytes. */
  size: number;
  /** Cloud only: the document version this was. */
  version?: number;
  /** Cloud only: display name of whoever saved this version, when known. */
  author?: string | null;
}

/** Newest first, the order every list shows. */
export function sortRevisionsNewestFirst<T extends Pick<NoteRevision, "replacedAt">>(revisions: readonly T[]): T[] {
  return [...revisions].sort((a, b) => b.replacedAt.localeCompare(a.replacedAt));
}
