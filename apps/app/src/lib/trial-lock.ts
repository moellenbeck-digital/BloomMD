import { getTrialEndsAt, hasActiveEntitlement, normalizeUuid } from "./db";
import { isTrialOver } from "./trial";
import { isTrialReadonlyEnabled } from "./trial-readonly";

/** Whether the account's trial has ended. False without a database, an account or a trial end. */
export async function isTrialExpired(userId: string, now: Date = new Date()) {
  const normalized = normalizeUuid(userId);
  if (!normalized) return false;
  const endsAt = await getTrialEndsAt(normalized);
  return endsAt != null && isTrialOver(endsAt, now);
}

/**
 * With the switch on (BLOOMMD_TRIAL_READONLY=1): whether writes of this account are refused (#274).
 * An account with an active plan stays writable after the trial (#378, `hasActiveEntitlement`).
 * The plan is looked up only for accounts whose trial has ended.
 */
export async function isTrialWriteLocked(userId: string | undefined, now: Date = new Date()) {
  if (!userId || !isTrialReadonlyEnabled()) return false;
  if (!(await isTrialExpired(userId, now))) return false;
  const normalized = normalizeUuid(userId);
  return !normalized || !(await hasActiveEntitlement(normalized, now));
}
