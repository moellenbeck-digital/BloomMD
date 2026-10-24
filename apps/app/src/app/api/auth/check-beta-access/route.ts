import { NextResponse } from "next/server";
import { validateLoginEmail } from "../../../../lib/auth";
import { assertBetaSignupAllowedForRequest } from "../../../../lib/betaAccess";
import { appRedirectUrl } from "../../../../lib/deployment";
import { parseWorkspaceInviteHandoff, serializeAuthParams } from "../../../../lib/invite-intent";
import { assertRateLimit, RateLimitError, assertSameOrigin, readUrlEncodedForm, RequestSecurityError } from "../../../../lib/request-security";

export async function POST(request: Request) {
  let emailForRedirect = "";
  let lang = "de";
  let invite = "";
  try {
    assertSameOrigin(request);
    const form = await readUrlEncodedForm(request);
    const email = validateLoginEmail(String(form.get("email") || ""));
    emailForRedirect = email;
    lang = form.get("lang") === "en" ? "en" : "de";
    invite = String(form.get("invite") || "");
    if (invite && !parseWorkspaceInviteHandoff(invite)) throw new Error("Dieser Einladungsübergang ist ungültig oder abgelaufen.");
    await assertRateLimit(request, { action: "check-beta-access", identifier: email, limit: 8, windowMs: 60 * 60 * 1000 });
    await assertBetaSignupAllowedForRequest({ email, inviteCode: String(form.get("inviteCode") || "") });
    const params = new URLSearchParams({ email, access: "granted", lang });
    if (invite) params.set("invite", invite);
    return NextResponse.redirect(appRedirectUrl(`/signup?${serializeAuthParams(params)}`, request.url), 303);
  } catch (error) {
    if (error instanceof RequestSecurityError) return NextResponse.json({ error: error.message }, { status: error.status });
    const params = new URLSearchParams({ lang });
    if (emailForRedirect) params.set("email", emailForRedirect);
    if (invite) params.set("invite", invite);
    params.set("error", error instanceof Error ? error.message : "Beta access could not be verified.");
    const response = NextResponse.redirect(appRedirectUrl(`/signup?${serializeAuthParams(params)}`, request.url), 303);
    if (error instanceof RateLimitError) response.headers.set("Retry-After", String(error.retryAfterSeconds));
    return response;
  }
}
