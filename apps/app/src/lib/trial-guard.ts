import { parseSessionToken } from "./auth";
import { resolveAccessToken } from "./db";
import { isTrialWriteLocked } from "./trial-lock";
import { trialExpiredMessage, trialRequestLocale, TRIAL_EXPIRED_CODE } from "./trial-readonly";

const SESSION_COOKIE = "bloommd_session";

/**
 * Who sends this request, as far as the read-only mode needs to know. The session cookie carries a
 * signed user id (the routes themselves still check that the session is active), an access token is
 * looked up. Anything unknown is left to the route, which refuses it anyway.
 */
async function requestUserId(request: Request & { cookies?: { get(name: string): { value: string } | undefined } }) {
  const authorization = request.headers.get("authorization");
  if (authorization?.startsWith("Bearer ")) {
    const token = await resolveAccessToken(authorization.slice(7).trim());
    return token?.userId;
  }
  const cookie = request.cookies?.get(SESSION_COOKIE)?.value
    ?? request.headers.get("cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length + 1);
  return parseSessionToken(cookie)?.userId;
}

/**
 * The refusal for a guarded write of an account whose trial has ended, or null. Called from
 * `proxy.ts` only with the switch on and only for writes (`isTrialGuardedWrite`). A failing
 * database lookup does not block: the route behind it needs the database as well and fails there.
 */
export async function trialWriteBlock(request: Request, now: Date = new Date()): Promise<Response | null> {
  try {
    const userId = await requestUserId(request);
    if (!(await isTrialWriteLocked(userId, now))) return null;
  } catch (error) {
    console.error("[BloomMD] Trial read-only check failed:", error instanceof Error ? error.name : "unknown");
    return null;
  }
  return Response.json(
    { error: trialExpiredMessage(trialRequestLocale(request)), code: TRIAL_EXPIRED_CODE },
    { status: 403, headers: { "Cache-Control": "no-store" } },
  );
}
