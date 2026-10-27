/**
 * Folder-backed storage for Wiki proposals.
 *
 * A proposal is one JSON file `<id>.json` — the same `WikiProposal` the CLI and MCP tools already
 * produce, plus a lifecycle `status`. A file without a `status` is an open proposal, so anything
 * written by `createWikiProposal` can simply be dropped into the folder.
 *
 * Discarded and applied proposals are never deleted: the folder is the history of what was
 * suggested, by whom it was decided and why.
 *
 * Ids become file names, so they are validated strictly before any path is built.
 */

import { randomUUID } from "node:crypto";
import { lstat, mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { WikiProposal, WikiProposalChange } from "./wiki";

export type WikiProposalStatus = "open" | "applied" | "discarded";

export interface WikiProposalRecord extends WikiProposal {
  status: WikiProposalStatus;
  appliedAt?: string;
  appliedBy?: string;
  discardedAt?: string;
  discardedBy?: string;
  discardReason?: string;
}

export type WikiProposalStoreErrorCode = "invalid-id" | "not-found" | "not-open" | "invalid-file" | "reason-required" | "name-required";

export class WikiProposalStoreError extends Error {
  constructor(readonly code: WikiProposalStoreErrorCode, message: string) {
    super(message);
    this.name = "WikiProposalStoreError";
  }
}

const PROPOSAL_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const STATUSES: readonly string[] = ["open", "applied", "discarded"];

export function isValidWikiProposalId(id: unknown): id is string {
  return typeof id === "string" && PROPOSAL_ID.test(id);
}

function proposalPath(dir: string, id: string): string {
  if (!isValidWikiProposalId(id)) throw new WikiProposalStoreError("invalid-id", "Invalid Wiki proposal id.");
  const root = resolve(dir);
  return join(root, `${id}.json`);
}

function optionalString(value: unknown, field: string, id: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new WikiProposalStoreError("invalid-file", `Wiki proposal ${id}: field ${field} must be a string.`);
  return value;
}

function parseChange(value: unknown, id: string): WikiProposalChange {
  const fail = (field: string) => new WikiProposalStoreError("invalid-file", `Wiki proposal ${id}: invalid change field ${field}.`);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw fail("change");
  const change = value as Record<string, unknown>;
  if (typeof change.path !== "string" || !change.path) throw fail("path");
  if (typeof change.content !== "string") throw fail("content");
  if (typeof change.reason !== "string") throw fail("reason");
  if (change.beforeHash !== null && typeof change.beforeHash !== "string") throw fail("beforeHash");
  if (typeof change.afterHash !== "string") throw fail("afterHash");
  if (change.sourceIds !== undefined && (!Array.isArray(change.sourceIds) || change.sourceIds.some((entry) => typeof entry !== "string"))) throw fail("sourceIds");
  return {
    path: change.path,
    content: change.content,
    reason: change.reason,
    ...(change.sourceIds ? { sourceIds: change.sourceIds as string[] } : {}),
    beforeHash: change.beforeHash,
    afterHash: change.afterHash,
  };
}

/** Parses and validates one stored file. Throws `invalid-file` for anything that is not a proposal. */
export function parseWikiProposalRecord(raw: unknown, expectedId: string): WikiProposalRecord {
  const fail = (message: string) => new WikiProposalStoreError("invalid-file", `Wiki proposal ${expectedId}: ${message}`);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw fail("not a JSON object.");
  const data = raw as Record<string, unknown>;
  if (data.version !== 1) throw fail("unsupported version.");
  if (data.id !== expectedId) throw fail("id does not match the file name.");
  if (typeof data.createdAt !== "string" || Number.isNaN(Date.parse(data.createdAt))) throw fail("invalid createdAt.");
  if (!Array.isArray(data.changes) || data.changes.length === 0) throw fail("changes must be a non-empty array.");
  const status = data.status === undefined ? "open" : data.status;
  if (typeof status !== "string" || !STATUSES.includes(status)) throw fail("invalid status.");
  return {
    version: 1,
    id: expectedId,
    createdAt: data.createdAt,
    changes: data.changes.map((change) => parseChange(change, expectedId)),
    approvedAt: optionalString(data.approvedAt, "approvedAt", expectedId),
    approvedBy: optionalString(data.approvedBy, "approvedBy", expectedId),
    status: status as WikiProposalStatus,
    appliedAt: optionalString(data.appliedAt, "appliedAt", expectedId),
    appliedBy: optionalString(data.appliedBy, "appliedBy", expectedId),
    discardedAt: optionalString(data.discardedAt, "discardedAt", expectedId),
    discardedBy: optionalString(data.discardedBy, "discardedBy", expectedId),
    discardReason: optionalString(data.discardReason, "discardReason", expectedId),
  };
}

async function readRecord(dir: string, id: string): Promise<WikiProposalRecord | null> {
  const path = proposalPath(dir, id);
  // Regular files only: a symlink in the folder must not lead the reader somewhere else.
  const info = await lstat(path).catch((error: unknown) => {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  });
  if (!info) return null;
  if (!info.isFile()) throw new WikiProposalStoreError("invalid-file", `Wiki proposal ${id}: not a regular file.`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error instanceof SyntaxError) throw new WikiProposalStoreError("invalid-file", `Wiki proposal ${id}: invalid JSON.`);
    throw error;
  }
  return parseWikiProposalRecord(parsed, id);
}

