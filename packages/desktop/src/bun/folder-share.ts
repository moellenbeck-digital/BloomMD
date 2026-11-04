import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  detectSharedFolderActivity,
  planSharedFolderPublication,
  transitionSharedDocumentState,
  type SharedFolderLocalFile,
} from "@bloommd/core";
import { publishFolderPlan, type FolderPublishCloud } from "./folder-publish";
import type { DesktopFolderActivityEntry, DesktopFolderDecision } from "../shared/rpc-types";
import type { DesktopSharedFolderBinding } from "./settings";

export type FolderActivityEntry = DesktopFolderActivityEntry;
export type FolderDecision = DesktopFolderDecision;


export interface FolderShareCloud extends FolderPublishCloud {
  recordFolderUnbinding(documentIds: string[]): Promise<void>;
}

/**
 * `revoked` when the server says the access is gone (401/403/404 on the workspace); anything else
 * (network, timeout, server error) is only "unreachable" and never ends a share.
 */
export function classifyAccessFailure(error: unknown): "revoked" | "unreachable" {
  const message = error instanceof Error ? error.message : String(error);
  return /(?:^|\s)(?:401|403|404)(?:\s|$)/.test(message) ? "revoked" : "unreachable";
}

/** Stops the share: every file binding becomes `revoked`, nothing local or in the cloud is touched. */
export function markFolderRevoked(folder: DesktopSharedFolderBinding): DesktopSharedFolderBinding {
  return {
    ...folder,
    state: "revoked",
    files: folder.files.map((file) => file.binding.connectionState === "revoked"
      ? file
      : {
          ...file,
          binding: (() => {
            const next = transitionSharedDocumentState({ kind: file.binding.connectionState, binding: file.binding }, { type: "access_revoked" });
            if (next.kind !== "revoked") throw new Error("SHARED_DOCUMENT_BINDING_FAILED");
            return next.binding;
          })(),
        }),
  };
}

/** The folder as the person sees it: published files that are gone, new files, and certain renames. */
export async function computeFolderActivity(input: {
  folder: DesktopSharedFolderBinding;
  local: readonly SharedFolderLocalFile[];
  hashOf(relativePath: string): Promise<string | null>;
  cloudFilenames: readonly string[];
}): Promise<FolderActivityEntry[]> {
  const { folder } = input;
  const entries = await detectSharedFolderActivity({
    bound: folder.files.map((file) => ({
      relativePath: file.relativePath,
      documentId: file.binding.documentId,
      cloudFilename: file.binding.cloudFilename,
      contentHash: file.contentHash ?? null,
    })),
    knownPaths: new Set(folder.knownPaths),
    local: input.local,
    hashOf: input.hashOf,
    splitRenames: new Set(folder.splitRenames),
  });

  const newFiles = entries.flatMap((entry) => entry.kind === "new" ? [entry.local] : []);
  const plan = planSharedFolderPublication({ files: newFiles, existingCloudFilenames: input.cloudFilenames, strategy: folder.strategy });
  const planned = new Map(plan.items.map((item) => [item.relativePath, item]));

  return entries.map((entry): FolderActivityEntry => {
    if (entry.kind === "removed") return { kind: "removed", relativePath: entry.file.relativePath, cloudFilename: entry.file.cloudFilename };
    if (entry.kind === "renamed") {
      return { kind: "renamed", from: entry.file.relativePath, to: entry.to.relativePath, sizeBytes: entry.to.sizeBytes, cloudFilename: entry.file.cloudFilename };
    }
    const item = planned.get(entry.local.relativePath);
    const status = item?.status === "upload" ? "upload" : item?.status === "conflict" ? "conflict" : "blocked";
    return {
      kind: "new",
      relativePath: entry.local.relativePath,
      sizeBytes: entry.local.sizeBytes,
      status,
      cloudFilename: item?.cloudFilename ?? null,
      uploadFilename: item?.uploadFilename ?? null,
      ...(item?.reason ? { reason: item.reason } : {}),
    };
  });
}

/** Content fingerprint of a raw file: line endings and surrounding blank space do not matter. */
export function fingerprintFileContent(text: string): string {
  return createHash("sha256").update(text.replace(/\r\n/g, "\n").trim()).digest("hex");
}

/**
 * Fingerprint of a local file's raw content. A rename keeps the content but changes the file name,
 * and BloomMD derives a missing title from that name, so the parsed Markdown cannot be compared.
 * A file that cannot be read is simply not a rename candidate.
 */
export function createFolderFileHasher(folderPath: string): (relativePath: string) => Promise<string | null> {
  return async (relativePath) => {
    try {
      return fingerprintFileContent(await readFile(join(folderPath, relativePath), "utf-8"));
    } catch (error) {
      console.warn("[BloomMD] A local folder file could not be compared for rename detection:", error instanceof Error ? error.message : error);
      return null;
    }
  };
}

const UNBINDING_AUDIT_CHUNK = 200;
/** A rejected chunk is retried per document only while that costs few requests (the audit route is rate limited). */
const UNBINDING_AUDIT_RETRY_LIMIT = 20;

/**
 * Audits the end of a folder share. It never throws: the local binding is already gone when this
 * runs, and a document deleted in the cloud meanwhile must not hide the audit of the others.
 */
