/**
 * Trial period of an account (#274). All times are UTC instants; nothing here reads the clock or
 * the database, so every boundary can be tested exactly.
 *
 * New accounts: the trial lasts 30 days from the email confirmation, with a reminder after 15 and
 * after 23 days. Accounts that existed when migration 013 ran share one fixed end; their start is
 * counted as 15 Nov 2026, so the same arithmetic gives their reminders (30 Nov and 8 Dec).
 */

export const TRIAL_DAYS = 30;
export type TrialReminderKind = "15" | "23";
/** Days after the start of the trial; ascending. */
export const TRIAL_REMINDER_DAYS: Record<TrialReminderKind, number> = { "15": 15, "23": 23 };
export const TRIAL_REMINDER_KINDS = Object.keys(TRIAL_REMINDER_DAYS) as TrialReminderKind[];

/** End of the trial of every account that existed when migration 013 ran (db/013_trial_period.sql). */
export const LEGACY_TRIAL_ENDS_AT = "2026-12-15T00:00:00.000Z";

const DAY_MS = 24 * 60 * 60 * 1000;

/** End of the trial for an address confirmed at `verifiedAt`. */
export function trialEndsAt(verifiedAt: Date | string | number): Date {
  const start = new Date(verifiedAt).getTime();
  if (!Number.isFinite(start)) throw new Error("verifiedAt must be a valid date.");
  return new Date(start + TRIAL_DAYS * DAY_MS);
}

/** Instant from which the reminder is due: its day count after the start, i.e. before the end. */
export function reminderDueAt(endsAt: Date | string | number, kind: TrialReminderKind): Date {
  const end = new Date(endsAt).getTime();
  if (!Number.isFinite(end)) throw new Error("endsAt must be a valid date.");
  return new Date(end - (TRIAL_DAYS - TRIAL_REMINDER_DAYS[kind]) * DAY_MS);
}

export function isTrialOver(endsAt: Date | string | number, now: Date | string | number): boolean {
  return new Date(now).getTime() >= new Date(endsAt).getTime();
}

/** Whole days left, rounded up, so the last day still says "1"; 0 once the trial is over. */
export function trialDaysLeft(endsAt: Date | string | number, now: Date | string | number): number {
  const left = new Date(endsAt).getTime() - new Date(now).getTime();
  return left <= 0 ? 0 : Math.ceil(left / DAY_MS);
}

/**
 * The reminder to send now, or null. Only the latest reminder that is due counts: a run that comes
 * late sends the 23-day reminder and never the 15-day one after it, and nothing goes out once the
 * trial is over. `sent` holds the reminders that were already claimed or sent.
 */
export function dueTrialReminder(
  endsAt: Date | string | number,
  now: Date | string | number,
  sent: Iterable<TrialReminderKind> = [],
): TrialReminderKind | null {
  if (isTrialOver(endsAt, now)) return null;
  const nowMs = new Date(now).getTime();
  const done = new Set(sent);
  for (const kind of [...TRIAL_REMINDER_KINDS].reverse()) {
    if (nowMs < reminderDueAt(endsAt, kind).getTime()) continue;
    return done.has(kind) ? null : kind;
  }
  return null;
}

/** The end date as shown to people ("15.12.2026" / "15 Dec 2026"), in UTC like the mails. */
export function formatTrialEnd(endsAt: Date | string | number, locale: "de" | "en"): string {
  return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "de-DE", locale === "en" ? { dateStyle: "medium", timeZone: "UTC" } : { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }).format(new Date(endsAt));
}
