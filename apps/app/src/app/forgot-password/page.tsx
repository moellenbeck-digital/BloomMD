import Link from "next/link";
import { safeNextPath } from "../../lib/auth";
import { authCopy, getAuthLocale, languageLabel, localizeAuthError, otherAuthLocale } from "../../lib/auth-copy";
import { appendAuthParams, parseWorkspaceInviteHandoff } from "../../lib/invite-intent";

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string; invite?: string; lang?: string }>;
}) {
  const params = await searchParams;
  const locale = getAuthLocale(params.lang);
  const copy = authCopy[locale];
  const next = safeNextPath(params.next, "/login");
  const invite = parseWorkspaceInviteHandoff(params.invite) ? params.invite : null;
  const languageHref = appendAuthParams("/forgot-password", { next, invite, lang: otherAuthLocale(locale) });
  const loginHref = appendAuthParams("/login", { next, invite, lang: locale });
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
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">{locale === "en" ? "Reset your password" : "Passwort zurücksetzen"}</h1>
          <p className="mt-3 text-base leading-7 text-[#5F574F]">{locale === "en" ? "Enter your email. If a BloomMD account exists, we will send a reset link." : "Gib deine E-Mail-Adresse ein. Falls ein BloomMD Account existiert, senden wir dir einen Reset-Link."}</p>
          {localizedError && <p className="mt-5 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{localizedError}</p>}
          <form action="/api/auth/request-password-reset" method="post" className="mt-6 grid gap-4">
            <input type="hidden" name="next" value={next} />
            <input type="hidden" name="invite" value={invite ?? ""} />
            <input type="hidden" name="lang" value={locale} />
            <label className="grid gap-2 text-sm font-medium">
              {copy.email}
              <input name="email" type="email" required autoComplete="email" className="min-h-11 rounded-md border border-[#D4CFC8] bg-white px-3 text-sm outline-none focus:border-[#FF6B35] focus:ring-2 focus:ring-[#FF6B35]/20" placeholder="max@example.com" />
            </label>
            <button type="submit" className="min-h-11 rounded-md bg-[#B64A1F] px-4 py-2 text-sm font-semibold text-white hover:bg-[#8A3518]">{locale === "en" ? "Send reset link" : "Reset-Link senden"}</button>
          </form>
          <p className="mt-5 text-center text-sm text-[#666666]"><Link href={loginHref} className="font-semibold text-[#B64A1F] hover:text-[#FF6B35]">{copy.backToSignIn}</Link></p>
        </section>
      </div>
    </main>
  );
}
