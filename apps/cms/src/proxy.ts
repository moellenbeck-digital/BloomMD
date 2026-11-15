import type { NextRequest } from "next/server";
import { mfaVerifiedForToken, readCookie } from "./lib/mfa-session";

/**
 * Second factor in the admin UI (ADR O9, ticket #206): whoever has a session after the password but not yet the
 * second factor sees only `/admin/mfa` (setup or code). Everything else under `/admin` leads there. This is
 * convenience; the barrier is `operatorRole` (access/index.ts): without the factor nothing is readable or
 * writable, in the UI and over REST alike. The cookie prefix is the default one (`payload`, as in the config).
 */
const OPEN = /^\/admin\/(login|logout|forgot|reset|inactivity|unauthorized|mfa)(\/|$)/;

export function proxy(request: NextRequest): Response | undefined {
  const { pathname } = request.nextUrl;
  if (OPEN.test(pathname)) return undefined;
  const headers = request.headers;
  if (!readCookie(headers, "payload-token")) return undefined;
  if (mfaVerifiedForToken(headers)) return undefined;
  return new Response(null, { status: 307, headers: { location: "/admin/mfa", "cache-control": "no-store" } });
}

export const config = { matcher: ["/admin/:path*"] };
