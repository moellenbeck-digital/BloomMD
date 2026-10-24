import { NextResponse } from "next/server";
import { createSessionToken, isE2EAuthBypassEnabled, safeNextPath, sessionCookieName, shouldUseSecureCookies, validateLoginEmail } from "../../../../lib/auth";
import { assertBetaSignupAllowedForRequest } from "../../../../lib/betaAccess";
import { acceptBetaInvite, createAuthToken, createPasswordUser, findPasswordUserByEmail, getWorkspaceInvitationPreviewById } from "../../../../lib/db";
import { appRedirectUrl } from "../../../../lib/deployment";
import { sendVerificationEmail } from "../../../../lib/email";
import { hashPassword } from "../../../../lib/passwordAuth";
import { appendAuthParams, parseWorkspaceInviteHandoff, serializeAuthParams } from "../../../../lib/invite-intent";
import { assertHumanFormSignal, assertRateLimit, assertSameOrigin, FormSpamError, RateLimitError, readUrlEncodedForm, RequestSecurityError } from "../../../../lib/request-security";

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
    await assertRateLimit(request, { action: "signup", identifier: email, limit: 5, windowMs: 60 * 60 * 1000 });
    // Closed beta: the cloud app is invitation only while public demo/templates stay open.
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
    const user = existing ?? await createPasswordUser({ email, name, passwordHash });
    await acceptBetaInvite(user.email);
    if (!user.emailVerifiedAt) {
      const verification = await createAuthToken({
        userId: user.id,
        email: user.email,
        purpose: "email_verification",
        ttlMinutes: 60 * 24,
      });
      if (verification) {
        await sendVerificationEmail(user.email, verification.token, { invite: invite || undefined, lang: lang as "de" | "en" });
      }
    }
    const loginParams = new URLSearchParams({ next, verification: "sent", lang });
    if (invite) loginParams.set("invite", invite);
    loginParams.set("email", email);
    return NextResponse.redirect(appRedirectUrl(`/login?${serializeAuthParams(loginParams)}`, request.url), 303);
  } catch (err) {
    if (err instanceof RequestSecurityError) return NextResponse.json({ error: err.message }, { status: err.status });
    const params = new URLSearchParams({ next, lang });
    if (emailForRedirect) params.set("email", emailForRedirect);
    if (invite) params.set("invite", invite);
    params.set("error", err instanceof FormSpamError ? "Bitte lade die Seite neu und versuche es erneut." : err instanceof Error ? err.message : "Registrierung fehlgeschlagen.");
    const response = NextResponse.redirect(appRedirectUrl(`/signup?${serializeAuthParams(params)}`, request.url), 303);
    if (err instanceof RateLimitError) response.headers.set("Retry-After", String(err.retryAfterSeconds));
    return response;
  }
}
