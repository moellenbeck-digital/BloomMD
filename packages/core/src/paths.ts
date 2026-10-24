import { basename, resolve, sep } from "node:path";

// The pure rules live in a module the browser bundle can import without pulling in `node:path`.
import { portableMarkdownFilename, filenameForTitle, filenameForTitleInPath, normalizeFolderPath, normalizeMarkdownPath } from "./path-rules";

export { filenameForTitle, filenameForTitleInPath, normalizeFolderPath, normalizeMarkdownPath };

const UNSAFE_FILENAME_CHARS = /[\\/:*?"<>|\x00-\x1F]/g;

export function normalizeMarkdownFilename(filename: string): string {
  const trimmed = filename.trim();

  if (!trimmed) {
    throw new Error("Filename is required");
  }

  if (trimmed.includes("/") || trimmed.includes("\\") || basename(trimmed) !== trimmed) {
    throw new Error("Filename must not contain path separators");
  }

  if (trimmed === "." || trimmed === ".." || trimmed.startsWith("..")) {
    throw new Error("Filename must not traverse directories");
  }

  return /\.(md|markdown)$/i.test(trimmed) ? trimmed : `${trimmed}.md`;
}

export function sanitizeMarkdownFilename(filename: string): string {
  const cleaned = filename
    .trim()
    .replace(UNSAFE_FILENAME_CHARS, "-")
    .replace(/\s+/g, " ")
    .replace(/^\.+/, "")
    .replace(/-+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "")
    .trim();

  return portableMarkdownFilename(normalizeMarkdownFilename(cleaned.replace(/[ .]+$/g, "") || "mindmap"));
}

export function resolveMarkdownPath(baseDir: string, filename: string): string {
  const normalized = normalizeMarkdownPath(filename);
  assertNativePath(normalized);
  const resolvedBase = resolve(baseDir);
  // Accepts folders; the containment check below is the guarantee, not the shape of the input.
  const resolvedPath = resolve(resolvedBase, normalized);

  if (resolvedPath !== resolvedBase && !resolvedPath.startsWith(`${resolvedBase}${sep}`)) {
    throw new Error("Resolved path escapes base directory");
  }

  return resolvedPath;
}

export function resolveFolderPath(baseDir: string, folderPath: string): string {
  const resolvedBase = resolve(baseDir);
  const normalized = normalizeFolderPath(folderPath);
  assertNativePath(normalized);
  const resolvedPath = resolve(resolvedBase, normalized);

  if (resolvedPath !== resolvedBase && !resolvedPath.startsWith(`${resolvedBase}${sep}`)) {
    throw new Error("Resolved path escapes base directory");
  }

  return resolvedPath;
}

export function assertPathInDirectory(baseDir: string, filePath: string): string {
  const resolvedBase = resolve(baseDir);
  const resolvedPath = resolve(filePath);

  if (resolvedPath !== resolvedBase && !resolvedPath.startsWith(`${resolvedBase}${sep}`)) {
    throw new Error("File path escapes base directory");
  }

  return resolvedPath;
}

/** Windows colons can address alternate data streams, not ordinary document filenames. */
function assertNativePath(path: string): void {
  if (process.platform === "win32" && /[<>:"|?*]/.test(path)) {
    throw new Error("Path contains characters unsupported by Windows");
  }
}
