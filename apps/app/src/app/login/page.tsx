import Link from "next/link";
import { safeNextPath } from "../../lib/auth";
import { getBuildInfo } from "../../lib/build-info";
import { getWorkspaceInvitationPreviewById } from "../../lib/db";
import { authCopy, formatAuthDate, getAuthLocale, languageLabel, localizeAuthError, otherAuthLocale, roleLabel } from "../../lib/auth-copy";
import { appendAuthParams, parseWorkspaceInviteHandoff } from "../../lib/invite-intent";

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

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; reset?: string; verified?: string; verification?: string; email?: string; invite?: string; lang?: string }>;
}) {
  const params = await searchParams;
  const locale = getAuthLocale(params.lang);
  const copy = authCopy[locale];
  const next = safeNextPath(params.next);
  const inviteHandoff = parseWorkspaceInviteHandoff(params.invite);
  const invitation = inviteHandoff ? await getWorkspaceInvitationPreviewById(inviteHandoff.invitationId) : null;
  const inviteInvalid = Boolean(params.invite) && (!inviteHandoff || !invitation);
  const email = invitation?.email ?? String(params.email || "");
  const buildInfo = getBuildInfo("app");
  const languageHref = appendAuthParams("/login", {
    next,
    email: email || null,
    invite: params.invite,
    lang: otherAuthLocale(locale),
  });
  const signupHref = appendAuthParams("/signup", { next, email: email || null, invite: inviteHandoff ? params.invite : null, lang: locale });
  const forgotHref = appendAuthParams("/forgot-password", { next: "/login", invite: inviteHandoff ? params.invite : null, lang: locale });
  const errorMessage = localizeAuthError(decodeMessage(params.error), locale);

  return (
    <main className="min-h-screen bg-[#FAFAF7] px-4 py-6 text-[#1A1A1A] sm:px-8 sm:py-10">
      <div className="mx-auto flex max-w-5xl items-center justify-between">
        <Link href={appendAuthParams("/", { lang: locale })} className="text-lg font-semibold tracking-tight">BloomMD</Link>
        <Link href={languageHref} className="rounded-md border border-[#D4CFC8] bg-white px-3 py-2 text-sm font-semibold text-[#5F574F] hover:bg-[#F2F0ED]" aria-label={`${copy.language}: ${languageLabel(otherAuthLocale(locale))}`}>
          {languageLabel(otherAuthLocale(locale))}
        </Link>
      </div>

      <div className="mx-auto mt-8 grid max-w-5xl gap-6 lg:mt-14 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,28rem)] lg:items-start">
        <section className="rounded-2xl border border-[#E8E4DF] bg-white p-6 shadow-sm sm:p-8">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#B64A1F]">{invitation ? copy.invitation : copy.authStep}</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">{invitation ? copy.continueAfterSignIn(invitation.workspaceName, roleLabel(invitation.role, locale)) : copy.signIn}</h1>
          <p className="mt-4 text-base leading-7 text-[#5F574F]">{invitation ? copy.invitationPending : copy.signInSubtitle}</p>

          {invitation && (
            <div className="mt-6 rounded-xl border border-[#F4CBB8] bg-[#FFF6F1] p-4 text-sm leading-6" data-testid="login-invite-context">
              <p className="font-semibold text-[#1A1A1A]">{invitation.workspaceName}</p>
              <p className="mt-1 text-[#5F574F]">{copy.invitationRole}: {roleLabel(invitation.role, locale)}</p>
              <p className="text-[#5F574F]">{copy.invitedEmail(invitation.email)}</p>
              <p className="text-[#5F574F]">{copy.expires(formatAuthDate(invitation.expiresAt, locale))}</p>
            </div>
          )}
          {inviteInvalid && <p className="mt-5 rounded-md border border-red-200 bg-red-50 px-3 py-3 text-sm leading-6 text-red-900" role="alert">{copy.invalidHandoff}</p>}
          {errorMessage && <p className="mt-5 rounded-md border border-red-200 bg-red-50 px-3 py-3 text-sm leading-6 text-red-900" role="alert" data-testid="login-error">{errorMessage}</p>}
          {params.reset === "requested" && <p className="mt-5 rounded-md border border-[#D8E7D3] bg-[#F4FAF1] px-3 py-2 text-sm text-[#467642]" role="status">{locale === "en" ? "If an account exists, a reset link was sent." : "Wenn ein Account existiert, wurde ein Reset-Link verschickt."}</p>}
          {params.reset === "complete" && <p className="mt-5 rounded-md border border-[#D8E7D3] bg-[#F4FAF1] px-3 py-2 text-sm text-[#467642]" role="status">{locale === "en" ? "Your password was updated. You can sign in now." : "Dein Passwort wurde aktualisiert. Du kannst dich jetzt anmelden."}</p>}
          {params.verified === "1" && <p className="mt-5 rounded-md border border-[#D8E7D3] bg-[#F4FAF1] px-3 py-2 text-sm text-[#467642]" role="status">{locale === "en" ? "Your email address was confirmed." : "Deine E-Mail-Adresse wurde bestätigt."}</p>}
          {params.verification === "sent" && <p className="mt-5 rounded-md border border-[#D8E7D3] bg-[#F4FAF1] px-3 py-2 text-sm leading-6 text-[#467642]" role="status">{locale === "en" ? "A new confirmation email was sent if the address was not confirmed yet." : "Falls die Adresse noch nicht bestätigt war, wurde eine neue Bestätigungs-E-Mail gesendet."}</p>}

          <form action="/api/auth/login" method="post" className="mt-6 grid gap-4">
            <input type="hidden" name="next" value={next} />
            <input type="hidden" name="invite" value={inviteHandoff ? params.invite : ""} />
            <input type="hidden" name="lang" value={locale} />
            <label className="grid gap-2 text-sm font-medium">
              {copy.email}
              <input name="email" type="email" required defaultValue={email} autoComplete="email" className="min-h-11 rounded-md border border-[#D4CFC8] bg-white px-3 text-sm outline-none focus:border-[#FF6B35] focus:ring-2 focus:ring-[#FF6B35]/20" placeholder="max@example.com" />
            </label>
            <label className="grid gap-2 text-sm font-medium">
              {copy.password}
              <input name="password" type="password" required autoComplete="current-password" className="min-h-11 rounded-md border border-[#D4CFC8] bg-white px-3 text-sm outline-none focus:border-[#FF6B35] focus:ring-2 focus:ring-[#FF6B35]/20" placeholder={copy.passwordHint} />
            </label>
            <button type="submit" className="min-h-11 rounded-md bg-[#B64A1F] px-4 py-2 text-sm font-semibold text-white hover:bg-[#8A3518]">{copy.signIn}</button>
          </form>

          <div className="mt-5 flex flex-col gap-2 text-center text-sm text-[#666666] sm:flex-row sm:justify-center sm:gap-4">
            <Link href={forgotHref} className="font-semibold text-[#B64A1F] hover:text-[#FF6B35]">{copy.passwordForgotten}</Link>
            <span className="hidden sm:inline" aria-hidden="true">·</span>
            <Link href={signupHref} className="font-semibold text-[#B64A1F] hover:text-[#FF6B35]">{copy.noAccount} {copy.createAccount}</Link>
          </div>

          <details className="mt-5 rounded-md border border-[#E8E4DF] bg-[#FCFBFA] px-3 py-2 text-left">
            <summary className="min-h-11 cursor-pointer py-2 font-semibold text-[#B64A1F]">{copy.resendVerification}</summary>
            <form action="/api/auth/resend-verification" method="post" className="mt-3 grid gap-2">
              <input type="hidden" name="invite" value={inviteHandoff ? params.invite : ""} />
              <input type="hidden" name="lang" value={locale} />
              <label className="grid gap-1 text-xs font-medium">
                {copy.resendVerification}
                <input name="email" aria-label={locale === "de" ? "Bestätigungs-E-Mail" : "Confirmation email"} type="email" required defaultValue={email} autoComplete="email" className="min-h-10 rounded-md border border-[#D4CFC8] bg-white px-3 text-sm outline-none focus:border-[#FF6B35]" />
              </label>
              <button type="submit" className="min-h-10 rounded-md border border-[#D4CFC8] bg-white px-3 text-sm font-semibold hover:bg-[#F2F0ED]">{copy.resendVerification}</button>
            </form>
          </details>
        </section>

        <aside className="hidden rounded-2xl border border-[#E8E4DF] bg-[#FCFBFA] p-6 lg:block">
          <p className="text-sm font-semibold text-[#1A1A1A]">{invitation ? copy.invitation : copy.signIn}</p>
          <p className="mt-2 text-sm leading-6 text-[#5F574F]">{invitation ? copy.continueAfterSignIn(invitation.workspaceName, roleLabel(invitation.role, locale)) : copy.signInSubtitle}</p>
        </aside>
      </div>
      <p className="mx-auto mt-5 max-w-5xl text-center font-mono text-xs text-[#5F574F]" data-testid="login-build-version">{buildInfo.displayVersion}</p>
    </main>
  );
}
