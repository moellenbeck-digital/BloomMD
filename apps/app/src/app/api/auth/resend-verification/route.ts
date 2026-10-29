import { NextResponse } from "next/server";
import { validateLoginEmail } from "../../../../lib/auth";
import { createAuthToken, findPasswordUserByEmail } from "../../../../lib/db";
import { appRedirectUrl } from "../../../../lib/deployment";
import { MAIL_UNAVAILABLE_ERROR, VERIFICATION_NOT_SENT_ERROR } from "../../../../lib/auth-copy";
import { sendVerificationEmail } from "../../../../lib/email";
import { assertAccountMailBudget, MailBudgetError } from "../../../../lib/mail-budget";
import { parseWorkspaceInviteHandoff, serializeAuthParams } from "../../../../lib/invite-intent";
import { ACCOUNT_MAIL_RATE_LIMIT, assertRateLimit, assertSameOrigin, RateLimitError, readUrlEncodedForm, RequestSecurityError } from "../../../../lib/request-security";

export async function POST(request: Request) {
  let invite = "";
  let lang = "de";
  try {
    assertSameOrigin(request);
    const form = await readUrlEncodedForm(request);
    invite = String(form.get("invite") || "");
    lang = form.get("lang") === "en" ? "en" : "de";
    if (invite && !parseWorkspaceInviteHandoff(invite)) throw new Error("Dieser Einladungsübergang ist ungültig oder abgelaufen.");
    const email = validateLoginEmail(String(form.get("email") || ""));
    await assertRateLimit(request, {
      action: "resend-verification",
      identifier: email,
      limit: ACCOUNT_MAIL_RATE_LIMIT.resendVerificationPerAccount,
      sourceLimit: ACCOUNT_MAIL_RATE_LIMIT.perSource,
      windowMs: ACCOUNT_MAIL_RATE_LIMIT.windowMs,
    });
    const user = await findPasswordUserByEmail(email);
    if (user && !user.emailVerifiedAt) {
      await assertAccountMailBudget("verification");
      const verification = await createAuthToken({
        userId: user.id,
        email: user.email,
        purpose: "email_verification",
        ttlMinutes: 60 * 24,
      });
      const delivery = verification
        ? await sendVerificationEmail(user.email, verification.token, { invite: invite || undefined, lang: lang as "de" | "en" })
        : { sent: false as const };
      if (!delivery.sent) throw new Error(VERIFICATION_NOT_SENT_ERROR);
    }
    const params = new URLSearchParams({ verification: "sent", lang });
    if (invite) params.set("invite", invite);
    params.set("email", email);
    return NextResponse.redirect(appRedirectUrl(`/login?${serializeAuthParams(params)}`, request.url), 303);
  } catch (error) {
    if (error instanceof RequestSecurityError) return NextResponse.json({ error: error.message }, { status: error.status });
    const params = new URLSearchParams({ error: error instanceof MailBudgetError ? MAIL_UNAVAILABLE_ERROR : error instanceof Error ? error.message : "Bestätigungs-E-Mail konnte nicht gesendet werden.", lang });
    if (invite) params.set("invite", invite);
    const response = NextResponse.redirect(appRedirectUrl(`/login?${serializeAuthParams(params)}`, request.url), 303);
    if (error instanceof RateLimitError || error instanceof MailBudgetError) response.headers.set("Retry-After", String(error.retryAfterSeconds));
    return response;
  }
}
