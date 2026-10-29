import { consumeMailBudget } from "./db";

/** Global cap for outgoing account mails (confirmation, password reset). Invitation and beta mails are not counted. */
export const ACCOUNT_MAIL_LIMIT_DEFAULTS = { hourly: 60, daily: 300 } as const;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const ALERT_INTERVAL_MS = 60 * 1000;

export type AccountMailKind = "verification" | "password-reset";

export class MailBudgetError extends Error {
  readonly retryAfterSeconds: number;
  readonly scope: "hour" | "day";

  constructor(scope: "hour" | "day", retryAfterSeconds: number) {
    super("Account mail limit reached.");
    this.name = "MailBudgetError";
    this.scope = scope;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value?.trim());
  return value?.trim() && Number.isSafeInteger(parsed) && parsed >= 1 ? parsed : fallback;
}

/** Limits from the environment; an unset or invalid value falls back to the default, never to "unlimited". */
export function accountMailLimits(env: Record<string, string | undefined> = process.env) {
  return {
    hourly: positiveInteger(env.BLOOMMD_MAIL_HOURLY_LIMIT, ACCOUNT_MAIL_LIMIT_DEFAULTS.hourly),
    daily: positiveInteger(env.BLOOMMD_MAIL_DAILY_LIMIT, ACCOUNT_MAIL_LIMIT_DEFAULTS.daily),
  };
}

const memoryCounters = new Map<string, number>();
let lastAlertAt = 0;

function memoryConsume(hourStart: number, dayStart: number, hourlyLimit: number, dailyLimit: number) {
  const hourKey = `hour:${hourStart}`;
  const dayKey = `day:${dayStart}`;
  if ((memoryCounters.get(hourKey) ?? 0) >= hourlyLimit) return "hour" as const;
  if ((memoryCounters.get(dayKey) ?? 0) >= dailyLimit) return "day" as const;
  memoryCounters.set(hourKey, (memoryCounters.get(hourKey) ?? 0) + 1);
  memoryCounters.set(dayKey, (memoryCounters.get(dayKey) ?? 0) + 1);
  return null;
}

/**
 * Reserves one mail of the global budget, or throws {@link MailBudgetError}. Call it right before
 * the mail is created and sent, and send nothing when it throws. The counter lives in the database
 * (in memory only without one), so it holds across instances and restarts.
 *
 * The refusal is logged as an alert, at most once a minute per process; no address is logged.
 */
export async function assertAccountMailBudget(kind: AccountMailKind, now = Date.now()) {
  const limits = accountMailLimits();
  const hourStart = Math.floor(now / HOUR_MS) * HOUR_MS;
  const dayStart = Math.floor(now / DAY_MS) * DAY_MS;

  const database = await consumeMailBudget({
    hourStartedAt: new Date(hourStart).toISOString(),
    dayStartedAt: new Date(dayStart).toISOString(),
    hourlyLimit: limits.hourly,
    dailyLimit: limits.daily,
  });
  const refusedScope = database
    ? database.allowed ? null : database.scope
    : memoryConsume(hourStart, dayStart, limits.hourly, limits.daily);
  if (!refusedScope) return;

  if (now - lastAlertAt >= ALERT_INTERVAL_MS) {
    lastAlertAt = now;
    const limit = refusedScope === "hour" ? limits.hourly : limits.daily;
    console.error(
      `[BloomMD][ALERT] Global account mail limit reached (${limit} per ${refusedScope}, BLOOMMD_MAIL_${refusedScope === "hour" ? "HOURLY" : "DAILY"}_LIMIT): ${kind} mail not sent. Possible abuse of open registration; check Resend and the sign-up traffic.`,
    );
  }
  const windowEnd = (refusedScope === "hour" ? hourStart + HOUR_MS : dayStart + DAY_MS);
  throw new MailBudgetError(refusedScope, Math.max(1, Math.ceil((windowEnd - now) / 1000)));
}

export function resetMailBudgetForTests() {
  memoryCounters.clear();
  lastAlertAt = 0;
}
