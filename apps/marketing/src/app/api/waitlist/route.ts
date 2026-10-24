import { NextResponse } from "next/server";
import { InvalidEmailError, validateEmailAddress } from "../../../lib/email-validation";
import { sendWaitlistConfirmationEmail } from "../../../lib/email";
import { assertHumanFormSignal, assertRateLimit, assertSameOrigin, FormSpamError, RateLimitError, readUrlEncodedForm, RequestSecurityError } from "../../../lib/request-security";
import { addWaitlistSignup, isWaitlistConfigured } from "../../../lib/waitlist-db";
import { getMarketingLocale } from "../../../lib/locale";
import type { MarketingLocale } from "../../../lib/locale";

export const dynamic = "force-dynamic";

/**
 * Waitlist signup.
 *
 * Always answers the same way, whether the address is new, already pending or already confirmed.
 * A form that says "you are already on the list" turns the waitlist into a way to check who signed
 * up — the same reason the login says nothing about whether an account exists.
 */
export async function POST(request: Request) {
  let locale: MarketingLocale = "de";
  let sameAnswer = NextResponse.json(
    { status: "pending", message: "Bitte bestätige die Adresse über den Link, den wir dir geschickt haben." },
    { status: 202, headers: { "Cache-Control": "no-store" } },
  );

  try {
    assertSameOrigin(request);
    const form = await readUrlEncodedForm(request);
    assertHumanFormSignal(form);
    locale = getMarketingLocale(String(form.get("lang") || "de"));
    const email = validateEmailAddress(String(form.get("email") || ""));
    const source = String(form.get("source") || "").slice(0, 64) || null;
    sameAnswer = NextResponse.json(
      { status: "pending", message: locale === "en" ? "Please confirm your address using the link we sent you." : "Bitte bestätige die Adresse über den Link, den wir dir geschickt haben." },
      { status: 202, headers: { "Cache-Control": "no-store" } },
    );

    await assertRateLimit(request, { action: "waitlist", identifier: email, limit: 5, windowMs: 60 * 60 * 1000 });

    if (!isWaitlistConfigured()) {
      return NextResponse.json({ error: locale === "en" ? "The waitlist is not configured here." : "Die Warteliste ist hier nicht eingerichtet." }, { status: 503 });
    }

    const result = await addWaitlistSignup(email, source);
    if (result.created && result.token) {
      await sendWaitlistConfirmationEmail(email, result.token, locale);
    }
    return sameAnswer;
  } catch (error) {
    if (error instanceof FormSpamError) {
      return sameAnswer;
    }
    if (error instanceof RateLimitError) {
      return NextResponse.json({ error: locale === "en" ? "Too many attempts. Please try again later." : "Zu viele Versuche. Bitte später erneut." }, { status: 429 });
    }
    if (error instanceof RequestSecurityError) {
      return NextResponse.json({ error: locale === "en" ? "The request could not be completed. Please reload and try again." : error.message }, { status: error.status });
    }
    // A malformed address is the one case worth naming: the user can fix it. Matched by type, not
    // by message text — wording changes for reasons that have nothing to do with control flow.
    if (error instanceof InvalidEmailError) {
      return NextResponse.json({ error: locale === "en" ? "Enter a valid email address." : error.message }, { status: 400 });
    }
    console.error("[BloomMD] Waitlist signup failed:", error instanceof Error ? error.name : "unknown");
      return NextResponse.json({ error: locale === "en" ? "Signup failed." : "Eintrag fehlgeschlagen." }, { status: 500 });
  }
}
