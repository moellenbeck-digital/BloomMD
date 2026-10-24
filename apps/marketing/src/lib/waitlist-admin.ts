import type { ConfirmedWaitlistEntry, WaitlistAdminEntry } from "./waitlist-db";
import type { WaitlistAdminActionResult } from "./waitlist-admin-actions";

export const DEFAULT_WAITLIST_ALLOWLIST_LIMIT = 10;

export type WaitlistStatusFilter = "all" | WaitlistAdminEntry["status"];

export function normalizeWaitlistStatusFilter(value: unknown): WaitlistStatusFilter {
  return value === "pending" || value === "confirmed" || value === "unsubscribed" ? value : "all";
}

export function normalizeWaitlistAllowlistLimit(value: string | number | null | undefined, fallback = DEFAULT_WAITLIST_ALLOWLIST_LIMIT) {
  const parsed = value == null || value === "" ? fallback : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, 500);
}

export function formatWaitlistAllowlist(entries: ConfirmedWaitlistEntry[], limit: number) {
  const selected = entries.slice(0, normalizeWaitlistAllowlistLimit(limit));
  return `BLOOMMD_BETA_ALLOWED_EMAILS=${selected.map((entry) => entry.email).join(",")}`;
}

function csvCell(value: string | null | undefined) {
  const text = value ?? "";
  return /[",\n\r]/.test(text) ? `"${text.replaceAll("\"", "\"\"")}"` : text;
}

export function waitlistEntriesToCsv(entries: ConfirmedWaitlistEntry[]) {
  const rows = [
    ["email", "confirmed_at", "source"],
    ...entries.map((entry) => [entry.email, entry.confirmedAt, entry.source ?? ""]),
  ];
  return `${rows.map((row) => row.map(csvCell).join(",")).join("\n")}\n`;
}

export function waitlistAdminActionRedirectPath(
  formData: FormData,
  result: WaitlistAdminActionResult | { ok: false; error: "invalid-origin" | "admin-session" | "request-blocked"; email?: string },
) {
  const params = new URLSearchParams();
  params.set("limit", String(normalizeWaitlistAllowlistLimit(String(formData.get("limit") ?? ""))));
  const locale = String(formData.get("lang") ?? "");
  if (locale === "en") params.set("lang", locale);
  const status = normalizeWaitlistStatusFilter(String(formData.get("status") ?? ""));
  if (status !== "all") params.set("status", status);

  if (result.ok) {
    params.set("actionEmail", result.email);
    if (result.action === "invite") {
      params.set("invited", result.email);
      params.set("inviteMail", result.inviteMail);
    } else if (result.action === "resend-confirmation") {
      params.set("resent", result.email);
    } else {
      params.set("deleted", result.email);
    }
  } else {
    params.set("actionEmail", result.email ?? String(formData.get("email") ?? "").trim().toLowerCase());
    const intent = String(formData.get("intent"));
    if (result.error === "admin-session") params.set("adminError", result.error);
    else if (intent === "resend-confirmation" || result.error === "not-pending" || result.error === "email-send-failed") {
      params.set("resendError", result.error);
    } else if (intent === "delete" || result.error === "not-found" || result.error === "missing-confirmation" || result.error === "delete-failed") {
      params.set("deleteError", result.error);
    } else {
      params.set("inviteError", result.error);
    }
  }

  return `/admin/waitlist?${params.toString()}`;
}
