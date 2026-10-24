import { publicAppUrl } from "./deployment";
import type { MarketingLocale } from "./locale";

export type BetaInviteStatus = "none" | "invited" | "accepted" | "revoked" | "expired";
export type BetaInviteMailStatus =
  | { sent: true }
  | { sent: false; reason: "disabled" | "already-invited" | "not-configured" | "provider-error" };

export interface BetaInviteResult {
  invite?: {
    email: string;
    status: BetaInviteStatus;
    invitedAt?: string;
    acceptedAt?: string | null;
    expiresAt?: string | null;
    revokedAt?: string | null;
  };
  mail?: BetaInviteMailStatus;
}

function internalAppUrl() {
  return (process.env.BLOOMMD_APP_INTERNAL_URL || publicAppUrl()).replace(/\/$/, "");
}

function inviteSecret() {
  return process.env.BLOOMMD_INTERNAL_INVITE_SECRET?.trim() || null;
}

export function isBetaInviteClientConfigured() {
  return Boolean(inviteSecret());
}

async function internalFetch(path: string, body: unknown) {
  const secret = inviteSecret();
  if (!secret) throw new Error("BLOOMMD_INTERNAL_INVITE_SECRET is not configured.");

  const response = await fetch(`${internalAppUrl()}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`BloomMD app invite API failed with ${response.status}.`);
  }
  return response.json() as Promise<unknown>;
}

export async function inviteBetaTesterFromWaitlist(email: string, options: { forceSendEmail?: boolean; locale?: MarketingLocale } = {}) {
  const body: {
    email: string;
    source: "waitlist";
    sendEmail: true;
    forceSendEmail?: true;
    lang?: MarketingLocale;
  } = {
    email,
    source: "waitlist",
    sendEmail: true,
  };
  if (options.forceSendEmail === true) body.forceSendEmail = true;
  if (options.locale) body.lang = options.locale;
  return internalFetch("/api/internal/beta-invites", body) as Promise<BetaInviteResult>;
}

export async function getBetaInviteStatuses(emails: string[]) {
  if (!isBetaInviteClientConfigured() || emails.length === 0) return new Map<string, BetaInviteStatus>();
  const result = await internalFetch("/api/internal/beta-invites/statuses", { emails }) as {
    entries?: Array<{ email: string; status: BetaInviteStatus }>;
  };
  return new Map((result.entries ?? []).map((entry) => [entry.email.toLowerCase(), entry.status]));
}
