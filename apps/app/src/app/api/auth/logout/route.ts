import { NextResponse } from "next/server";
import { revokeCurrentSession, safeNextPath, sessionCookieName, shouldUseSecureCookies } from "../../../../lib/auth";
import { appRedirectUrl } from "../../../../lib/deployment";
import { assertSameOrigin, readUrlEncodedForm, RequestSecurityError } from "../../../../lib/request-security";

/** Logout never depends on the body: no body, JSON or an oversized form all fall back to no `next`. */
async function readNextField(request: Request) {
  try {
    return (await readUrlEncodedForm(request)).get("next");
  } catch (error) {
    if (error instanceof RequestSecurityError) return null;
    throw error;
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
  } catch (error) {
    if (error instanceof RequestSecurityError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
  await revokeCurrentSession();
  const next = safeNextPath(await readNextField(request), "/");
  const response = NextResponse.redirect(appRedirectUrl(next, request.url), 303);
  response.cookies.set(sessionCookieName(), "", {
    httpOnly: true,
    sameSite: "lax",
    secure: shouldUseSecureCookies(request.url),
    path: "/",
    maxAge: 0,
  });
  return response;
}
