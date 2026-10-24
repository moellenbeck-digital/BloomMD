import { NextResponse } from "next/server";
import { consumeAuthToken, revokeAllSessionRecords, updatePasswordForEmail } from "../../../../lib/db";
import { appRedirectUrl } from "../../../../lib/deployment";
import { hashPassword } from "../../../../lib/passwordAuth";
import { parseWorkspaceInviteHandoff, serializeAuthParams } from "../../../../lib/invite-intent";
import { assertRateLimit, assertSameOrigin, RateLimitError, readUrlEncodedForm, RequestSecurityError } from "../../../../lib/request-security";

export async function POST(request: Request) {
  let token = "";
  let invite = "";
  let lang = "de";

  try {
    assertSameOrigin(request);
    const form = await readUrlEncodedForm(request);
    token = String(form.get("token") || "");
    invite = String(form.get("invite") || "");
    lang = form.get("lang") === "en" ? "en" : "de";
    if (invite && !parseWorkspaceInviteHandoff(invite)) throw new Error("Dieser Einladungsübergang ist ungültig oder abgelaufen.");
    const password = String(form.get("password") || "");
    await assertRateLimit(request, { action: "password-reset", limit: 10, windowMs: 60 * 60 * 1000 });
    const passwordHash = hashPassword(password);
    const consumed = await consumeAuthToken({ token, purpose: "password_reset" });
    if (!consumed) {
      throw new Error("Der Reset-Link ist ungültig oder abgelaufen.");
    }

    const updated = await updatePasswordForEmail({
      email: consumed.email,
      passwordHash,
    });
    if (!updated) {
      throw new Error("Passwort konnte nicht aktualisiert werden.");
    }
    if (consumed.userId) await revokeAllSessionRecords(consumed.userId);

    const params = new URLSearchParams({ reset: "complete", lang });
    if (invite) params.set("invite", invite);
    return NextResponse.redirect(appRedirectUrl(`/login?${serializeAuthParams(params)}`, request.url), 303);
  } catch (err) {
    if (err instanceof RequestSecurityError) return NextResponse.json({ error: err.message }, { status: err.status });
    const params = new URLSearchParams({ token, error: err instanceof Error ? err.message : "Passwort konnte nicht zurückgesetzt werden.", lang });
    if (invite) params.set("invite", invite);
    const response = NextResponse.redirect(appRedirectUrl(`/reset-password?${serializeAuthParams(params)}`, request.url), 303);
    if (err instanceof RateLimitError) response.headers.set("Retry-After", String(err.retryAfterSeconds));
    return response;
  }
}
