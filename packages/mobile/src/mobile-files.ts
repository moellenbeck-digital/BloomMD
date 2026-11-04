import { normalizeMarkdownPath } from "@bloommd/core/browser";

export function markdownFilename(title: string, id: string, existing: Iterable<string> = []) {
  const slug = title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "mindmap";
  const suffix = id.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 12) || Date.now().toString(36);
  const names = new Set(Array.from(existing, (name) => name.toLowerCase()));
  let candidate = `${slug}-${suffix}.md`;
  let counter = 2;
  while (names.has(candidate.toLowerCase())) candidate = `${slug}-${suffix}-${counter++}.md`;
  return candidate;
}

export function normalizeMobileMarkdownFilename(filename: string) {
  const value = filename.trim();
  if (!value || value === "." || value === ".." || value.startsWith("..") || /[\\/\0-\x1f]/.test(value)) {
    throw new Error("Invalid Markdown filename.");
  }
  return /\.(md|markdown)$/i.test(value) ? value : `${value}.md`;
}

/**
 * A note path inside the app folder, "Schule/Physik.md" or "Notiz.md". The path rules (nesting is
 * fine; `..`, `.`, absolute paths and control characters are refused) are core's
 * `normalizeMarkdownPath`, the same as on the desktop. Only the file name also has to pass
 * {@link normalizeMobileMarkdownFilename}.
 */
export function normalizeMobileMarkdownPath(path: string) {
  const normalized = normalizeMarkdownPath(path);
  const slash = normalized.lastIndexOf("/");
  return `${normalized.slice(0, slash + 1)}${normalizeMobileMarkdownFilename(normalized.slice(slash + 1))}`;
}

const SKIPPED_FOLDERS = /(^|\/)(\.|node_modules\/|\.obsidian\/|\.trash\/)/;

/** Obsidian's own folders, dot folders and `node_modules` are never part of the note list. */
export function isSkippedPath(path: string): boolean {
  return SKIPPED_FOLDERS.test(path);
}

/** True for a folder path ("Schule/.obsidian") that the folder list leaves out, like its notes. */
export function isSkippedFolder(folder: string): boolean {
  return isSkippedPath(`${folder}/`);
}

/** Markdown of a new, empty note; the title is quoted, so a ":" in it stays part of the title. */
export function newNoteMarkdown(title: string, id: string, now: string): string {
  return `---\ntitle: ${JSON.stringify(title)}\nid: ${id}\ncreated: "${now}"\nupdated: "${now}"\nlayout:\n  direction: LR\n---\n\n# ${title}\n`;
}
