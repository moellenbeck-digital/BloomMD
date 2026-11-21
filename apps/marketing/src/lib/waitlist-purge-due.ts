import {
  WaitlistPurgeRefusedError,
  evaluateWaitlistPurge,
  purgeWaitlist,
  waitlistPurgeStatus,
  type WaitlistPurgeStatus,
  type WaitlistPurgeVerdict,
} from "./waitlist-db";

export type WaitlistPurgeDueReason =
  | "invitation-pending"
  | "no-invitation-sent"
  | "retention-running"
  | "empty-list"
  | "retention-over";

/** The one line `waitlist purge-due` prints. Counters only — never an address. */
export interface WaitlistPurgeDueResult {
  mode: "dry-run" | "apply";
  total: number;
  notInvited: number;
  allowed: boolean;
  reason: WaitlistPurgeDueReason;
  /** End of the retention period while it is still running, otherwise null. */
  allowedFrom: string | null;
  deleted: number;
}

export interface WaitlistPurgeDueDeps {
  status: () => Promise<WaitlistPurgeStatus>;
  evaluate: (status: WaitlistPurgeStatus, now: Date) => WaitlistPurgeVerdict;
  purge: (now: Date) => Promise<number>;
}

const defaultDeps: WaitlistPurgeDueDeps = {
  status: waitlistPurgeStatus,
  evaluate: evaluateWaitlistPurge,
  purge: purgeWaitlist,
};

/**
 * Deletion step for a daily job. Same guard and same deletion as `purge`, but a refusal because
 * the period is still running (or an invitation is open) is a normal answer, not an error: the
 * job reports it and exits 0, so it is not red for 90 days. Only real failures — database not
 * reachable, variable missing — throw.
 *
 * Dry-run by default; only `apply` deletes, and only when {@link evaluateWaitlistPurge} allows it.
 */
export async function runWaitlistPurgeDue(
  options: { apply?: boolean; now?: Date } = {},
  deps: WaitlistPurgeDueDeps = defaultDeps,
): Promise<WaitlistPurgeDueResult> {
  const apply = options.apply ?? false;
  const now = options.now ?? new Date();
  const status = await deps.status();
  const verdict = deps.evaluate(status, now);

  const base = {
    mode: apply ? ("apply" as const) : ("dry-run" as const),
    total: status.total,
    notInvited: status.notInvited,
  };

  if (!verdict.allowed) {
    return { ...base, allowed: false, reason: verdict.reason, allowedFrom: verdict.allowedFrom, deleted: 0 };
  }

  const reason: WaitlistPurgeDueReason = status.total === 0 ? "empty-list" : "retention-over";
  if (!apply || status.total === 0) {
    return { ...base, allowed: true, reason, allowedFrom: null, deleted: 0 };
  }

  try {
    const deleted = await deps.purge(now);
    return { ...base, allowed: true, reason, allowedFrom: null, deleted };
  } catch (error) {
    // The table changed between the check and the deletion (e.g. a new entry became invitable):
    // the guard inside `purgeWaitlist` said no. Nothing was deleted; report it like any refusal.
    if (error instanceof WaitlistPurgeRefusedError) {
      return { ...base, allowed: false, reason: error.verdict.reason, allowedFrom: error.verdict.allowedFrom, deleted: 0 };
    }
    throw error;
  }
}