async function writeRecord(dir: string, record: WikiProposalRecord): Promise<void> {
  const path = proposalPath(dir, record.id);
  await mkdir(resolve(dir), { recursive: true });
  const temporary = join(resolve(dir), `.${record.id}.tmp-${randomUUID()}`);
  await writeFile(temporary, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  await rename(temporary, path);
}

/** Loads one proposal in any status. Returns `null` when no such file exists; throws on an invalid id. */
export async function loadWikiProposal(dir: string, id: string): Promise<WikiProposalRecord | null> {
  return readRecord(dir, id);
}

/**
 * Lists proposals that are still open, oldest first (review queue order).
 * Files that are not valid proposals are reported through `onInvalid` and skipped, so one broken
 * file cannot hide the rest — and cannot be silently ignored either.
 */
export async function listOpenWikiProposals(
  dir: string,
  onInvalid: (file: string, error: Error) => void = (file, error) => console.error(`[BloomMD] Skipping Wiki proposal file ${file}: ${error.message}`),
): Promise<WikiProposalRecord[]> {
  const entries = await readdir(resolve(dir)).catch((error: unknown) => {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [] as string[];
    throw error;
  });
  const records: WikiProposalRecord[] = [];
  for (const entry of entries.sort()) {
    if (!entry.endsWith(".json")) continue;
    const id = entry.slice(0, -".json".length);
    if (!isValidWikiProposalId(id)) {
      onInvalid(entry, new WikiProposalStoreError("invalid-id", "Invalid Wiki proposal id."));
      continue;
    }
    try {
      const record = await readRecord(dir, id);
      if (record && record.status === "open") records.push(record);
    } catch (error) {
      if (!(error instanceof WikiProposalStoreError)) throw error;
      onInvalid(entry, error);
    }
  }
  return records.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id.localeCompare(b.id));
}

async function loadOpen(dir: string, id: string): Promise<WikiProposalRecord> {
  const record = await readRecord(dir, id);
  if (!record) throw new WikiProposalStoreError("not-found", `Wiki proposal not found: ${id}`);
  if (record.status !== "open") throw new WikiProposalStoreError("not-open", `Wiki proposal ${id} is already ${record.status}.`);
  return record;
}

/**
 * Discards an open proposal. The file stays, now carrying reason, name and time.
 * Nothing in the Wiki bundle is touched.
 */
export async function discardWikiProposal(
  dir: string,
  id: string,
  input: { reason: string; by: string; at?: Date },
): Promise<WikiProposalRecord> {
  const reason = input.reason.trim();
  const by = input.by.trim();
  if (!reason) throw new WikiProposalStoreError("reason-required", "A reason is required to discard a Wiki proposal.");
  if (!by) throw new WikiProposalStoreError("name-required", "A name is required to discard a Wiki proposal.");
  const record = await loadOpen(dir, id);
  const discarded: WikiProposalRecord = {
    ...record,
    status: "discarded",
    discardedAt: (input.at ?? new Date()).toISOString(),
    discardedBy: by,
    discardReason: reason,
  };
  await writeRecord(dir, discarded);
  return discarded;
}

/**
 * Marks an open proposal as applied. `approved` is the proposal returned by `approveWikiProposal`,
 * so the stored file keeps who approved it and when.
 */
export async function markWikiProposalApplied(
  dir: string,
  approved: WikiProposal,
  input: { by: string; at?: Date },
): Promise<WikiProposalRecord> {
  const by = input.by.trim();
  if (!by) throw new WikiProposalStoreError("name-required", "A name is required to mark a Wiki proposal as applied.");
  const record = await loadOpen(dir, approved.id);
  const applied: WikiProposalRecord = {
    ...record,
    approvedBy: approved.approvedBy,
    approvedAt: approved.approvedAt,
    status: "applied",
    appliedAt: (input.at ?? new Date()).toISOString(),
    appliedBy: by,
  };
  await writeRecord(dir, applied);
  return applied;
}

/** The plain proposal, as `approveWikiProposal` / `applyWikiProposal` expect it — without lifecycle fields. */
export function toWikiProposal(record: WikiProposalRecord): WikiProposal {
  return {
    version: 1,
    id: record.id,
    createdAt: record.createdAt,
    changes: record.changes,
    ...(record.approvedAt ? { approvedAt: record.approvedAt } : {}),
    ...(record.approvedBy ? { approvedBy: record.approvedBy } : {}),
  };
}
