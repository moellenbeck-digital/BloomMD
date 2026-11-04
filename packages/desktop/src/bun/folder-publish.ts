import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import {
  createLocalSharedDocumentState,
  hashSharedDocumentMarkdown,
  SHARED_FOLDER_MAX_FILE_BYTES,
  transitionSharedDocumentState,
  type SharedDocumentBinding,
  type SharedFolderLocalFile,
  type SharedFolderPlan,
} from "@bloommd/core";

/** A folder with more Markdown files than this is not previewable; the person picks a smaller one. */
export const FOLDER_PUBLISH_MAX_FILES = 5000;

/** Documents per audit request; matches the server's `SHARED_FOLDER_AUDIT_MAX_DOCUMENTS`. */
export const FOLDER_PUBLISH_AUDIT_CHUNK = 200;

/**
 * Lists the Markdown files of a folder as relative POSIX paths, read-only.
 *
 * Same visibility as the local workspace listing: dot-folders (`.git`, `.obsidian`, `.bloommd`)
 * and `node_modules` are skipped, symbolic links are never followed, and other file types are
 * not even listed, so they can never be part of a preview or an upload.
 */
export async function scanFolderForPublication(folderPath: string): Promise<SharedFolderLocalFile[]> {
  const found: SharedFolderLocalFile[] = [];

  async function visit(prefix: string): Promise<void> {
    const entries = await readdir(join(folderPath, prefix), { withFileTypes: true });
    for (const entry of entries) {
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
        await visit(relativePath);
      } else if (entry.isFile() && /\.(md|markdown)$/i.test(entry.name)) {
        if (found.length >= FOLDER_PUBLISH_MAX_FILES) throw new Error("FOLDER_TOO_MANY_FILES");
        found.push({ relativePath, sizeBytes: (await stat(join(folderPath, relativePath))).size });
      }
    }
  }

  await visit("");
  return found;
}

/** The slice of the cloud client the publication needs; the real one is `ApiFileStore`. */
export interface FolderPublishCloud {
  create(filename: string, markdown: string): Promise<{ filePath: string; storage?: { documentId?: string; version?: number } }>;
  delete(filename: string): Promise<void>;
  recordFolderBinding(documentIds: string[]): Promise<void>;
}

export type FolderPublishSkipReason = "not-confirmed" | "too-large" | "unreadable";

export interface FolderPublishedFile {
  relativePath: string;
  binding: SharedDocumentBinding;
}

export interface FolderPublishResult {
  published: FolderPublishedFile[];
  /** Files that were not uploaded although the plan allowed them. Nothing was created for these. */
  skipped: Array<{ relativePath: string; reason: FolderPublishSkipReason }>;
  /** Files whose upload failed; nothing stays in the cloud for these. */
  failed: Array<{ relativePath: string; error: string }>;
  /**
   * Set when the audit could not be recorded. All documents of this run were then removed again
   * (`rollbackFailures` lists those that could not be) and `published` is empty.
   */
  auditError?: string;
  rollbackFailures: string[];
}

/**
 * Uploads exactly the files the person confirmed. `confirmed` is the list the preview showed as
 * uploadable; a file the plan allows now but that was not part of that list (for example one
 * created after the preview) is skipped, never uploaded.
 */
export async function publishFolderPlan(input: {
  plan: SharedFolderPlan;
  confirmed: readonly string[];
  workspaceId: string;
  readMarkdown(relativePath: string): Promise<string>;
  cloud: FolderPublishCloud;
}): Promise<FolderPublishResult> {
  const confirmed = new Set(input.confirmed);
  const result: FolderPublishResult = { published: [], skipped: [], failed: [], rollbackFailures: [] };
  const created: Array<{ relativePath: string; filePath: string; documentId: string; binding: SharedDocumentBinding }> = [];

  for (const item of input.plan.items) {
    if (item.status !== "upload" || !item.uploadFilename) continue;
    if (!confirmed.has(item.relativePath)) {
      result.skipped.push({ relativePath: item.relativePath, reason: "not-confirmed" });
      continue;
    }

    let markdown: string;
    try {
      markdown = await input.readMarkdown(item.relativePath);
    } catch (error) {
      console.error("[BloomMD] Folder publication could not read a file:", error instanceof Error ? error.message : error);
      result.skipped.push({ relativePath: item.relativePath, reason: "unreadable" });
      continue;
    }
    if (Buffer.byteLength(markdown, "utf8") > SHARED_FOLDER_MAX_FILE_BYTES) {
      result.skipped.push({ relativePath: item.relativePath, reason: "too-large" });
      continue;
    }

    try {
      const document = await input.cloud.create(item.uploadFilename, markdown);
      const documentId = document.storage?.documentId;
      if (!documentId) {
        await input.cloud.delete(document.filePath);
        throw new Error("CLOUD_DOCUMENT_ID_MISSING");
      }
      const markdownHash = hashSharedDocumentMarkdown(markdown);
      const sharing = transitionSharedDocumentState(createLocalSharedDocumentState(markdownHash), {
        type: "share_requested",
        workspaceId: input.workspaceId,
        cloudFilename: document.filePath,
      });
      const connected = transitionSharedDocumentState(sharing, {
        type: "share_confirmed",
        documentId,
        cloudVersion: document.storage?.version ?? 0,
        markdownHash,
      });
      if (connected.kind !== "connected") throw new Error("SHARED_DOCUMENT_BINDING_FAILED");
      created.push({ relativePath: item.relativePath, filePath: document.filePath, documentId, binding: connected.binding });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[BloomMD] Folder publication upload failed:", message);
      result.failed.push({ relativePath: item.relativePath, error: message });
    }
  }

  if (created.length === 0) return result;

  try {
    for (let start = 0; start < created.length; start += FOLDER_PUBLISH_AUDIT_CHUNK) {
      await input.cloud.recordFolderBinding(created.slice(start, start + FOLDER_PUBLISH_AUDIT_CHUNK).map((entry) => entry.documentId));
    }
  } catch (error) {
    result.auditError = error instanceof Error ? error.message : String(error);
    console.error("[BloomMD] Folder publication audit failed; removing the documents created by this run:", result.auditError);
    for (const entry of created) {
      try {
        await input.cloud.delete(entry.filePath);
      } catch (rollbackError) {
        console.error("[BloomMD] Could not remove cloud document after failed folder audit:", rollbackError);
        result.rollbackFailures.push(entry.relativePath);
      }
    }
    return result;
  }

  result.published = created.map(({ relativePath, binding }) => ({ relativePath, binding }));
  return result;
}
