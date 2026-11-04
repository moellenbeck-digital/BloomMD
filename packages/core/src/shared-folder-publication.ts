import { normalizeMarkdownPath, sanitizeMarkdownFilename } from "./paths";

/**
 * Deterministic plan for publishing one explicitly chosen local folder as a shared workspace.
 *
 * The plan is pure: it sees only relative POSIX paths and byte sizes, never file content and never
 * an absolute folder path. Nothing in it can reach the server; the desktop process turns an
 * approved plan into uploads after the person confirmed the preview.
 *
 * Mapping (documented in the collaboration docs): the cloud store addresses documents by a flat
 * filename (`sanitizeMarkdownFilename` turns every `/` into `-` on create and rename), so a
 * relative path `notes/2026/idea.md` becomes the cloud name `notes__2026__idea.md`. Names that
 * would not survive the cloud's own filename rule unchanged, that collide after flattening, or
 * that exceed the size limit are listed with a reason and can never be included.
 */
export const SHARED_FOLDER_NAME_SEPARATOR = "__";

/**
 * A freshly shared document is opened through the sync server, whose messages are capped at
 * 1 MiB by default (`SYNC_MAX_MESSAGE_BYTES`); larger files could be uploaded but not opened.
 */
export const SHARED_FOLDER_MAX_FILE_BYTES = 1024 * 1024;

/** Suffix (before the extension) for the "upload under another name" strategy. */
export const SHARED_FOLDER_CONFLICT_SUFFIX = "-local";

export type SharedFolderConflictStrategy = "keep-cloud" | "suffix";

export type SharedFolderBlockReason = "name-not-portable" | "name-collision" | "too-large";

export type SharedFolderPlanStatus =
  /** Will be uploaded after confirmation, under `uploadFilename`. */
  | "upload"
  /** A cloud document of that name exists and the strategy keeps it untouched. */
  | "conflict"
  /** Left out by the person. */
  | "excluded"
  /** Cannot be included; see `reason`. */
  | "blocked";

export interface SharedFolderLocalFile {
  /** POSIX path relative to the chosen folder. */
  relativePath: string;
  sizeBytes: number;
}

export interface SharedFolderPlanInput {
  files: readonly SharedFolderLocalFile[];
  /** Relative file paths or folder paths; a folder path excludes everything below it. */
  excluded?: readonly string[];
  /** Filenames of the target workspace, used to detect conflicts. */
  existingCloudFilenames: readonly string[];
  strategy: SharedFolderConflictStrategy;
  maxFileBytes?: number;
}

export interface SharedFolderPlanItem {
  relativePath: string;
  sizeBytes: number;
  status: SharedFolderPlanStatus;
  /** Name the flattening gives the file; null when the name is not portable. */
  cloudFilename: string | null;
  /** Name the upload will use; set only for `upload`, differs from `cloudFilename` when suffixed. */
  uploadFilename: string | null;
  /** True when the strategy renamed the upload because the cloud name was taken. */
  renamedByStrategy?: boolean;
  reason?: SharedFolderBlockReason;
}

export interface SharedFolderPlanTotals {
  fileCount: number;
  uploadCount: number;
  uploadBytes: number;
  conflictCount: number;
  excludedCount: number;
  blockedCount: number;
}

export interface SharedFolderPlan {
  strategy: SharedFolderConflictStrategy;
  items: SharedFolderPlanItem[];
  totals: SharedFolderPlanTotals;
}

/** `a/b/c.md` → `a__b__c.md`; null when the result is not a name the cloud accepts unchanged. */
export function cloudFilenameForRelativePath(relativePath: string): string | null {
  let normalized: string;
  try {
    normalized = normalizeMarkdownPath(relativePath);
  } catch {
    return null;
  }
  if (normalized !== relativePath) return null;
  const flat = normalized.split("/").join(SHARED_FOLDER_NAME_SEPARATOR);
  try {
    return sanitizeMarkdownFilename(flat) === flat ? flat : null;
  } catch {
    return null;
  }
}

/** True when `path` is `excluded` itself or lies inside the excluded folder. */
export function isSharedFolderPathExcluded(path: string, excluded: readonly string[]): boolean {
  return excluded.some((entry) => {
    const prefix = entry.replace(/\/+$/, "");
    return prefix !== "" && (path === prefix || path.startsWith(`${prefix}/`));
  });
}

export function planSharedFolderPublication(input: SharedFolderPlanInput): SharedFolderPlan {
  const maxFileBytes = input.maxFileBytes ?? SHARED_FOLDER_MAX_FILE_BYTES;
  const excluded = input.excluded ?? [];
  const files = [...input.files].sort((left, right) => (left.relativePath < right.relativePath ? -1 : left.relativePath > right.relativePath ? 1 : 0));

  const existing = new Set(input.existingCloudFilenames.map((name) => name.toLowerCase()));
  const flatNames = files.map((file) => cloudFilenameForRelativePath(file.relativePath));

  const flatCounts = new Map<string, number>();
  for (const flat of flatNames) {
    if (flat) flatCounts.set(flat.toLowerCase(), (flatCounts.get(flat.toLowerCase()) ?? 0) + 1);
  }

  // Every flattened name stays reserved so a suffixed upload can never take another file's name.
  const taken = new Set<string>([...existing, ...flatCounts.keys()]);

  const items = files.map((file, index): SharedFolderPlanItem => {
    const flat = flatNames[index] ?? null;
    const base = { relativePath: file.relativePath, sizeBytes: file.sizeBytes, cloudFilename: flat, uploadFilename: null };
    if (!flat) return { ...base, status: "blocked", reason: "name-not-portable" };
    if ((flatCounts.get(flat.toLowerCase()) ?? 0) > 1) return { ...base, status: "blocked", reason: "name-collision" };
    if (file.sizeBytes > maxFileBytes) return { ...base, status: "blocked", reason: "too-large" };
    if (isSharedFolderPathExcluded(file.relativePath, excluded)) return { ...base, status: "excluded" };
    if (!existing.has(flat.toLowerCase())) return { ...base, status: "upload", uploadFilename: flat };
    if (input.strategy === "keep-cloud") return { ...base, status: "conflict" };

    const uploadFilename = suffixedFilename(flat, taken);
    taken.add(uploadFilename.toLowerCase());
    return { ...base, status: "upload", uploadFilename, renamedByStrategy: true };
  });

  const totals: SharedFolderPlanTotals = {
    fileCount: items.length,
    uploadCount: 0,
    uploadBytes: 0,
    conflictCount: 0,
    excludedCount: 0,
    blockedCount: 0,
  };
  for (const item of items) {
    if (item.status === "upload") {
      totals.uploadCount += 1;
      totals.uploadBytes += item.sizeBytes;
    } else if (item.status === "conflict") totals.conflictCount += 1;
    else if (item.status === "excluded") totals.excludedCount += 1;
    else totals.blockedCount += 1;
  }
  return { strategy: input.strategy, items, totals };
}

function suffixedFilename(flat: string, taken: ReadonlySet<string>): string {
  const extension = /\.markdown$/i.test(flat) ? flat.slice(-".markdown".length) : flat.slice(-".md".length);
  const stem = flat.slice(0, flat.length - extension.length);
  for (let attempt = 1; ; attempt += 1) {
    const marker = attempt === 1 ? SHARED_FOLDER_CONFLICT_SUFFIX : `${SHARED_FOLDER_CONFLICT_SUFFIX}-${attempt}`;
    const candidate = `${stem}${marker}${extension}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}
