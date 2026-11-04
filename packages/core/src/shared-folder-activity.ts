import type { SharedFolderLocalFile } from "./shared-folder-publication";

/**
 * Detects what changed in a published local folder since its last publication.
 *
 * The result only describes. It never decides: a new file is not uploaded, a missing file is not
 * removed from the cloud and a rename is not applied. Every entry waits for the person's choice.
 * The module sees relative POSIX paths, sizes and content hashes, never an absolute path.
 */
export interface SharedFolderBoundFile {
  relativePath: string;
  documentId: string;
  cloudFilename: string;
  /** Hash of the last Markdown both sides agreed on (`hashSharedDocumentMarkdown`). */
  lastAcknowledgedMarkdownHash: string;
}

export interface SharedFolderRemovedEntry {
  kind: "removed";
  file: SharedFolderBoundFile;
}

export interface SharedFolderRenamedEntry {
  kind: "renamed";
  file: SharedFolderBoundFile;
  /** The new local path of the same content. */
  to: SharedFolderLocalFile;
}

export interface SharedFolderNewEntry {
  kind: "new";
  local: SharedFolderLocalFile;
}

export type SharedFolderActivityEntry = SharedFolderNewEntry | SharedFolderRemovedEntry | SharedFolderRenamedEntry;

export interface SharedFolderActivityInput {
  bound: readonly SharedFolderBoundFile[];
  /** Every path the person already knows about: published, excluded, blocked or dismissed. */
  knownPaths: ReadonlySet<string>;
  /** The folder as it is now. */
  local: readonly SharedFolderLocalFile[];
  /**
   * Content hash of a local file, or null when it cannot be read. Called only for files that
   * could be one side of a rename, so a folder without removed files reads nothing.
   */
  hashOf(relativePath: string): Promise<string | null>;
  /** New paths the person asked to treat as a new file plus a removed one, not as a rename. */
  splitRenames?: ReadonlySet<string>;
}

const byPath = (left: { relativePath: string }, right: { relativePath: string }) =>
  left.relativePath < right.relativePath ? -1 : left.relativePath > right.relativePath ? 1 : 0;

/**
 * A rename is reported only when it is certain: exactly one removed file and exactly one new file
 * carry the same content hash. Anything less certain stays "new" plus "removed", as the person
 * would otherwise be asked to confirm a guess.
 */
export async function detectSharedFolderActivity(input: SharedFolderActivityInput): Promise<SharedFolderActivityEntry[]> {
  const localPaths = new Set(input.local.map((file) => file.relativePath));
  const removed = input.bound.filter((file) => !localPaths.has(file.relativePath)).sort(byPath);
  const boundPaths = new Set(input.bound.map((file) => file.relativePath));
  const added = input.local
    .filter((file) => !boundPaths.has(file.relativePath) && !input.knownPaths.has(file.relativePath))
    .sort((left, right) => byPath({ relativePath: left.relativePath }, { relativePath: right.relativePath }));

  const renames = new Map<string, { file: SharedFolderBoundFile; to: SharedFolderLocalFile }>();
  if (removed.length > 0 && added.length > 0) {
    const candidates = added.filter((file) => !input.splitRenames?.has(file.relativePath));
    const addedHashes = new Map<string, SharedFolderLocalFile[]>();
    for (const file of candidates) {
      const hash = await input.hashOf(file.relativePath);
      if (hash) addedHashes.set(hash, [...(addedHashes.get(hash) ?? []), file]);
    }
    for (const file of removed) {
      const sameRemoved = removed.filter((other) => other.lastAcknowledgedMarkdownHash === file.lastAcknowledgedMarkdownHash);
      const matches = addedHashes.get(file.lastAcknowledgedMarkdownHash) ?? [];
      const target = matches[0];
      if (sameRemoved.length === 1 && matches.length === 1 && target) renames.set(file.relativePath, { file, to: target });
    }
  }

  const renamedTargets = new Set([...renames.values()].map((entry) => entry.to.relativePath));
  const entries: SharedFolderActivityEntry[] = [];
  for (const file of removed) {
    const rename = renames.get(file.relativePath);
    entries.push(rename ? { kind: "renamed", file, to: rename.to } : { kind: "removed", file });
  }
  for (const file of added) {
    if (!renamedTargets.has(file.relativePath)) entries.push({ kind: "new", local: file });
  }
  return entries;
}
