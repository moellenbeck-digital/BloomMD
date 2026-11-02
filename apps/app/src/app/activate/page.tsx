import Link from "next/link";
import { authCopy, getAuthLocale, languageLabel, localizeAuthError, otherAuthLocale, SIGNUP_CONSENT_FIELD } from "../../lib/auth-copy";
import { appendAuthParams } from "../../lib/invite-intent";
import { withAppLocale } from "../../lib/locale";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Landing page of the activation mail for a prepared waitlist account (#105). Opening it changes
 * nothing, so a mail scanner that follows the link cannot use it up: the account is only activated
 * by the form below (POST /api/auth/activate-account).
 */
export default async function ActivatePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string; lang?: string }>;
}) {
  const params = await searchParams;
  const locale = getAuthLocale(params.lang);
  const en = locale === "en";
  const copy = authCopy[locale];
  const token = params.token ?? "";
  const languageHref = appendAuthParams("/activate", { token, lang: otherAuthLocale(locale) });
  const signupHref = appendAuthParams("/signup", { lang: locale });
  const error = params.error ? (() => {
    try { return decodeURIComponent(params.error); } catch { return params.error; }
  })() : "";
  const localizedError = localizeAuthError(error, locale);

  return (
    <main className="min-h-screen bg-[#FAFAF7] px-4 py-6 text-[#1A1A1A] sm:px-8 sm:py-10">
      <div className="mx-auto flex max-w-2xl items-center justify-between">
        <Link href={appendAuthParams("/", { lang: locale })} className="text-lg font-semibold tracking-tight">BloomMD</Link>
        <Link href={languageHref} className="rounded-md border border-[#D4CFC8] bg-white px-3 py-2 text-sm font-semibold text-[#5F574F] hover:bg-[#F2F0ED]" aria-label={`${copy.language}: ${languageLabel(otherAuthLocale(locale))}`}>
          {languageLabel(otherAuthLocale(locale))}
        </Link>
      </div>
      <div className="mx-auto mt-8 max-w-md sm:mt-14">
        <section className="rounded-2xl border border-[#E8E4DF] bg-white p-6 shadow-sm sm:p-8">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#B64A1F]">{copy.accountStep}</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">{en ? "Activate your account" : "Account aktivieren"}</h1>
          <p className="mt-3 text-base leading-7 text-[#5F574F]">{en ? "You joined the BloomMD waitlist. Choose a password to confirm this email address and activate your account." : "Du hast dich auf die BloomMD-Warteliste eingetragen. Wähle ein Passwort, um diese E-Mail-Adresse zu bestätigen und deinen Account zu aktivieren."}</p>
          {localizedError && <p className="mt-5 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert" data-testid="activate-error">{localizedError}</p>}
          {!token ? (
            <div className="mt-5 rounded-md border border-[#FFD4BF] bg-[#FFF4EE] px-3 py-2 text-sm text-[#8A3518]">{en ? "This activation link is incomplete. Open the link from the email again." : "Dieser Aktivierungslink ist unvollständig. Öffne den Link aus der E-Mail bitte noch einmal."}</div>
          ) : (
            <form action="/api/auth/activate-account" method="post" className="mt-6 grid gap-4" data-testid="activate-form">
              <input type="hidden" name="token" value={token} />
              <input type="hidden" name="lang" value={locale} />
              <label className="grid gap-2 text-sm font-medium">
                {copy.password}
                <input name="password" type="password" required minLength={10} autoComplete="new-password" className="min-h-11 rounded-md border border-[#D4CFC8] bg-white px-3 text-sm outline-none focus:border-[#FF6B35] focus:ring-2 focus:ring-[#FF6B35]/20" placeholder={copy.passwordHint} />
                <span className="text-xs font-normal text-[#666666]">{copy.passwordHint}</span>
              </label>
              <label className="flex items-start gap-3 text-sm leading-6 text-[#5F574F]">
                <input name={SIGNUP_CONSENT_FIELD} type="checkbox" value="1" required className="mt-1.5 h-4 w-4 shrink-0 accent-[#B64A1F]" data-testid="activate-consent" />
                <span>
                  {copy.consent.before}
                  <Link href={withAppLocale("/datenschutz", locale)} target="_blank" rel="noopener" className="font-semibold text-[#8A3518] underline hover:text-[#FF6B35]">{copy.consent.privacy}</Link>
                  {copy.consent.between}
                  <Link href={withAppLocale("/agb", locale)} target="_blank" rel="noopener" className="font-semibold text-[#8A3518] underline hover:text-[#FF6B35]">{copy.consent.terms}</Link>
                  {copy.consent.after}
                </span>
              </label>
              <button type="submit" className="min-h-11 rounded-md bg-[#B64A1F] px-4 py-2 text-sm font-semibold text-white hover:bg-[#8A3518]" data-testid="activate-submit">{en ? "Activate account" : "Account aktivieren"}</button>
            </form>
          )}
          <p className="mt-5 text-center text-sm text-[#666666]">{en ? "Link expired? " : "Link abgelaufen? "}<Link href={signupHref} className="font-semibold text-[#B64A1F] hover:text-[#FF6B35]">{en ? "Sign up here" : "Hier registrieren"}</Link></p>
        </section>
      </div>
    </main>
  );
}
