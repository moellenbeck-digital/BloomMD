import type { MindMapDocument, MindMapListEntry, MindMapNode } from "@bloommd/core/browser";

/**
 * What the shared UI needs from the host it runs in.
 *
 * `@bloommd/ui` never talks to a file system or an HTTP API itself. The host (web app, desktop
 * webview, mobile shell, …) hands it a `PlatformAdapter` through `PlatformProvider`, and every
 * file or API access of the shared components goes through that object. What stays outside:
 * the desktop file system lives in the main process, mobile stays on Capacitor, and the
 * Obsidian vault stays inside the plugin.
 */

export type PlatformErrorCode =
  /** The host refused the request because there is no (valid) session. */
  | "unauthorized"
  /** The file or resource does not exist. */
  | "not-found"
  /** The stored version moved on since the document was read. */
  | "conflict"
  /** This host has no implementation for the operation. */
  | "unsupported"
  /** The host or its backend could not be reached or answered with an error. */
  | "unavailable";

/** Every adapter fails with this class, so components can react to `code` instead of parsing messages. */
export class PlatformError extends Error {
  readonly code: PlatformErrorCode;
  /** HTTP status when the failure came from an HTTP backend. */
  readonly status?: number;

  constructor(code: PlatformErrorCode, message: string, options?: { status?: number; cause?: unknown }) {
    super(message, options?.cause === undefined ? undefined : { cause: options.cause });
    this.name = "PlatformError";
    this.code = code;
    if (options?.status !== undefined) this.status = options.status;
  }
}

export function isPlatformError(error: unknown): error is PlatformError {
  return error instanceof PlatformError;
}

/** A document as it crosses a host boundary: JSON-safe, `nodes` as a plain record. */
export interface SerializedMindMapDocument {
  filePath: string;
  frontmatter: MindMapDocument["frontmatter"];
  nodes: Record<string, MindMapNode>;
  rootId: string;
  preamble?: string;
  storage?: MindMapDocument["storage"];
}

export function hydrateDocument(data: SerializedMindMapDocument): MindMapDocument {
  return {
    ...data,
    nodes: new Map(Object.entries(data.nodes)),
    rawMarkdown: "",
  };
}

export interface LinkPreview {
  title?: string;
  description?: string;
  image?: string;
}

export interface PlatformWriteResult {
  /** Version metadata of a cloud-backed document after the write; absent for plain files. */
  storage?: MindMapDocument["storage"];
}

export interface PlatformFiles {
  list(): Promise<MindMapListEntry[]>;
  read(filename: string): Promise<MindMapDocument>;
  /** Creates a new file. */
  create(filename: string, markdown: string): Promise<void>;
  /** Overwrites an existing file. `storage` carries the version the document was read with. */
  write(filename: string, markdown: string, options?: { storage?: MindMapDocument["storage"] }): Promise<PlatformWriteResult>;
  remove(filename: string): Promise<void>;
  rename(filename: string, newFilename: string): Promise<{ filename: string; version?: number }>;
}

export interface PlatformApi {
  linkPreview(url: string): Promise<LinkPreview>;
}

export interface PlatformAdapter {
  files: PlatformFiles;
  api: PlatformApi;
}
