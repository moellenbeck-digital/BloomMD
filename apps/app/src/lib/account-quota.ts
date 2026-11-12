import {
  formatQuotaUsage,
  ACCOUNT_QUOTA_BYTES,
  ACCOUNT_QUOTA_WARNING_RATIO,
  QUOTA_EXCEEDED_CODE,
  isAccountQuotaEnforced,
  quotaExceededMessage,
  quotaLevel,
  type QuotaLevel,
} from "@bloommd/core/account-quota";
import { NextResponse } from "next/server";
import { getAppLocale, type AppLocale } from "./locale";

/**
 * Storage quota of a cloud account (#380), web side. The rules (limit, usage, decision, texts) are in
 * `@bloommd/core/account-quota`, shared with the sync server; this file holds what the web app adds:
 * the numbers for the interface and the ops script, and the refusal of the API.
 * Enforcement is off unless `BLOOMMD_ACCOUNT_QUOTA=1` (see `docs/QUOTA.md`).
 */
export { ACCOUNT_QUOTA_BYTES, ACCOUNT_QUOTA_WARNING_RATIO, QUOTA_EXCEEDED_CODE, isAccountQuotaEnforced, quotaLevel, type QuotaLevel };

/** What `GET /api/account/quota` returns and the account page shows. */
export interface AccountQuotaStatus {
  /** Whether the server refuses growing writes (BLOOMMD_ACCOUNT_QUOTA=1). The usage is shown either way. */
  enforced: boolean;
  usedBytes: number;
  limitBytes: number;
  /** Share of the limit in whole percent, 0 and up (above 100 for an account that was over before). */
  percent: number;
  level: QuotaLevel;
}

export function accountQuotaStatus(usedBytes: number, enforced: boolean, limitBytes: number = ACCOUNT_QUOTA_BYTES): AccountQuotaStatus {
  return {
    enforced,
    usedBytes,
    limitBytes,
    percent: Math.floor((usedBytes / limitBytes) * 100),
    level: quotaLevel(usedBytes, limitBytes),
  };
}

export interface AccountUsage {
  accountId: string;
  usedBytes: number;
}

export interface QuotaUsageReport {
  enforced: boolean;
  limitBytes: number;
  accounts: number;
  totalBytes: number;
  /** Accounts at 80 % of the limit or more (includes those over 100 %). */
  over80: number;
  /** Accounts at the limit or beyond. */
  over100: number;
  /** Accounts from 80 % up (all with `all`), biggest first; account ids only, never addresses. */
  perAccount: Array<{ accountId: string; usedBytes: number; percent: number }>;
}

/** The ops report (`db:quota-report`), pure so that it can be tested without a database. */
export function summarizeQuotaUsage(
  rows: AccountUsage[],
  options: { enforced?: boolean; limitBytes?: number; all?: boolean } = {},
): QuotaUsageReport {
  const limitBytes = options.limitBytes ?? ACCOUNT_QUOTA_BYTES;
  const sorted = [...rows].sort((a, b) => b.usedBytes - a.usedBytes || a.accountId.localeCompare(b.accountId));
  const over80 = sorted.filter((row) => row.usedBytes >= limitBytes * ACCOUNT_QUOTA_WARNING_RATIO);
  return {
    enforced: options.enforced ?? false,
    limitBytes,
    accounts: rows.length,
    totalBytes: rows.reduce((sum, row) => sum + row.usedBytes, 0),
    over80: over80.length,
    over100: sorted.filter((row) => row.usedBytes >= limitBytes).length,
    perAccount: (options.all ? sorted : over80).map((row) => ({
      accountId: row.accountId,
      usedBytes: row.usedBytes,
      percent: Math.floor((row.usedBytes / limitBytes) * 100),
    })),
  };
}

/** Language of an API refusal, like `trialRequestLocale`: `?lang=en`, else the browser's preference. */
export function quotaRequestLocale(request?: { url: string; headers: { get(name: string): string | null } }): AppLocale {
  if (!request) return "de";
  try {
    const lang = new URL(request.url).searchParams.get("lang");
    if (lang) return getAppLocale(lang);
  } catch {
    // Fall through to the header.
  }
  return /^\s*en\b/i.test(request.headers.get("accept-language") ?? "") ? "en" : "de";
}

/**
 * The refusal of a write that the quota stopped: 413 with the code `QUOTA_EXCEEDED`, usage and limit
 * in the body, and a message in the user's language that says reading, export and deleting still work.
 * 413 and not 403: the account may write, this change is too big for what is left.
 */
export function quotaExceededResponse(request: { url: string; headers: { get(name: string): string | null } } | undefined, usedBytes: number, limitBytes: number = ACCOUNT_QUOTA_BYTES): NextResponse {
  return NextResponse.json(
    { error: quotaExceededMessage(quotaRequestLocale(request), usedBytes, limitBytes), code: QUOTA_EXCEEDED_CODE, usedBytes, limitBytes },
    { status: 413, headers: { "Cache-Control": "no-store" } },
  );
}

/** What the account page shows for the storage of the account (#380). */
export interface StorageUsageView {
  title: string;
  /** "37,2 MB von 100 MB" */
  usage: string;
  /** Share of the limit for the bar, capped at 100. */
  barPercent: number;
  level: QuotaLevel;
  /** Null while everything is fine. */
  message: string | null;
}

export function storageUsageView(status: AccountQuotaStatus, locale: AppLocale): StorageUsageView {
  const percent = status.percent;
  let message: string | null = null;
  if (status.level === "reached") {
    message = locale === "en"
      ? "Your storage is full. New content is not saved. You can still read, export and delete your data, and shrink notes."
      : "Dein Speicherplatz ist erreicht. Neue Inhalte werden nicht gespeichert. Lesen, Export und Löschen sowie das Verkleinern von Notizen sind weiterhin möglich.";
  } else if (status.level === "warning") {
    message = locale === "en"
      ? `You have used ${percent} % of your storage. When it is full, new content is not saved any more; reading, export and deleting keep working.`
      : `Du hast ${percent} % deines Speicherplatzes belegt. Ist er voll, werden neue Inhalte nicht mehr gespeichert; Lesen, Export und Löschen bleiben möglich.`;
  }
  return {
    title: locale === "en" ? "Storage" : "Speicher",
    usage: formatQuotaUsage(status.usedBytes, status.limitBytes, locale),
    barPercent: Math.min(100, Math.max(0, percent)),
    level: status.level,
    message,
  };
}