export async function auditFolderUnbinding(
  record: (documentIds: string[]) => Promise<void>,
  documentIds: readonly string[],
): Promise<{ audited: number; failed: number }> {
  let audited = 0;
  let failed = 0;
  for (let start = 0; start < documentIds.length; start += UNBINDING_AUDIT_CHUNK) {
    const chunk = documentIds.slice(start, start + UNBINDING_AUDIT_CHUNK);
    try {
      await record(chunk);
      audited += chunk.length;
      continue;
    } catch (error) {
      console.warn("[BloomMD] Folder share audit chunk was rejected:", error instanceof Error ? error.message : error);
    }
    if (chunk.length > UNBINDING_AUDIT_RETRY_LIMIT) {
      failed += chunk.length;
      continue;
    }
    for (const documentId of chunk) {
      try {
        await record([documentId]);
        audited += 1;
      } catch (error) {
        console.warn("[BloomMD] Folder share audit failed for one document:", error instanceof Error ? error.message : error);
        failed += 1;
      }
    }
  }
  return { audited, failed };
}

function withoutFile(folder: DesktopSharedFolderBinding, relativePath: string): DesktopSharedFolderBinding["files"] {
  return folder.files.filter((file) => file.relativePath !== relativePath);
}

const unique = (paths: readonly string[]) => [...new Set(paths)];

/**
 * Applies one decision of the person. Nothing here runs on its own: the cloud is only touched by
 * `upload` (creates a document) and `remove-cloud` (deletes the document the person named), both
 * after an explicit choice. Every decision re-checks the local folder, so a stale list cannot
 * upload a file that is gone or remove the cloud copy of a file that is back.
 */
export async function applyFolderDecision(input: {
  folder: DesktopSharedFolderBinding;
  decision: FolderDecision;
  local: readonly SharedFolderLocalFile[];
  cloudFilenames: readonly string[];
  readMarkdown(relativePath: string): Promise<string>;
  fingerprintOf?(relativePath: string): Promise<string | null>;
  cloud: FolderShareCloud;
}): Promise<DesktopSharedFolderBinding> {
  const { folder, decision, cloud } = input;
  if (folder.state === "revoked") throw new Error("FOLDER_ACCESS_REVOKED");
  const localByPath = new Map(input.local.map((file) => [file.relativePath, file]));
  const boundFile = (relativePath: string) => folder.files.find((file) => file.relativePath === relativePath);

  switch (decision.kind) {
    case "new": {
      if (boundFile(decision.relativePath)) throw new Error("FOLDER_FILE_ALREADY_PUBLISHED");
      const local = localByPath.get(decision.relativePath);
      if (!local) throw new Error("FOLDER_FILE_NOT_FOUND");
      if (decision.action === "ignore") return { ...folder, knownPaths: unique([...folder.knownPaths, decision.relativePath]) };

      const plan = planSharedFolderPublication({ files: [local], existingCloudFilenames: input.cloudFilenames, strategy: folder.strategy });
      const item = plan.items[0];
      if (!item || item.status !== "upload") throw new Error(`FOLDER_FILE_NOT_UPLOADABLE:${item?.status === "blocked" ? item.reason : item?.status ?? "unknown"}`);
      const result = await publishFolderPlan({
        plan,
        confirmed: [decision.relativePath],
        workspaceId: folder.workspaceId,
        readMarkdown: input.readMarkdown,
        ...(input.fingerprintOf ? { fingerprintOf: input.fingerprintOf } : {}),
        cloud,
      });
      const published = result.published[0];
      if (!published) {
        if (result.auditError) throw new Error(result.rollbackFailures.length > 0 ? "SHARE_AUDIT_FAILED_CLOUD_DOCUMENTS_CREATED" : "SHARE_AUDIT_FAILED");
        throw new Error(result.failed[0]?.error ?? `FOLDER_FILE_NOT_UPLOADED:${result.skipped[0]?.reason ?? "unknown"}`);
      }
      return {
        ...folder,
        files: [...withoutFile(folder, published.relativePath), published],
        knownPaths: unique([...folder.knownPaths, decision.relativePath]),
      };
    }

    case "removed": {
      const file = boundFile(decision.relativePath);
      if (!file) throw new Error("FOLDER_FILE_NOT_PUBLISHED");
      if (localByPath.has(decision.relativePath)) throw new Error("FOLDER_FILE_STILL_PRESENT");
      if (decision.action === "remove-cloud") {
        // The audit comes first: it needs the document to exist, and a failed delete leaves everything as it was.
        await cloud.recordFolderUnbinding([file.binding.documentId]);
        await cloud.delete(file.binding.cloudFilename);
      } else {
        try {
          await cloud.recordFolderUnbinding([file.binding.documentId]);
        } catch (error) {
          console.warn("[BloomMD] Local folder file was released but could not be audited:", error);
        }
      }
      return { ...folder, files: withoutFile(folder, decision.relativePath) };
    }

    case "renamed": {
      const file = boundFile(decision.from);
      if (!file) throw new Error("FOLDER_FILE_NOT_PUBLISHED");
      if (localByPath.has(decision.from)) throw new Error("FOLDER_FILE_STILL_PRESENT");
      if (!localByPath.has(decision.to)) throw new Error("FOLDER_FILE_NOT_FOUND");
      if (decision.action === "split") return { ...folder, splitRenames: unique([...folder.splitRenames, decision.to]) };
      if (boundFile(decision.to)) throw new Error("FOLDER_FILE_ALREADY_PUBLISHED");
      return {
        ...folder,
        files: folder.files.map((entry) => entry.relativePath === decision.from ? { ...entry, relativePath: decision.to } : entry),
        knownPaths: unique([...folder.knownPaths, decision.to]),
        splitRenames: folder.splitRenames.filter((path) => path !== decision.to),
      };
    }
  }
}
