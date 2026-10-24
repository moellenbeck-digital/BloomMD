import { NextResponse } from "next/server";
import { exchangeMobileAuthCode } from "../../../../lib/db";
import { isValidAuthCode, isValidState, isValidVerifier } from "../../../../lib/mobile-auth";
import { assertRateLimit, RateLimitError, readJsonBody, RequestSecurityError } from "../../../../lib/request-security";

/**
 * The app exchanges its one-time code for an access token (PKCE, no client secret). Called from
 * the app's WebView, i.e. cross-origin and without cookies; the code verifier is the proof.
 */
export async function POST(request: Request) {
  try {
    await assertRateLimit(request, { action: "mobile-token", limit: 20, windowMs: 15 * 60 * 1000 });
    const body = await readJsonBody<{ code?: unknown; verifier?: unknown; state?: unknown } | null>(request, 4 * 1024);
    if (!body || !isValidAuthCode(body.code) || !isValidVerifier(body.verifier) || !isValidState(body.state)) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }
    const signIn = await exchangeMobileAuthCode({ code: body.code, verifier: body.verifier, state: body.state });
    // One answer for unknown, expired, reused and wrongly verified codes: nothing to learn from it.
    if (!signIn) return NextResponse.json({ error: "invalid_grant" }, { status: 400 });
    return NextResponse.json({
      token: signIn.token,
      tokenId: signIn.tokenId,
      expiresAt: signIn.expiresAt,
      deviceName: signIn.deviceName,
      user: { email: signIn.user.email, name: signIn.user.name },
      workspaces: signIn.workspaces,
    }, { headers: { "Cache-Control": "no-store", Pragma: "no-cache" } });
  } catch (error) {
    if (error instanceof RequestSecurityError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof RateLimitError) {
      return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": String(error.retryAfterSeconds) } });
    }
    console.error("[BloomMD] App sign-in token exchange failed:", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
