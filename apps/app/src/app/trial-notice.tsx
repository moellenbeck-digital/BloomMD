import { Info } from "lucide-react";
import { getTrialEndsAt, normalizeUuid } from "../lib/db";
import { isTrialWriteLocked } from "../lib/trial-lock";
import type { AppLocale } from "../lib/locale";

/** End of the account's trial, or null (no database, no account, address not confirmed yet). */
export async function trialEndsAtForUser(userId: string | undefined) {
  const id = normalizeUuid(userId);
  return id ? getTrialEndsAt(id) : null;
}

/**
 * Notice of the read-only mode (#274): shown only with BLOOMMD_TRIAL_READONLY=1 and only when the
 * trial of the signed-in account has ended and it has no active plan (#378; the same rule as the
 * write guard, `isTrialWriteLocked`). Floats at the bottom so the app's full-height layout stays
 * as it is.
 */
export async function TrialReadonlyNotice({ userId, locale, floating = false }: { userId: string | undefined; locale: AppLocale; floating?: boolean }) {
  if (!(await isTrialWriteLocked(userId, new Date()))) return null;
  return (
    <div
      role="status"
      data-testid="trial-expired-banner"
      className={`${floating ? "fixed inset-x-3 bottom-3 z-50 mx-auto max-w-3xl shadow-lg" : "mt-5"} flex items-start gap-2 rounded-md border border-[#FFD4BF] bg-[#FFF4EE] px-4 py-3 text-sm text-[#8A3518]`}
    >
      <Info size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
      <span>
        <strong>{locale === "en" ? "Trial period ended" : "Testzeitraum abgelaufen"}.</strong>{" "}
        {locale === "en" ? "Your account is read-only, export is possible." : "Dein Konto ist nur lesbar, der Export ist möglich."}
      </span>
    </div>
  );
}
