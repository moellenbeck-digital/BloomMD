import { extname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MARKDOWN_EXTENSIONS = [".md", ".markdown"];

/** True for the file types BloomMD is registered to open. */
export function isMarkdownPath(filePath: string): boolean {
  return MARKDOWN_EXTENSIONS.includes(extname(filePath).toLowerCase());
}

/**
 * Extracts an absolute local path from an external open request.
 *
 * Deliberately does not decide whether the target is a file or a folder: only the filesystem knows,
 * and stat'ing here would make the function async and untestable without disk. The caller checks and
 * enforces the Markdown extension for files — folders are opened as a workspace and have no
 * extension to check.
 */
export function parseExternalPath(rawUrl: string): string | null {
  if (!rawUrl || rawUrl.length > 16_384 || /[\0\r\n]/.test(rawUrl)) return null;
  try {
    const url = new URL(rawUrl);
    let filePath = "";
    if (url.protocol === "file:") {
      filePath = fileURLToPath(url);
    } else if (
      url.protocol === "bloommd:"
      && url.hostname === "open"
      && !url.username
      && !url.password
      && (url.pathname === "" || url.pathname === "/")
    ) {
      filePath = url.searchParams.get("path") ?? "";
    } else {
      return null;
    }

    if (!isAbsolute(filePath)) return null;
    return filePath;
  } catch {
    return null;
  }
}

/** Heading ids as BloomMD writes them (`<!-- bloommd:id=… -->`). */
const NODE_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

/** A local path to open, and optionally the node to select once the document is shown. */
export interface ExternalTarget {
  path: string;
  nodeId: string | null;
}

/** The `node` parameter of a `bloommd://open` link, when it is a well-formed node id. */
export function parseExternalNodeId(rawUrl: string): string | null {
  if (!rawUrl || rawUrl.length > 16_384) return null;
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "bloommd:") return null;
    const nodeId = url.searchParams.get("node");
    return nodeId && NODE_ID_RE.test(nodeId) ? nodeId : null;
  } catch {
    return null;
  }
}

/** Path plus node for `bloommd://open?path=…&node=…`; the node is dropped when malformed. */
export function parseExternalTarget(rawUrl: string): ExternalTarget | null {
  const path = parseExternalPath(rawUrl);
  return path ? { path, nodeId: parseExternalNodeId(rawUrl) } : null;
}

export function isExternalNodeId(value: unknown): value is string {
  return typeof value === "string" && NODE_ID_RE.test(value);
}

/**
 * Path from a command line argument, for `bloommd ./notes` and `bloommd note.md`.
 *
 * Relative arguments are resolved against the working directory the user typed them in, which is
 * what makes `bloommd .` behave the way every other terminal tool does.
 */
export function parseCliPath(argument: string | undefined, cwd: string): string | null {
  if (!argument) return null;
  const trimmed = argument.trim();
  if (!trimmed || trimmed.startsWith("-") || /[\0\r\n]/.test(trimmed)) return null;
  if (trimmed.length > 4096) return null;
  if (trimmed.startsWith("bloommd://") || trimmed.startsWith("file://")) {
    return parseExternalPath(trimmed);
  }
  return resolve(cwd, trimmed);
}

/**
 * Backwards-compatible wrapper: a path that is only valid when it points at Markdown.
 *
 * Kept because the `bloommd://` scheme and the file association were documented around this
 * behaviour before folders were supported.
 */
export function parseExternalMarkdownUrl(rawUrl: string): string | null {
  const filePath = parseExternalPath(rawUrl);
  if (!filePath || !isMarkdownPath(filePath)) return null;
  return filePath;
}
