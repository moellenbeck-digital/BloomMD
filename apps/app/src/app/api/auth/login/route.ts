import { NextResponse } from "next/server";
import { issueSession, isE2EAuthBypassEnabled, safeNextPath, sessionCookieName, shouldUseSecureCookies, validateLoginEmail } from "../../../../lib/auth";
import { findPasswordUserByEmail } from "../../../../lib/db";
import { appRedirectUrl } from "../../../../lib/deployment";
import { appendAuthParams, parseWorkspaceInviteHandoff, serializeAuthParams } from "../../../../lib/invite-intent";
import { verifyPasswordOrDummy } from "../../../../lib/passwordAuth";
import { assertRateLimit, assertSameOrigin, RateLimitError, readUrlEncodedForm, RequestSecurityError } from "../../../../lib/request-security";

export async function POST(request: Request) {
  let next = "/app";
  let invite = "";
  let lang = "de";

  try {
    assertSameOrigin(request);
    const form = await readUrlEncodedForm(request);
    next = safeNextPath(form.get("next"));
    invite = String(form.get("invite") || "");
    lang = form.get("lang") === "en" ? "en" : "de";
    const email = validateLoginEmail(String(form.get("email") || ""));
    const password = String(form.get("password") || "");
    if (!password) {
      throw new Error("Bitte gib dein Passwort ein.");
    }
    await assertRateLimit(request, { action: "login", identifier: email, limit: 10, windowMs: 15 * 60 * 1000 });
    if (isE2EAuthBypassEnabled()) {
      const token = await issueSession({
        provider: "password",
        userId: email,
        email,
      });
      const continuation = invite
        ? getInviteContinuation(invite, lang)
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
    const passwordUser = await findPasswordUserByEmail(email);
    const passwordValid = verifyPasswordOrDummy(password, passwordUser?.passwordHash);

    if (!passwordUser || !passwordValid) {
      throw new Error("E-Mail oder Passwort ist falsch.");
    }
    if (!passwordUser.emailVerifiedAt) {
      throw new Error("Bitte bestätige zuerst deine E-Mail-Adresse.");
    }

    const token = await issueSession({
      provider: "password",
      userId: passwordUser.id,
      email,
      name: passwordUser.name ?? undefined,
    });
    const continuation = invite
      ? getInviteContinuation(invite, lang)
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
  } catch (err) {
    if (err instanceof RequestSecurityError) return NextResponse.json({ error: err.message }, { status: err.status });
    const params = new URLSearchParams({ next, lang });
    if (invite) params.set("invite", invite);
    params.set("error", err instanceof Error ? err.message : "Login fehlgeschlagen.");
    const response = NextResponse.redirect(appRedirectUrl(`/login?${serializeAuthParams(params)}`, request.url), 303);
    if (err instanceof RateLimitError) response.headers.set("Retry-After", String(err.retryAfterSeconds));
    return response;
  }
}

function getInviteContinuation(invite: string, lang: string) {
  if (!parseWorkspaceInviteHandoff(invite)) throw new Error("Dieser Einladungsübergang ist ungültig oder abgelaufen.");
  return appendAuthParams("/invite/confirm", { invite, lang });
}
