import { NextResponse } from "next/server";
import { createSessionToken, isE2EAuthBypassEnabled, safeNextPath, sessionCookieName, shouldUseSecureCookies, validateLoginEmail } from "../../../../lib/auth";
import { assertBetaSignupAllowedForRequest } from "../../../../lib/betaAccess";
import { acceptBetaInvite, createAuthToken, createPasswordUser, findPasswordUserByEmail, getWorkspaceInvitationPreviewById, updatePasswordForEmail } from "../../../../lib/db";
import { appRedirectUrl } from "../../../../lib/deployment";
import { SIGNUP_CONSENT_FIELD, SIGNUP_CONSENT_REQUIRED_ERROR, SIGNUP_UNAVAILABLE_ERROR, VERIFICATION_NOT_SENT_ERROR } from "../../../../lib/auth-copy";
import { sendVerificationEmail } from "../../../../lib/email";
import { assertAccountMailBudget, MailBudgetError } from "../../../../lib/mail-budget";
import { hashPassword } from "../../../../lib/passwordAuth";
import { appendAuthParams, parseWorkspaceInviteHandoff, serializeAuthParams } from "../../../../lib/invite-intent";
import { assertHumanFormSignal, assertRateLimit, assertSameOrigin, FormSpamError, RateLimitError, readUrlEncodedForm, RequestSecurityError, SIGNUP_RATE_LIMIT } from "../../../../lib/request-security";

export async function POST(request: Request) {
  let next = "/app";
  let emailForRedirect = "";
  let invite = "";
  let lang = "de";

  try {
    assertSameOrigin(request);
    const form = await readUrlEncodedForm(request);
    assertHumanFormSignal(form);
    next = safeNextPath(form.get("next"));
    invite = String(form.get("invite") || "");
    lang = form.get("lang") === "en" ? "en" : "de";
    const email = validateLoginEmail(String(form.get("email") || ""));
    emailForRedirect = email;
    const name = String(form.get("name") || "").trim() || null;
    const password = String(form.get("password") || "");
    const inviteHandoff = invite ? parseWorkspaceInviteHandoff(invite) : null;
    if (invite && !inviteHandoff) throw new Error("Dieser Einladungsübergang ist ungültig oder abgelaufen.");
    const invitation = inviteHandoff ? await getWorkspaceInvitationPreviewById(inviteHandoff.invitationId) : null;
    if (inviteHandoff && (!invitation || invitation.status !== "pending")) throw new Error("Diese Workspace-Einladung ist nicht mehr aktiv.");
    if (invitation && invitation.email.toLowerCase() !== email.toLowerCase()) {
      throw new Error(`Diese Einladung wurde an ${invitation.email} gesendet.`);
    }
    // Consent is enforced here, not only by the `required` checkbox: a direct POST must not skip it.
    if (form.get(SIGNUP_CONSENT_FIELD) !== "1") throw new Error(SIGNUP_CONSENT_REQUIRED_ERROR);
    await assertRateLimit(request, {
      action: "signup",
      identifier: email,
      limit: SIGNUP_RATE_LIMIT.perAccount,
      sourceLimit: SIGNUP_RATE_LIMIT.perSource,
      windowMs: SIGNUP_RATE_LIMIT.windowMs,
    });
    // Gate on: invitation only. Gate off (BLOOMMD_BETA_ACCESS != 1): open self-registration.
    await assertBetaSignupAllowedForRequest({ email, inviteCode: String(form.get("inviteCode") || "") });
    if (isE2EAuthBypassEnabled()) {
      const token = createSessionToken({
        provider: "password",
        userId: email,
        email,
        name: name ?? undefined,
        createdAt: Date.now(),
      });
      const continuation = invite
        ? appendAuthParams("/invite/confirm", { invite, lang })
        : next;
      const response = NextResponse.redirect(appRedirectUrl(continuation, request.url), 303);
      response.cookies.set(sessionCookieName(), token, {
        httpOnly: true,
        sameSite: "lax",
        secure: shouldUseSecureCookies(request.url),
        path: "/",
        maxAge: 60 * 60 * 24 * 30,
      });
      return response;
    }
    const passwordHash = hashPassword(password);
    const existing = await findPasswordUserByEmail(email);
    // Global mail cap (#169), checked before the account is created: when it is reached no mail
    // goes out, and no unconfirmed account is left behind that could never be confirmed.
    if (!existing?.emailVerifiedAt) await assertAccountMailBudget("verification");
    const user = existing ?? await createPasswordUser({ email, name, passwordHash });
    // With open registration anyone can register an address they do not own. If the account is
    // still unconfirmed, the latest signup wins, so a password set by someone else beforehand does
    // not survive the real owner's registration (account pre-hijacking). Confirmed accounts are
    // never touched; the password-reset flow is the only way to change those.
    if (existing && !existing.emailVerifiedAt) await updatePasswordForEmail({ email: existing.email, passwordHash });
    await acceptBetaInvite(user.email);
    let verificationFailed = false;
    if (!user.emailVerifiedAt) {
      const verification = await createAuthToken({
        userId: user.id,
        email: user.email,
        purpose: "email_verification",
        ttlMinutes: 60 * 24,
      });
      const delivery = verification
        ? await sendVerificationEmail(user.email, verification.token, { invite: invite || undefined, lang: lang as "de" | "en" })
        : { sent: false as const };
      verificationFailed = !delivery.sent;
    }
    // The account exists, but nobody can confirm it without the mail. Say so instead of
    // announcing a mail that was never sent; submitting the signup form again resends it.
    if (verificationFailed) throw new Error(VERIFICATION_NOT_SENT_ERROR);
    const loginParams = new URLSearchParams({ next, verification: "sent", lang });
    if (invite) loginParams.set("invite", invite);
    loginParams.set("email", email);
    return NextResponse.redirect(appRedirectUrl(`/login?${serializeAuthParams(loginParams)}`, request.url), 303);
  } catch (err) {
    if (err instanceof RequestSecurityError) return NextResponse.json({ error: err.message }, { status: err.status });
    const params = new URLSearchParams({ next, lang });
    if (emailForRedirect) params.set("email", emailForRedirect);
    if (invite) params.set("invite", invite);
    params.set("error", err instanceof FormSpamError ? "Bitte lade die Seite neu und versuche es erneut." : err instanceof MailBudgetError ? SIGNUP_UNAVAILABLE_ERROR : err instanceof Error ? err.message : "Registrierung fehlgeschlagen.");
    const response = NextResponse.redirect(appRedirectUrl(`/signup?${serializeAuthParams(params)}`, request.url), 303);
    if (err instanceof RateLimitError || err instanceof MailBudgetError) response.headers.set("Retry-After", String(err.retryAfterSeconds));
    return response;
  }
}
