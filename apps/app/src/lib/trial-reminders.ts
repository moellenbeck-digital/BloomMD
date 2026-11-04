import {
  claimTrialReminder,
  listTrialReminderCandidates,
  markTrialReminderSent,
  releaseTrialReminder,
  type TrialReminderCandidate,
} from "./db";
import { sendTrialReminderEmail } from "./email";
import { assertAccountMailBudget, MailBudgetError } from "./mail-budget";
import { dueTrialReminder, trialDaysLeft, type TrialReminderKind } from "./trial";

/**
 * Trial reminders (#274): the 15-day and the 23-day mail.
 *
 * Accounts that existed when migration 013 ran only get theirs with `includeExisting` (the job reads
 * it from BLOOMMD_TRIAL_REMINDERS_EXISTING=1), after the admin's go.
 */
export interface TrialReminderResult {
  dryRun: boolean;
  includeExisting: boolean;
  /** Accounts with a reminder due now (also those held back, deferred or failed below). */
  due: number;
  dueByKind: Record<TrialReminderKind, number>;
  /** Due, but an existing account while `includeExisting` is off. */
  heldBackExisting: number;
  /** Would have been mailed, but the run stopped first (mail budget, `--limit`); run again. */
  deferred: number;
  mailSent: number;
  /** Mail not sent; the claim was given back, so the next run tries this reminder again. */
  mailFailed: number;
  /** Another run took it, or the trial ended or the account was deleted in the meantime. */
  notClaimed: number;
}

export interface TrialReminderDeps {
  list: (now: Date) => Promise<TrialReminderCandidate[]>;
  budget: () => Promise<void>;
  claim: (userId: string, kind: TrialReminderKind, now: Date) => Promise<boolean>;
  markSent: (userId: string, kind: TrialReminderKind) => Promise<void>;
  release: (userId: string, kind: TrialReminderKind) => Promise<void>;
  send: (candidate: TrialReminderCandidate, daysLeft: number) => Promise<{ sent: boolean }>;
}

const defaultDeps: TrialReminderDeps = {
  list: listTrialReminderCandidates,
  budget: () => assertAccountMailBudget("trial-reminder"),
  claim: claimTrialReminder,
  markSent: markTrialReminderSent,
  release: releaseTrialReminder,
  send: (candidate, daysLeft) => sendTrialReminderEmail(candidate.email, { lang: candidate.locale, daysLeft, endsAt: candidate.trialEndsAt }),
};

/**
 * Dry run (default) only looks: it writes and sends nothing. With `apply`, a due reminder is taken
 * first (row in `bloom_trial_reminders`), then sent, so a second run or a crash halfway never mails
 * anybody twice. A failed send gives the claim back, which makes exactly this reminder repeatable.
 * A run that comes late sends only the latest due reminder and nothing once the trial is over
 * (`dueTrialReminder`). The global mail budget applies as for sign-up; when it is used up the run
 * stops sending and reports the rest as deferred.
 */
export async function runTrialReminders(
  options: { apply?: boolean; includeExisting?: boolean; limit?: number; now?: Date } = {},
  deps: TrialReminderDeps = defaultDeps,
): Promise<TrialReminderResult> {
  const apply = options.apply ?? false;
  const includeExisting = options.includeExisting ?? false;
  const now = options.now ?? new Date();
  const limit = options.limit ?? Number.POSITIVE_INFINITY;
  const result: TrialReminderResult = {
    dryRun: !apply,
    includeExisting,
    due: 0,
    dueByKind: { "15": 0, "23": 0 },
    heldBackExisting: 0,
    deferred: 0,
    mailSent: 0,
    mailFailed: 0,
    notClaimed: 0,
  };
  let stopped = false;
  let attempted = 0;

  for (const candidate of await deps.list(now)) {
    const kind = dueTrialReminder(candidate.trialEndsAt, now, candidate.claimed);
    if (!kind) continue;
    result.due += 1;
    result.dueByKind[kind] += 1;
    if (candidate.existingAccount && !includeExisting) {
      result.heldBackExisting += 1;
      continue;
    }
    if (!apply) continue;
    if (stopped || attempted >= limit) {
      result.deferred += 1;
      continue;
    }

    try {
      await deps.budget();
    } catch (error) {
      if (!(error instanceof MailBudgetError)) throw error;
      stopped = true;
      result.deferred += 1;
      continue;
    }
    attempted += 1;

    if (!(await deps.claim(candidate.userId, kind, now))) {
      result.notClaimed += 1;
      continue;
    }
    let delivered = false;
    try {
      delivered = (await deps.send(candidate, trialDaysLeft(candidate.trialEndsAt, now))).sent;
    } catch (error) {
      console.error("[BloomMD] Trial reminder mail failed:", error instanceof Error ? error.name : "unknown");
    }
    if (delivered) {
      result.mailSent += 1;
      try {
        await deps.markSent(candidate.userId, kind);
      } catch (error) {
        // The mail went out; the claim stays, so it is not sent again.
        console.error("[BloomMD] Trial reminder could not be marked as sent:", error instanceof Error ? error.name : "unknown");
      }
    } else {
      result.mailFailed += 1;
      try {
        await deps.release(candidate.userId, kind);
      } catch (error) {
        console.error("[BloomMD] Trial reminder claim could not be released:", error instanceof Error ? error.name : "unknown");
      }
    }
  }
  return result;
}
