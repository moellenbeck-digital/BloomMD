import { createHash } from "node:crypto";
import { reminderDueAt, TRIAL_REMINDER_KINDS, type TrialReminderKind } from "./trial";

/**
 * Operator command for the trial period (#277): extend a trial end, release a guarded account, or
 * allow one more trial account for an address. Nothing here reads the clock or the database, so
 * every rule can be tested exactly; the writes are in `db.ts` (`adminSetTrialEnd`,
 * `adminReleaseTrialGuard`, `adminGrantTrialException`) and the command is `scripts/trial-admin.ts`.
 *
 * Only an operator with access to the database can run it: there is no route, no UI, no token.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Longest time a trial end may lie ahead of the run. Longer needs a deliberate second run. */
export const MAX_TRIAL_AHEAD_DAYS = 366;
/** Longest extension in one run, counted from the later of the old end and now. */
export const MAX_EXTEND_DAYS = 366;
/** How long an exception for an address stays usable, when the operator does not say. */
export const DEFAULT_EXCEPTION_DAYS = 14;
export const MAX_EXCEPTION_DAYS = 90;

export type TrialAdminErrorCode =
  | "operator-invalid"
  | "account-invalid"
  | "address-invalid"
  | "end-invalid"
  | "end-not-later"
  | "end-in-past"
  | "end-too-far"
  | "days-invalid";

export class TrialAdminError extends Error {
  constructor(
    readonly code: TrialAdminErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "TrialAdminError";
  }
}

/** A short handle (letters, digits, `.`, `_`, `-`); an e-mail address is refused so the log holds no address. */
export function parseOperator(value: string | undefined): string {
  const operator = value?.trim() ?? "";
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{1,63}$/.test(operator)) {
    throw new TrialAdminError("operator-invalid", "--operator needs a handle of 2 to 64 characters (letters, digits, . _ -), no address.");
  }
  return operator;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseAccountId(value: string | undefined): string {
  const id = value?.trim() ?? "";
  if (!UUID.test(id)) throw new TrialAdminError("account-invalid", "--konto needs the account id (UUID).");
  return id.toLowerCase();
}

export function parseAddress(value: string | undefined): string {
  const address = value?.trim().toLowerCase() ?? "";
  if (address.length > 254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(address)) {
    throw new TrialAdminError("address-invalid", "--adresse needs an e-mail address.");
  }
  return address;
}

/**
 * Key of an exception: SHA-256 (hex) of the lowercase address. The table never holds the address
 * itself. `markEmailVerified` computes the same value in SQL (`encode(sha256(convert_to(lower(email), 'UTF8')), 'hex')`).
 */
export function trialExceptionKey(address: string): string {
  return createHash("sha256").update(address.trim().toLowerCase(), "utf8").digest("hex");
}

export function parseDays(value: string | undefined, max: number, flag: string): number {
  const days = Number(value);
  if (!Number.isInteger(days) || days < 1 || days > max) {
    throw new TrialAdminError("days-invalid", `${flag} needs a whole number of days between 1 and ${max}.`);
  }
  return days;
}

export function parseInstant(value: string | undefined): Date {
  const text = value?.trim() ?? "";
  // A date without time or zone would silently depend on the machine; demand an explicit instant.
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.test(text)) {
    throw new TrialAdminError("end-invalid", "--bis needs an ISO instant with zone, e.g. 2027-02-01T00:00:00Z.");
  }
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) throw new TrialAdminError("end-invalid", "--bis is not a valid instant.");
  return date;
}

/**
 * The new trial end of an extension. `endsAt` is absolute; `extendDays` counts from the later of the
 * old end and now (so an expired trial gets the days from today). The result must lie after the old
 * end (a shorter trial is not an extension), in the future, and within `MAX_TRIAL_AHEAD_DAYS`.
 */
export function planTrialEnd(input: { oldEnd: Date | null; now: Date; endsAt?: Date; extendDays?: number }): Date {
  const { oldEnd, now } = input;
  let next: Date;
  if (input.endsAt) {
    next = input.endsAt;
  } else if (input.extendDays !== undefined) {
    const base = oldEnd && oldEnd.getTime() > now.getTime() ? oldEnd : now;
    next = new Date(base.getTime() + input.extendDays * DAY_MS);
  } else {
    throw new TrialAdminError("end-invalid", "Either --bis or --um is needed.");
  }
  if (next.getTime() <= now.getTime()) throw new TrialAdminError("end-in-past", "The new trial end must lie in the future.");
  if (oldEnd && next.getTime() <= oldEnd.getTime()) throw new TrialAdminError("end-not-later", "The new trial end must lie after the current one (a shorter trial is not an extension).");
  if (next.getTime() > now.getTime() + MAX_TRIAL_AHEAD_DAYS * DAY_MS) {
    throw new TrialAdminError("end-too-far", `The new trial end may lie at most ${MAX_TRIAL_AHEAD_DAYS} days ahead.`);
  }
  return next;
}

/**
 * Reminder claims to give back after an extension: a reminder that is not yet due at the new end
 * (it is due `reminderDueAt` before it) can and should go out again at the right time. Reminders
 * that would be due right now stay claimed, so the extension does not trigger a mail by itself.
 */
export function reminderKindsToReset(newEnd: Date, now: Date): TrialReminderKind[] {
  return TRIAL_REMINDER_KINDS.filter((kind) => reminderDueAt(newEnd, kind).getTime() > now.getTime());
}
