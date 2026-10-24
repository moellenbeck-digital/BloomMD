import { NextResponse } from "next/server";
import { consumeAuthToken, markEmailVerified } from "../../../../lib/db";
import { appRedirectUrl } from "../../../../lib/deployment";
import { parseWorkspaceInviteHandoff } from "../../../../lib/invite-intent";
import { assertRateLimit, RateLimitError } from "../../../../lib/request-security";

export async function GET(request: Request) {
  try {
    await assertRateLimit(request, { action: "email-verification", limit: 20, windowMs: 60 * 60 * 1000 });
    const url = new URL(request.url);
    const token = url.searchParams.get("token") ?? "";
    const invite = url.searchParams.get("invite") ?? "";
    const lang = url.searchParams.get("lang") === "en" ? "en" : "de";
    if (invite && !parseWorkspaceInviteHandoff(invite)) {
      return NextResponse.redirect(appRedirectUrl(`/login?error=${encodeURIComponent("Dieser Einladungsübergang ist ungültig oder abgelaufen.")}&lang=${lang}`, request.url), 303);
    }

    const consumed = await consumeAuthToken({ token, purpose: "email_verification" });
    if (!consumed) {
      const params = new URLSearchParams({ error: "Der Bestätigungslink ist ungültig oder abgelaufen.", lang });
      if (invite) params.set("invite", invite);
      return NextResponse.redirect(appRedirectUrl(`/login?${params.toString()}`, request.url), 303);
    }

    await markEmailVerified(consumed.userId);
    const params = new URLSearchParams({ verified: "1", lang });
    if (invite) params.set("invite", invite);
    return NextResponse.redirect(appRedirectUrl(`/login?${params.toString()}`, request.url), 303);
  } catch (error) {
    if (error instanceof RateLimitError) {
      return NextResponse.json(
        { error: error.message },
        { status: 429, headers: { "Retry-After": String(error.retryAfterSeconds), "Cache-Control": "no-store" } },
      );
    }
    throw error;
  }
}
