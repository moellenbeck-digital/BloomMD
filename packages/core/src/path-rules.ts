/**
 * Workspace path rules, with no filesystem dependency.
 *
 * Split out from `paths.ts` because the browser bundle needs these rules — the workspace graph
 * validates every path it ingests — while `node:path` must not be pulled into it. The rules are
 * the same for both: only the functions that touch a real directory need Node.
 */

/**
 * Normalizes a Markdown path that may sit inside folders.
 *
 * Folders are ordinary subdirectories rather than metadata, because a tag-based folder would vanish
 * the moment the same vault is opened in Obsidian or committed to git — which would break the one
 * promise BloomMD makes about its files.
 *
 * Traversal stays forbidden. Each segment is validated on its own, so a path can nest but can never
 * point outside the workspace.
 */
export function normalizeMarkdownPath(inputPath: string): string {
  const trimmed = inputPath.trim().replace(/\\/g, "/");
  if (!trimmed) throw new Error("Path is required");
  if (trimmed.startsWith("/") || /^[A-Za-z]:/.test(trimmed)) {
    throw new Error("Path must be relative to the workspace");
  }

  const segments = trimmed.split("/").filter((segment) => segment !== "");
  if (segments.length === 0) throw new Error("Path is required");
  for (const segment of segments) {
    if (segment === "." || segment === "..") throw new Error("Path must not traverse directories");
    if (/[\\\x00-\x1F]/.test(segment)) throw new Error("Path contains unsupported characters");
  }

  const last = segments[segments.length - 1]!;
  segments[segments.length - 1] = /\.(md|markdown)$/i.test(last) ? last : `${last}.md`;
  return segments.join("/");
}

/** Normalizes a folder path. Same rules, without the Markdown extension. */
export function normalizeFolderPath(inputPath: string): string {
  const trimmed = inputPath.trim().replace(/\\/g, "/");
  if (!trimmed) throw new Error("Folder name is required");
  if (trimmed.startsWith("/") || /^[A-Za-z]:/.test(trimmed)) {
    throw new Error("Folder must be relative to the workspace");
  }

  const segments = trimmed.split("/").filter((segment) => segment !== "");
  if (segments.length === 0) throw new Error("Folder name is required");
  for (const segment of segments) {
    if (segment === "." || segment === "..") throw new Error("Folder must not traverse directories");
    if (/[\\\x00-\x1F]/.test(segment)) throw new Error("Folder contains unsupported characters");
  }
  return segments.join("/");
}

/**
 * Derives the stable Markdown filename used when a mindmap is renamed from its root title.
 *
 * This deliberately stays browser-safe so Web and Desktop use exactly the same filename rule.
 */
export function filenameForTitle(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[äöüß]/g, (character: string) => ({ ä: "ae", ö: "oe", ü: "ue", ß: "ss" })[character] ?? character)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return portableMarkdownFilename(`${slug || "mindmap"}.md`);
}

/** Keeps the existing folder when deriving a Markdown filename from a mindmap title. */
export function filenameForTitleInPath(existingPath: string, title: string): string {
  const normalizedPath = existingPath.trim().replace(/\\/g, "/");
  const separator = normalizedPath.lastIndexOf("/");
  const directory = separator >= 0 ? normalizedPath.slice(0, separator + 1) : "";
  return `${directory}${filenameForTitle(title)}`;
}

/** Portable names for newly created files; existing names must never be silently rewritten. */
export function portableMarkdownFilename(filename: string): string {
  const trimmed = filename.replace(/[ .]+$/g, "");
  // Windows reserves device names even when followed by one or more extensions.
  const device = /^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i;
  return device.test(trimmed) ? `_${trimmed}` : trimmed;
}
