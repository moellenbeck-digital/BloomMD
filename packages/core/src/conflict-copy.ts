/**
 * Conflict copies: the note a mobile app writes next to the original when the file changed on
 * another device while it was being edited ("Physik (iPad-Konflikt).md", then
 * "Physik (iPad-Konflikt 2).md", …). The naming scheme lives here, once. The apps create the names
 * with `conflictCopyPath` and every list recognises them with `parseConflictCopy`.
 *
 * Browser-safe: no Node imports.
 */

/** What each mobile platform calls its conflict copies. */
export const CONFLICT_COPY_LABELS = {
  ios: "iPad-Konflikt",
  android: "Android-Konflikt",
} as const;

export type ConflictCopyLabel = (typeof CONFLICT_COPY_LABELS)[keyof typeof CONFLICT_COPY_LABELS];

/** "Ordner/Physik.md" → "Ordner/Physik (iPad-Konflikt).md", then "… (iPad-Konflikt 2).md", … */
export function conflictCopyPath(path: string, label: string, attempt: number): string {
  const match = /^(.*?)(\.(?:md|markdown))?$/i.exec(path)!;
  return `${match[1]} (${label}${attempt > 1 ? ` ${attempt}` : ""})${match[2] ?? ".md"}`;
}

export interface ConflictCopyInfo {
  /** The platform label from the file name, e.g. "iPad-Konflikt". */
  label: ConflictCopyLabel;
  /** 1 for the first copy, 2 for "(iPad-Konflikt 2)", … */
  attempt: number;
  /** Path of the note the copy was made from ("Ordner/Physik.md"). It may no longer exist. */
  originalPath: string;
}

const LABEL_PATTERN = Object.values(CONFLICT_COPY_LABELS).join("|");
const CONFLICT_COPY = new RegExp(`^(.+) \\((${LABEL_PATTERN})(?: (\\d+))?\\)(\\.(?:md|markdown))$`, "i");

/** Reads the conflict-copy scheme of `conflictCopyPath` back; null for every other file name. */
export function parseConflictCopy(path: string): ConflictCopyInfo | null {
  const match = CONFLICT_COPY.exec(path);
  if (!match) return null;
  const label = Object.values(CONFLICT_COPY_LABELS).find((candidate) => candidate.toLowerCase() === match[2]!.toLowerCase());
  if (!label) return null;
  return { label, attempt: match[3] ? Number(match[3]) : 1, originalPath: `${match[1]}${match[4]}` };
}

export function isConflictCopy(path: string): boolean {
  return parseConflictCopy(path) !== null;
}

/**
 * The listed note a conflict copy was made from, or null when the path is not a conflict copy or
 * the original is gone. Names are compared case-insensitively, as the stores do.
 */
export function findConflictCopyOriginal(path: string, files: ReadonlyArray<{ filename: string }>): string | null {
  const info = parseConflictCopy(path);
  if (!info) return null;
  const wanted = info.originalPath.toLowerCase();
  return files.find((file) => file.filename.toLowerCase() === wanted)?.filename ?? null;
}
