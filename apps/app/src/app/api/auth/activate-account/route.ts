import { NextResponse } from "next/server";
import { ACTIVATION_LINK_INVALID_ERROR, SIGNUP_CONSENT_FIELD, SIGNUP_CONSENT_REQUIRED_ERROR } from "../../../../lib/auth-copy";
import { activateWaitlistAccount } from "../../../../lib/db";
import { appRedirectUrl } from "../../../../lib/deployment";
import { hashPassword } from "../../../../lib/passwordAuth";
import { serializeAuthParams } from "../../../../lib/invite-intent";
import { assertRateLimit, assertSameOrigin, RateLimitError, readUrlEncodedForm, RequestSecurityError } from "../../../../lib/request-security";

/**
 * Redeems the activation link of a prepared waitlist account (#105). The link only opens the form
 * on /activate; this POST is what activates: it confirms the address (the link proves it), sets the
 * password and requires the consent to privacy policy and terms, like the signup form.
 */
export async function POST(request: Request) {
  let token = "";
  let lang = "de";

  try {
    assertSameOrigin(request);
    const form = await readUrlEncodedForm(request);
    token = String(form.get("token") || "");
    lang = form.get("lang") === "en" ? "en" : "de";
    await assertRateLimit(request, { action: "waitlist-activation", limit: 10, windowMs: 60 * 60 * 1000 });
    // Consent and password are checked before the single-use token is touched, so a typo does not burn the link.
    if (form.get(SIGNUP_CONSENT_FIELD) !== "1") throw new Error(SIGNUP_CONSENT_REQUIRED_ERROR);
    const passwordHash = hashPassword(String(form.get("password") || ""));
    const activated = token ? await activateWaitlistAccount({ token, passwordHash }) : null;
    if (!activated) throw new Error(ACTIVATION_LINK_INVALID_ERROR);

    const params = new URLSearchParams({ verified: "1", lang });
    return NextResponse.redirect(appRedirectUrl(`/login?${serializeAuthParams(params)}`, request.url), 303);
  } catch (err) {
    if (err instanceof RequestSecurityError) return NextResponse.json({ error: err.message }, { status: err.status });
    const params = new URLSearchParams({ token, error: err instanceof Error ? err.message : ACTIVATION_LINK_INVALID_ERROR, lang });
    const response = NextResponse.redirect(appRedirectUrl(`/activate?${serializeAuthParams(params)}`, request.url), 303);
    if (err instanceof RateLimitError) response.headers.set("Retry-After", String(err.retryAfterSeconds));
    return response;
  }
}
