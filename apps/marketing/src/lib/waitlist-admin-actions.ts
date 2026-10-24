import { sendWaitlistConfirmationEmail } from "./email";
import { inviteBetaTesterFromWaitlist, isBetaInviteClientConfigured } from "./beta-invite-client";
import type { MarketingLocale } from "./locale";
import {
  deleteWaitlistEntryByEmail,
  isWaitlistConfigured,
  listWaitlistAdminEntries,
  renewPendingWaitlistConfirmation,
} from "./waitlist-db";

export type WaitlistAdminActionError =
  | "waitlist-not-configured"
  | "invite-api-not-configured"
  | "missing-email"
  | "invalid-email"
  | "invalid-mode"
  | "not-confirmed"
  | "not-pending"
  | "not-found"
  | "missing-confirmation"
  | "email-send-failed"
  | "invite-server-error"
  | "invite-failed"
  | "resend-failed"
  | "delete-failed"
  | "server-error";

export type WaitlistAdminActionResult =
  | { ok: true; action: "invite"; email: string; inviteMail: string }
  | { ok: true; action: "resend-confirmation"; email: string }
  | { ok: true; action: "delete"; email: string }
  | { ok: false; error: WaitlistAdminActionError; email?: string };

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeWaitlistAdminEmail(value: unknown): { email: string } | { error: "missing-email" | "invalid-email" } {
  if (typeof value !== "string" || !value.trim()) return { error: "missing-email" };
  const email = value.trim().toLowerCase();
  if (!emailPattern.test(email) || email.length > 320) return { error: "invalid-email" };
  return { email };
}

async function findEntry(email: string) {
  const entries = await listWaitlistAdminEntries();
  return entries.find((entry) => entry.email.toLowerCase() === email) ?? null;
}

export async function resendWaitlistConfirmation(emailInput: unknown, locale: MarketingLocale = "de"): Promise<WaitlistAdminActionResult> {
  const normalized = normalizeWaitlistAdminEmail(emailInput);
  if ("error" in normalized) return { ok: false, error: normalized.error };
  const { email } = normalized;

  if (!isWaitlistConfigured()) return { ok: false, error: "waitlist-not-configured", email };

  try {
    const entry = await findEntry(email);
    if (!entry || entry.status !== "pending") return { ok: false, error: "not-pending", email };

    const renewal = await renewPendingWaitlistConfirmation(email);
    if (!renewal.token) return { ok: false, error: "server-error", email };

    try {
      const delivery = await sendWaitlistConfirmationEmail(email, renewal.token, locale);
      if (!delivery.sent) return { ok: false, error: "email-send-failed", email };
    } catch (error) {
      console.error("[BloomMD] Waitlist confirmation email send failed:", error instanceof Error ? error.name : "unknown");
      return { ok: false, error: "email-send-failed", email };
    }

    return { ok: true, action: "resend-confirmation", email };
  } catch (error) {
    console.error("[BloomMD] Waitlist confirmation resend failed:", error instanceof Error ? error.name : "unknown");
    return { ok: false, error: "server-error", email };
  }
}

export async function inviteWaitlistEntry(
  emailInput: unknown,
  mode: unknown = "invite",
  locale: MarketingLocale = "de",
): Promise<WaitlistAdminActionResult> {
  const normalized = normalizeWaitlistAdminEmail(emailInput);
  if ("error" in normalized) return { ok: false, error: normalized.error };
  const { email } = normalized;
  if (mode !== "invite" && mode !== "resend") return { ok: false, error: "invalid-mode", email };

  if (!isWaitlistConfigured()) return { ok: false, error: "waitlist-not-configured", email };
  if (!isBetaInviteClientConfigured()) return { ok: false, error: "invite-api-not-configured", email };

  try {
    const entry = await findEntry(email);
    if (!entry || entry.status !== "confirmed") return { ok: false, error: "not-confirmed", email };

    const result = await inviteBetaTesterFromWaitlist(email, { forceSendEmail: mode === "resend", locale });
    const mailStatus = result.mail?.sent ? "sent" : result.mail?.reason ?? "unknown";
    return { ok: true, action: "invite", email, inviteMail: mailStatus };
  } catch (error) {
    console.error("[BloomMD] Waitlist beta invite failed:", error instanceof Error ? error.name : "unknown");
    return { ok: false, error: "invite-server-error", email };
  }
}

export async function deleteWaitlistEntry(
  emailInput: unknown,
  confirmation: unknown,
): Promise<WaitlistAdminActionResult> {
  const normalized = normalizeWaitlistAdminEmail(emailInput);
  if ("error" in normalized) return { ok: false, error: normalized.error };
  const { email } = normalized;

  if (!isWaitlistConfigured()) return { ok: false, error: "waitlist-not-configured", email };
  if (confirmation !== "delete") return { ok: false, error: "missing-confirmation", email };

  try {
    const entry = await findEntry(email);
    if (!entry) return { ok: false, error: "not-found", email };

    const deleted = await deleteWaitlistEntryByEmail(email);
    return deleted ? { ok: true, action: "delete", email } : { ok: false, error: "delete-failed", email };
  } catch (error) {
    console.error("[BloomMD] Waitlist delete failed:", error instanceof Error ? error.name : "unknown");
    return { ok: false, error: "server-error", email };
  }
}
