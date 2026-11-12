/**
 * Storage quota of a cloud account (#380). Pure parts only: the limit, the usage rules and the
 * texts. The database queries live in `apps/app/src/lib/db.ts` (web app) and
 * `packages/sync/src/persistence.ts` (sync server); both enforce the same rule with this file.
 *
 * Usage = sum of the UTF-8 bytes of `bloom_documents.markdown` of all documents that are not
 * deleted, in all workspaces the account owns. Revisions and the front matter (a separate column)
 * do not count. Enforcement is off unless `BLOOMMD_ACCOUNT_QUOTA=1`.
 */

/** 100 MB, counted as 100 × 1024 × 1024 bytes. */
export const ACCOUNT_QUOTA_BYTES = 100 * 1024 * 1024;

/** From this share of the limit the interface warns. */
export const ACCOUNT_QUOTA_WARNING_RATIO = 0.8;

export const QUOTA_EXCEEDED_CODE = "QUOTA_EXCEEDED";

/** WebSocket close code of the sync server for a save refused by the quota (4000-range = application). */
export const QUOTA_EXCEEDED_CLOSE_CODE = 4013;

/** Off unless `BLOOMMD_ACCOUNT_QUOTA=1`, so nothing is refused without the admin's go (like `BLOOMMD_TRIAL_READONLY`). */
export function isAccountQuotaEnforced(env: Record<string, string | undefined> = processEnv()): boolean {
  return env.BLOOMMD_ACCOUNT_QUOTA === "1";
}

/** `process.env` where there is one; this file is also bundled for browsers and the mobile app, which have no Node types. */
function processEnv(): Record<string, string | undefined> {
  return (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
}

const encoder = new TextEncoder();

/** Size of a document as it counts towards the quota: the UTF-8 bytes of its Markdown. */
export function quotaBytes(markdown: string): number {
  return encoder.encode(markdown).length;
}

export type QuotaLevel = "ok" | "warning" | "reached";

export function quotaLevel(usedBytes: number, limitBytes: number = ACCOUNT_QUOTA_BYTES): QuotaLevel {
  if (usedBytes >= limitBytes) return "reached";
  if (usedBytes >= limitBytes * ACCOUNT_QUOTA_WARNING_RATIO) return "warning";
  return "ok";
}

export interface QuotaWriteDecision {
  allowed: boolean;
  /** Change of the account's usage caused by the write (negative when it shrinks). */
  deltaBytes: number;
  usedAfterBytes: number;
}

/**
 * A write that raises the usage is refused when it would take the account beyond the limit (so at
 * or over the limit every growth is refused); a write that lowers or keeps the usage is always
 * allowed, as is everything that is not a write (reading, export, deleting). `oldBytes` is the
 * size of the document before the write (0 for a new document).
 */
export function decideQuotaWrite(input: {
  usedBytes: number;
  oldBytes: number;
  newBytes: number;
  limitBytes?: number;
}): QuotaWriteDecision {
  const limitBytes = input.limitBytes ?? ACCOUNT_QUOTA_BYTES;
  const deltaBytes = input.newBytes - input.oldBytes;
  const usedAfterBytes = input.usedBytes + deltaBytes;
  return { allowed: deltaBytes <= 0 || usedAfterBytes <= limitBytes, deltaBytes, usedAfterBytes };
}

/** Thrown where a write is refused by the quota; carries the numbers for the message. */
export class AccountQuotaExceededError extends Error {
  readonly code = QUOTA_EXCEEDED_CODE;
  constructor(readonly usedBytes: number, readonly limitBytes: number = ACCOUNT_QUOTA_BYTES) {
    super(QUOTA_EXCEEDED_CODE);
    this.name = "AccountQuotaExceededError";
  }
}

export type QuotaLocale = "de" | "en";

/** "37,2 MB" (de) / "37.2 MB" (en); MB = 1024 × 1024 bytes, one decimal place. */
export function formatQuotaMegabytes(bytes: number, locale: QuotaLocale = "de"): string {
  const value = (Math.max(0, bytes) / (1024 * 1024)).toFixed(1);
  return `${locale === "en" ? value : value.replace(".", ",")} MB`;
}

/** "37,2 MB von 100 MB" / "37.2 MB of 100 MB". */
export function formatQuotaUsage(usedBytes: number, limitBytes: number, locale: QuotaLocale = "de"): string {
  const limit = formatQuotaMegabytes(limitBytes, locale).replace(/[.,]0 MB$/, " MB");
  const used = formatQuotaMegabytes(usedBytes, locale);
  return locale === "en" ? `${used} of ${limit}` : `${used} von ${limit}`;
}

/** The refusal of the API: names usage and limit and says that reading, export and deleting still work. */
export function quotaExceededMessage(locale: QuotaLocale, usedBytes: number, limitBytes: number = ACCOUNT_QUOTA_BYTES): string {
  const usage = formatQuotaUsage(usedBytes, limitBytes, locale);
  return locale === "en"
    ? `Your storage quota is reached (${usage}). This change was not saved. You can still read, export and delete your data, and shrink notes.`
    : `Dein Speicherplatz ist erreicht (${usage}). Diese Änderung wurde nicht gespeichert. Lesen, Export und Löschen sowie das Verkleinern von Notizen sind weiterhin möglich.`;
}
