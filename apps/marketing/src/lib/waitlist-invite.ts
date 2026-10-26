import { sendWaitlistInvitationEmail } from "./email";
import type { MarketingLocale } from "./locale";
import {
  claimWaitlistInvitation,
  listInvitableWaitlist,
  releaseWaitlistInvitation,
  type ConfirmedWaitlistEntry,
} from "./waitlist-db";

export interface WaitlistInviteDeps {
  list: () => Promise<ConfirmedWaitlistEntry[]>;
  claim: (email: string) => Promise<string | null>;
  release: (email: string) => Promise<void>;
  send: (email: string, unsubscribeToken: string, locale: MarketingLocale) => Promise<{ sent: boolean }>;
}

export interface WaitlistInviteResult {
  apply: boolean;
  /** Everybody the run would write to (dry-run) or tried to write to (apply). */
  candidates: string[];
  sent: string[];
  /** Claimed by another run in the meantime — not written to by this one. */
  skipped: string[];
  /** Mail not sent; the marker was taken back, so the next run tries again. */
  failed: string[];
}

const defaultDeps: WaitlistInviteDeps = {
  list: listInvitableWaitlist,
  claim: claimWaitlistInvitation,
  release: releaseWaitlistInvitation,
  send: sendWaitlistInvitationEmail,
};

/** The English landing page records `landing-en`; everything else gets the German mail. */
export function waitlistInviteLocale(source: string | null): MarketingLocale {
  return source?.endsWith("-en") ? "en" : "de";
}

/**
 * One-time invitation to confirmed, not unsubscribed waitlist addresses.
 *
 * Dry-run by default: lists, sends nothing, changes nothing. With `apply`, each address is claimed
 * (marked in the table) before its mail goes out, so a second run — or a crash halfway — never
 * writes to anyone twice. A failed send gives the marker back.
 */
export async function runWaitlistInvitation(
  options: { apply?: boolean } = {},
  deps: WaitlistInviteDeps = defaultDeps,
): Promise<WaitlistInviteResult> {
  const apply = options.apply ?? false;
  const entries = await deps.list();
  const result: WaitlistInviteResult = { apply, candidates: entries.map((entry) => entry.email), sent: [], skipped: [], failed: [] };
  if (!apply) return result;

  for (const entry of entries) {
    const token = await deps.claim(entry.email);
    if (!token) {
      result.skipped.push(entry.email);
      continue;
    }
    let delivered = false;
    try {
      delivered = (await deps.send(entry.email, token, waitlistInviteLocale(entry.source))).sent;
    } catch (error) {
      console.error("[BloomMD] Waitlist invitation failed:", error instanceof Error ? error.name : "unknown");
    }
    if (delivered) {
      result.sent.push(entry.email);
    } else {
      await deps.release(entry.email);
      result.failed.push(entry.email);
    }
  }
  return result;
}
