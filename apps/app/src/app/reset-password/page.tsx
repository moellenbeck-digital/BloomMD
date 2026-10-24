import Link from "next/link";
import { authCopy, getAuthLocale, languageLabel, localizeAuthError, otherAuthLocale } from "../../lib/auth-copy";
import { appendAuthParams, parseWorkspaceInviteHandoff } from "../../lib/invite-intent";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string; invite?: string; lang?: string }>;
}) {
  const params = await searchParams;
  const locale = getAuthLocale(params.lang);
  const copy = authCopy[locale];
  const token = params.token ?? "";
  const invite = parseWorkspaceInviteHandoff(params.invite) ? params.invite : null;
  const languageHref = appendAuthParams("/reset-password", { token, invite, lang: otherAuthLocale(locale) });
  const requestHref = appendAuthParams("/forgot-password", { invite, lang: locale });
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
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#B64A1F]">{copy.passwordForgotten}</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">{locale === "en" ? "Choose a new password" : "Neues Passwort setzen"}</h1>
          <p className="mt-3 text-base leading-7 text-[#5F574F]">{locale === "en" ? "Choose a password with at least 10 characters and one number." : "Wähle ein neues Passwort mit mindestens 10 Zeichen und einer Zahl."}</p>
          {localizedError && <p className="mt-5 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{localizedError}</p>}
          {!token ? (
            <div className="mt-5 rounded-md border border-[#FFD4BF] bg-[#FFF4EE] px-3 py-2 text-sm text-[#8A3518]">{locale === "en" ? "This reset link is incomplete. Request a new one." : "Dieser Reset-Link ist unvollständig. Fordere bitte einen neuen Link an."}</div>
          ) : (
            <form action="/api/auth/reset-password" method="post" className="mt-6 grid gap-4">
              <input type="hidden" name="token" value={token} />
              <input type="hidden" name="invite" value={invite ?? ""} />
              <input type="hidden" name="lang" value={locale} />
              <label className="grid gap-2 text-sm font-medium">
                {locale === "en" ? "New password" : "Neues Passwort"}
                <input name="password" type="password" required minLength={10} autoComplete="new-password" className="min-h-11 rounded-md border border-[#D4CFC8] bg-white px-3 text-sm outline-none focus:border-[#FF6B35] focus:ring-2 focus:ring-[#FF6B35]/20" placeholder={copy.passwordHint} />
              </label>
              <button type="submit" className="min-h-11 rounded-md bg-[#B64A1F] px-4 py-2 text-sm font-semibold text-white hover:bg-[#8A3518]">{locale === "en" ? "Save password" : "Passwort speichern"}</button>
            </form>
          )}
          <p className="mt-5 text-center text-sm text-[#666666]"><Link href={requestHref} className="font-semibold text-[#B64A1F] hover:text-[#FF6B35]">{locale === "en" ? "Request a new link" : "Neuen Link anfordern"}</Link></p>
        </section>
      </div>
    </main>
  );
}
