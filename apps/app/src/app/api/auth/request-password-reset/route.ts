import { NextResponse } from "next/server";
import { safeNextPath, validateLoginEmail } from "../../../../lib/auth";
import { createAuthToken, findPasswordUserByEmail } from "../../../../lib/db";
import { appRedirectUrl } from "../../../../lib/deployment";
import { sendPasswordResetEmail } from "../../../../lib/email";
import { appendAuthParams, parseWorkspaceInviteHandoff, serializeAuthParams } from "../../../../lib/invite-intent";
import { assertRateLimit, assertSameOrigin, RateLimitError, readUrlEncodedForm, RequestSecurityError } from "../../../../lib/request-security";

export async function POST(request: Request) {
  let next = "/login";
  let invite = "";
  let lang = "de";

  try {
    assertSameOrigin(request);
    const form = await readUrlEncodedForm(request);
    next = safeNextPath(form.get("next"), "/login");
    invite = String(form.get("invite") || "");
    lang = form.get("lang") === "en" ? "en" : "de";
    if (invite && !parseWorkspaceInviteHandoff(invite)) throw new Error("Dieser Einladungsübergang ist ungültig oder abgelaufen.");
    const email = validateLoginEmail(String(form.get("email") || ""));
    await assertRateLimit(request, { action: "password-reset-request", identifier: email, limit: 5, windowMs: 60 * 60 * 1000 });
    const user = await findPasswordUserByEmail(email);

    if (user) {
      const reset = await createAuthToken({
        userId: user.id,
        email: user.email,
        purpose: "password_reset",
        ttlMinutes: 60,
      });
      if (reset) {
        await sendPasswordResetEmail(user.email, reset.token, { invite: invite || undefined, lang: lang as "de" | "en" });
      }
    }

    return NextResponse.redirect(appRedirectUrl(appendAuthParams(next, { reset: "requested", invite: invite || undefined, lang }), request.url), 303);
  } catch (err) {
    if (err instanceof RequestSecurityError) return NextResponse.json({ error: err.message }, { status: err.status });
    const params = new URLSearchParams({ error: err instanceof Error ? err.message : "Passwort-Reset fehlgeschlagen.", lang });
    if (invite) params.set("invite", invite);
    const response = NextResponse.redirect(appRedirectUrl(`/forgot-password?${serializeAuthParams(params)}`, request.url), 303);
    if (err instanceof RateLimitError) response.headers.set("Retry-After", String(err.retryAfterSeconds));
    return response;
  }
}
