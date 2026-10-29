import Link from "next/link";
import { redirect } from "next/navigation";
import { isE2EAuthBypassEnabled, safeNextPath } from "../../lib/auth";
import { canBetaSignup, isBetaGateEnabled } from "../../lib/betaAccess";
import { getWorkspaceInvitationPreviewById } from "../../lib/db";
import { authCopy, formatAuthDate, SIGNUP_CONSENT_FIELD, getAuthLocale, languageLabel, localizeAuthError, otherAuthLocale, roleLabel } from "../../lib/auth-copy";
import { appendAuthParams, parseWorkspaceInviteHandoff } from "../../lib/invite-intent";
import { isDatabaseConfigured } from "../../lib/db";
import { withAppLocale } from "../../lib/locale";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function decodeMessage(value: string | undefined) {
  if (!value) return "";
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; email?: string; invite?: string; access?: string; lang?: string }>;
}) {
  if (!isDatabaseConfigured() && !isE2EAuthBypassEnabled()) {
    redirect("/login?error=DATABASE_URL%20ist%20noch%20nicht%20konfiguriert.");
  }

  const params = await searchParams;
  const locale = getAuthLocale(params.lang);
  const copy = authCopy[locale];
  const next = safeNextPath(params.next);
  const inviteHandoff = parseWorkspaceInviteHandoff(params.invite);
  const invitation = inviteHandoff ? await getWorkspaceInvitationPreviewById(inviteHandoff.invitationId) : null;
  const hasInviteParam = Boolean(params.invite);
  const inviteInvalid = hasInviteParam && (!inviteHandoff || !invitation);
  const email = invitation?.email ?? String(params.email || "").trim().toLowerCase();
  const betaGate = isBetaGateEnabled();
  const accessGranted = params.access === "granted";
  // The browser bypass is deliberately not used to hide the beta gate. It only makes the server
  // mutation deterministic for E2E; the beta suite must still exercise the real access UI.
  const betaEligible = !betaGate || accessGranted || (email ? await canBetaSignup({ email }) : false);
  const showBetaGate = betaGate && !betaEligible;
  const errorMessage = localizeAuthError(decodeMessage(params.error), locale);
  const languageHref = appendAuthParams("/signup", {
    next,
    email: email || null,
    invite: params.invite,
    access: params.access,
    lang: otherAuthLocale(locale),
  });
  const loginHref = appendAuthParams("/login", { next, invite: inviteHandoff ? params.invite : null, lang: locale });
  const signupForm = betaEligible && !inviteInvalid ? (
    <form action="/api/auth/signup" method="post" className="mt-6 grid gap-4" data-testid="signup-form">
      <input type="hidden" name="next" value={next} />
      <input type="hidden" name="invite" value={inviteHandoff ? params.invite : ""} />
      <input type="hidden" name="lang" value={locale} />
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
      <input type="hidden" name="formStartedAt" value={String(Date.now())} />
      <label className="grid gap-2 text-sm font-medium">
        {copy.name}
        <input name="name" className="min-h-11 rounded-md border border-[#D4CFC8] bg-white px-3 text-sm outline-none focus:border-[#FF6B35] focus:ring-2 focus:ring-[#FF6B35]/20" placeholder={locale === "de" ? "Max" : "Alex"} />
      </label>
      <label className="grid gap-2 text-sm font-medium">
        {copy.email}
        <input
          name="email"
          type="email"
          required
          readOnly={Boolean(invitation)}
          defaultValue={email}
          className="min-h-11 rounded-md border border-[#D4CFC8] bg-white px-3 text-sm outline-none focus:border-[#FF6B35] focus:ring-2 focus:ring-[#FF6B35]/20 read-only:bg-[#F2F0ED]"
          placeholder="max@example.com"
        />
      </label>
      <label className="grid gap-2 text-sm font-medium">
        {copy.password}
        <input name="password" type="password" required minLength={10} className="min-h-11 rounded-md border border-[#D4CFC8] bg-white px-3 text-sm outline-none focus:border-[#FF6B35] focus:ring-2 focus:ring-[#FF6B35]/20" placeholder={copy.passwordHint} />
        <span className="text-xs font-normal text-[#666666]">{copy.passwordHint}</span>
      </label>
      <label className="flex items-start gap-3 text-sm leading-6 text-[#5F574F]">
        <input name={SIGNUP_CONSENT_FIELD} type="checkbox" value="1" required className="mt-1.5 h-4 w-4 shrink-0 accent-[#B64A1F]" data-testid="signup-consent" />
        <span>
          {copy.consent.before}
          <Link href={withAppLocale("/datenschutz", locale)} target="_blank" rel="noopener" className="font-semibold text-[#8A3518] underline hover:text-[#FF6B35]">{copy.consent.privacy}</Link>
          {copy.consent.between}
          <Link href={withAppLocale("/agb", locale)} target="_blank" rel="noopener" className="font-semibold text-[#8A3518] underline hover:text-[#FF6B35]">{copy.consent.terms}</Link>
          {copy.consent.after}
        </span>
      </label>
      <button type="submit" className="min-h-11 rounded-md bg-[#B64A1F] px-4 py-2 text-sm font-semibold text-white hover:bg-[#8A3518]" data-testid="signup-submit">
        {copy.createAccount}
      </button>
    </form>
  ) : null;

  return (
    <main className="min-h-screen bg-[#FAFAF7] px-4 py-6 text-[#1A1A1A] sm:px-8 sm:py-10">
      <div className="mx-auto flex max-w-5xl items-center justify-between">
        <Link href={appendAuthParams("/", { lang: locale })} className="text-lg font-semibold tracking-tight">BloomMD</Link>
        <Link href={languageHref} className="rounded-md border border-[#D4CFC8] bg-white px-3 py-2 text-sm font-semibold text-[#5F574F] hover:bg-[#F2F0ED]" aria-label={`${copy.language}: ${languageLabel(otherAuthLocale(locale))}`}>
          {languageLabel(otherAuthLocale(locale))}
        </Link>
      </div>
      <div className="mx-auto mt-8 max-w-5xl sm:mt-12">
        <ol className="flex flex-wrap items-center gap-2 text-sm text-[#5F574F]" aria-label={locale === "de" ? "Registrierungsschritte" : "Signup steps"}>
          <li aria-current="step" className="font-semibold text-[#1A1A1A]"><span className="mr-2 inline-block h-2.5 w-2.5 rounded-full bg-[#FF6B35]" aria-hidden="true" />{copy.accountStep}</li>
          <li aria-hidden="true">—</li>
          <li>{copy.verifyStep}</li>
          <li aria-hidden="true">—</li>
          <li>{copy.startStep}</li>
        </ol>
      </div>
      <div className="mx-auto mt-5 grid max-w-5xl gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,28rem)] lg:items-start">
        <section className="rounded-2xl border border-[#E8E4DF] bg-white p-6 shadow-sm sm:p-8">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#B64A1F]">{invitation ? copy.invitation : copy.accountStep}</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">{invitation ? copy.invitedBy(invitation.inviterName || invitation.inviterEmail, invitation.workspaceName) : copy.createAccount}</h1>
          <p className="mt-4 max-w-xl text-base leading-7 text-[#5F574F]">{invitation ? copy.invitationPending : copy.accountSubtitle}</p>
          {invitation && (
            <div className="mt-6 rounded-xl border border-[#F4CBB8] bg-[#FFF6F1] p-4 text-sm leading-6" data-testid="signup-invite-context">
              <p className="font-semibold text-[#1A1A1A]">{invitation.workspaceName}</p>
              <p className="mt-1 text-[#5F574F]">{copy.invitationRole}: {roleLabel(invitation.role, locale)}</p>
              <p className="text-[#5F574F]">{copy.invitedEmail(invitation.email)}</p>
              <p className="text-[#5F574F]">{copy.expires(formatAuthDate(invitation.expiresAt, locale))}</p>
            </div>
          )}
          {inviteInvalid && <p className="mt-5 rounded-md border border-red-200 bg-red-50 px-3 py-3 text-sm leading-6 text-red-900" role="alert">{copy.invalidHandoff}</p>}
          {errorMessage && <p className="mt-5 rounded-md border border-red-200 bg-red-50 px-3 py-3 text-sm leading-6 text-red-900" role="alert" data-testid="signup-error">{errorMessage}</p>}
          {showBetaGate && !inviteInvalid && (
            <div className="mt-6 rounded-xl border border-[#F4CBB8] bg-[#FFF6F1] p-4" data-testid="beta-access-gate">
              <h2 className="font-semibold">{copy.betaAccessUnavailable}</h2>
              <p className="mt-1 text-sm leading-6 text-[#5F574F]">{copy.betaAccessExplanation} {copy.betaEmailHint}</p>
              <form action="/api/auth/check-beta-access" method="post" className="mt-4 grid gap-3">
                <input type="hidden" name="lang" value={locale} />
                <input type="hidden" name="invite" value={inviteHandoff ? params.invite : ""} />
                <label className="grid gap-2 text-sm font-medium">
                  {copy.email}
                  <input name="email" type="email" required defaultValue={email} readOnly={Boolean(invitation)} className="min-h-11 rounded-md border border-[#D4CFC8] bg-white px-3 text-sm outline-none focus:border-[#FF6B35] read-only:bg-[#F2F0ED]" />
                </label>
                <details className="rounded-md border border-[#E8E4DF] bg-white px-3 py-2 text-sm">
                  <summary className="cursor-pointer font-semibold text-[#8A3518]">{copy.betaCodeOptional}</summary>
                  <label className="mt-3 grid gap-2 font-medium">
                    {copy.betaCodeOptional}
                    <input name="inviteCode" type="text" autoComplete="off" className="min-h-11 rounded-md border border-[#D4CFC8] bg-white px-3 text-sm" />
                    <span className="text-xs font-normal text-[#666666]">{copy.betaCodeHint}</span>
                  </label>
                </details>
                <button type="submit" className="min-h-11 rounded-md bg-[#B64A1F] px-4 py-2 text-sm font-semibold text-white hover:bg-[#8A3518]">{copy.checkBetaAccess}</button>
              </form>
            </div>
          )}
          {signupForm}
          <p className="mt-5 text-center text-sm text-[#666666]">
            {copy.alreadyRegistered} {" "}
            <Link href={loginHref} className="font-semibold text-[#8A3518] hover:text-[#FF6B35]">{copy.signIn}</Link>
          </p>
        </section>
        <aside className="hidden rounded-2xl border border-[#E8E4DF] bg-[#FCFBFA] p-6 lg:block">
          <p className="text-sm font-semibold text-[#1A1A1A]">{copy.personalWorkspace}</p>
          <p className="mt-2 text-sm leading-6 text-[#5F574F]">{invitation ? copy.invitationPending : copy.accountSubtitle}</p>
        </aside>
      </div>
    </main>
  );
}
