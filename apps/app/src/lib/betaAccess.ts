import { timingSafeEqual } from "node:crypto";
import { hasActiveBetaInvite } from "./db";

/**
 * Access control for the closed beta (#37, decided in #43).
 *
 * BloomMD ships as an invitation-only beta: the public demo and template library stay open, while
 * Obsidian compatibility is demonstrated separately. The cloud application is limited to invited testers. The gate is deliberately
 * small — an email allowlist plus shared invite codes — because a heavier system would be more
 * surface than the beta itself.
 *
 * Off by default so local development and the Playwright suite are unaffected.
 */

export type BetaAccessErrorReason = "email-not-invited" | "invalid-invite-code";

const betaAccessMessages: Record<BetaAccessErrorReason, string> = {
  "email-not-invited": "Diese E-Mail ist noch nicht für die Beta freigeschaltet.",
  "invalid-invite-code": "Der Einladungscode ist ungültig.",
};

export class BetaAccessError extends Error {
  readonly status = 403;
  readonly reason: BetaAccessErrorReason;

  constructor(reason: BetaAccessErrorReason = "email-not-invited") {
    super(betaAccessMessages[reason]);
    this.name = "BetaAccessError";
    this.reason = reason;
  }
}

export function isBetaGateEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.BLOOMMD_BETA_ACCESS === "1";
}

function list(value: string | undefined): string[] {
  return value?.split(",").map((entry) => entry.trim()).filter(Boolean) ?? [];
}

export function invitedEmails(env: NodeJS.ProcessEnv = process.env): string[] {
  return list(env.BLOOMMD_BETA_ALLOWED_EMAILS).map((entry) => entry.toLowerCase());
}

export function isEmailInvited(email: string, env: NodeJS.ProcessEnv = process.env): boolean {
  const allowed = invitedEmails(env);
  if (allowed.length === 0) return false;
  const candidate = email.trim().toLowerCase();
  // A bare domain entry (`@example.com`) invites everyone at that domain.
  return allowed.some((entry) => entry.startsWith("@") ? candidate.endsWith(entry) : entry === candidate);
}

/** Compared in constant time so a code cannot be recovered by measuring responses. */
function matches(candidate: string, expected: string): boolean {
  const a = Buffer.from(candidate);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function isInviteCodeValid(code: string | null | undefined, env: NodeJS.ProcessEnv = process.env): boolean {
  const candidate = code?.trim();
  if (!candidate) return false;
  return list(env.BLOOMMD_BETA_INVITE_CODES).some((expected) => matches(candidate, expected));
}

/**
 * Decides whether a signup may proceed.
 *
 * An invited email needs no code; a code admits anyone who has it. Both paths are accepted so the
 * operator can hand out a code to a group and still allowlist individuals.
 */
export function assertBetaSignupAllowed(
  input: { email: string; inviteCode?: string | null },
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (!isBetaGateEnabled(env)) return;
  if (isEmailInvited(input.email, env)) return;
  if (isInviteCodeValid(input.inviteCode, env)) return;
  throw new BetaAccessError(input.inviteCode?.trim() ? "invalid-invite-code" : "email-not-invited");
}

export async function assertBetaSignupAllowedForRequest(
  input: { email: string; inviteCode?: string | null },
  env: NodeJS.ProcessEnv = process.env,
) {
  if (!isBetaGateEnabled(env)) return;
  if (isEmailInvited(input.email, env)) return;
  if (await hasActiveBetaInvite(input.email)) return;
  if (isInviteCodeValid(input.inviteCode, env)) return;
  throw new BetaAccessError(input.inviteCode?.trim() ? "invalid-invite-code" : "email-not-invited");
}

export async function canBetaSignup(input: { email: string; inviteCode?: string | null }, env: NodeJS.ProcessEnv = process.env) {
  try {
    await assertBetaSignupAllowedForRequest(input, env);
    return true;
  } catch (error) {
    if (error instanceof BetaAccessError) return false;
    throw error;
  }
}

/**
 * Login is deliberately *not* gated.
 *
 * An earlier draft re-checked the allowlist on every sign-in so that removing an address would
 * revoke access. That locks out every tester who joined with an invite code, because their address
 * was never on the list — a trap that would surface only once real testers were using the product.
 *
 * Signup is the door. Revoking a tester means deleting their account, which the account API already
 * supports, so there is one clear mechanism instead of two that disagree.
 */
