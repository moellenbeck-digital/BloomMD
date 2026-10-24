import { NextResponse } from "next/server";
import { getSession } from "../../../../lib/auth";
import { createMobileAuthCode, normalizeUuid } from "../../../../lib/db";
import { isValidChallenge, isValidState, mobileRedirectUrl, normalizeDeviceName } from "../../../../lib/mobile-auth";
import { assertRateLimit, assertSameOrigin, RateLimitError, readJsonBody, RequestSecurityError } from "../../../../lib/request-security";

/**
 * The signed-in user allows the BloomMD app to connect (consent page `/auth/mobile`). Returns the
 * `bloommd://auth?code=…&state=…` address the browser opens to hand the one-time code to the app.
 */
export async function POST(request: Request) {
  const session = await getSession();
  const userId = normalizeUuid(session?.userId);
  if (!session || !userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    assertSameOrigin(request);
    await assertRateLimit(request, { action: "mobile-authorize", identifier: session.email, limit: 20, windowMs: 60 * 60 * 1000 });
    const body = await readJsonBody<{ challenge?: unknown; state?: unknown; device?: unknown } | null>(request, 4 * 1024);
    const deviceName = normalizeDeviceName(body?.device);
    if (!body || !isValidChallenge(body.challenge) || !isValidState(body.state) || !deviceName) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }
    const { code, expiresAt } = await createMobileAuthCode({ userId, challenge: body.challenge, state: body.state, deviceName });
    return NextResponse.json({ redirectUrl: mobileRedirectUrl({ code, state: body.state }), expiresAt });
  } catch (error) {
    if (error instanceof RequestSecurityError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof RateLimitError) {
      return NextResponse.json({ error: error.message }, { status: 429, headers: { "Retry-After": String(error.retryAfterSeconds) } });
    }
    console.error("[BloomMD] App sign-in could not be authorized:", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
