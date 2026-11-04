import { getAppLocale, type AppLocale } from "./locale";

/**
 * Read-only mode of accounts whose trial has ended (#274). Off by default; `BLOOMMD_TRIAL_READONLY=1`
 * turns it on, after the admin's go and in agreement with Ops. Nothing is deleted: reading and the
 * export stay, only writes are refused. This file holds the parts that need no database; the check
 * itself is in `trial-guard.ts`, called from `proxy.ts` for every write to the API.
 */
export function isTrialReadonlyEnabled(env: Record<string, string | undefined> = process.env) {
  return env.BLOOMMD_TRIAL_READONLY === "1";
}

export const TRIAL_EXPIRED_CODE = "TRIAL_EXPIRED";

export function trialExpiredMessage(locale: AppLocale) {
  return locale === "en"
    ? "Your trial period has ended and your account is read-only. You can still read and export your data."
    : "Dein Testzeitraum ist abgelaufen, dein Konto ist nur noch lesbar. Lesen und Export sind weiterhin möglich.";
}

/** Language of an API refusal: `?lang=en` like the rest of the app, else the browser's preference. */
export function trialRequestLocale(request: { url: string; headers: { get(name: string): string | null } }): AppLocale {
  try {
    const lang = new URL(request.url).searchParams.get("lang");
    if (lang) return getAppLocale(lang);
  } catch {
    // Fall through to the header.
  }
  return /^\s*en\b/i.test(request.headers.get("accept-language") ?? "") ? "en" : "de";
}

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * API paths that stay writable although the account is read-only: signing in and out, the mobile
 * sign-in, billing and its webhook, internal and operational routes, feedback, and deleting the
 * account (a right of the person, not something the product takes away). Everything else that
 * writes is refused by default, so a new write route is covered without being listed. The sync
 * ticket is not refused but handed out as read-only (see `sync-ticket/route.ts`).
 */
const EXEMPT_PREFIXES = [
  "/api/auth/",
  "/api/mobile/",
  "/api/billing/",
  "/api/internal/",
  "/api/account/delete",
  "/api/feedback",
  "/api/health",
  "/api/config",
  "/api/version",
  "/api/link-preview",
  "/api/sync-ticket",
];
const LEAVE_WORKSPACE = /^\/api\/workspaces\/[^/]+\/leave\/?$/;

/** Whether this request is a write the read-only mode refuses (before the account is looked at). */
export function isTrialGuardedWrite(method: string, pathname: string) {
  if (READ_METHODS.has(method.toUpperCase())) return false;
  if (!pathname.startsWith("/api/")) return false;
  if (EXEMPT_PREFIXES.some((prefix) => pathname === prefix.replace(/\/$/, "") || pathname.startsWith(prefix))) return false;
  if (LEAVE_WORKSPACE.test(pathname)) return false;
  // Revoking an access token only removes access; creating one is a write.
  if (method.toUpperCase() === "DELETE" && pathname.startsWith("/api/account/access-tokens")) return false;
  return true;
}
