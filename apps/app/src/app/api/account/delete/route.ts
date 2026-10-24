import { NextResponse } from "next/server";
import { getSession, sessionCookieName, shouldUseSecureCookies } from "../../../../lib/auth";
import { cancelStripeSubscriptions } from "../../../../lib/billing";
import { deleteAccountData, findPasswordUserByEmail, getMarketAccountByEmail, normalizeUuid } from "../../../../lib/db";
import { verifyPassword } from "../../../../lib/passwordAuth";
import { assertRateLimit, assertSameOrigin, RateLimitError, readUrlEncodedForm, RequestSecurityError } from "../../../../lib/request-security";

const cancellableStatuses = new Set(["active", "trialing", "past_due", "unpaid", "paused"]);

export async function POST(request: Request) {
  const session = await getSession();
  const userId = normalizeUuid(session?.userId);
  if (!session || !userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    assertSameOrigin(request);
    const form = await readUrlEncodedForm(request);
    await assertRateLimit(request, { action: "account-delete", identifier: session.email, limit: 5, windowMs: 60 * 60 * 1000 });
    const confirmation = String(form.get("confirmation") || "").trim().toLowerCase();
    const password = String(form.get("password") || "");
    const user = await findPasswordUserByEmail(session.email);
    if (confirmation !== session.email.toLowerCase() || !user?.passwordHash || !verifyPassword(password, user.passwordHash)) {
      throw new Error("E-Mail-Bestätigung oder Passwort ist nicht korrekt.");
    }

    const account = await getMarketAccountByEmail(session.email);
    const subscriptions = account?.subscriptions
      .filter((item) => cancellableStatuses.has(item.status) && item.stripeSubscriptionId)
      .map((item) => item.stripeSubscriptionId as string) ?? [];
    await cancelStripeSubscriptions(subscriptions);
    await deleteAccountData(userId);

    const response = NextResponse.redirect(new URL("/?account=deleted", request.url), 303);
    response.cookies.set(sessionCookieName(), "", {
      httpOnly: true,
      sameSite: "lax",
      secure: shouldUseSecureCookies(request.url),
      path: "/",
      maxAge: 0,
    });
    return response;
  } catch (error) {
    if (error instanceof RequestSecurityError) return NextResponse.json({ error: error.message }, { status: error.status });
    const message = encodeURIComponent(error instanceof Error ? error.message : "Account konnte nicht gelöscht werden.");
    const response = NextResponse.redirect(new URL(`/account?accountError=${message}`, request.url), 303);
    if (error instanceof RateLimitError) response.headers.set("Retry-After", String(error.retryAfterSeconds));
    return response;
  }
}
