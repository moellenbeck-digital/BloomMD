import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isWaitlistAdminAuthConfigured, isWaitlistAdminAuthorized, waitlistAdminHeaders } from "./lib/waitlist-admin-auth";

const DESKTOP_UPDATE_PUBLIC_PREFIX = "/_desktop-updates/";
const DESKTOP_UPDATE_INTERNAL_PREFIX = "/desktop-updates/";
const DESKTOP_UPDATE_PROXY_HEADER = "x-bloommd-desktop-proxy";

/**
 * Marketing app proxy.
 *
 * App routes are not part of this app root. The proxy only handles universal public hardening that
 * should apply to the public site as well.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-bloommd-pathname", pathname);
  requestHeaders.set("x-bloommd-locale", request.nextUrl.searchParams.get("lang") === "en" || pathname === "/en" || pathname.startsWith("/en/") ? "en" : "de");

  if (pathname.startsWith("/_next/static/") && pathname.endsWith(".map")) {
    return new NextResponse(null, { status: 404 });
  }

  // The route handler is mounted under an internal segment and exposed only through a
  // middleware rewrite. The marker travels with the rewritten request, so direct requests to the
  // implementation path remain private even though Next.js runs middleware after config rewrites.
  if (pathname === "/desktop-updates" || pathname.startsWith(DESKTOP_UPDATE_INTERNAL_PREFIX)) {
    if (request.headers.get(DESKTOP_UPDATE_PROXY_HEADER) !== "1") {
      return new NextResponse(null, { status: 404 });
    }
  }

  if (pathname === "/_desktop-updates" || pathname.startsWith(DESKTOP_UPDATE_PUBLIC_PREFIX)) {
    const artifact = pathname.slice(DESKTOP_UPDATE_PUBLIC_PREFIX.length);
    if (!artifact) return new NextResponse(null, { status: 404 });

    const internalUrl = request.nextUrl.clone();
    internalUrl.pathname = `${DESKTOP_UPDATE_INTERNAL_PREFIX}${artifact}`;
    const rewrittenRequestHeaders = new Headers(requestHeaders);
    rewrittenRequestHeaders.set(DESKTOP_UPDATE_PROXY_HEADER, "1");
    return NextResponse.rewrite(internalUrl, { request: { headers: rewrittenRequestHeaders } });
  }

  if (pathname === "/desktop-updates") {
    return new NextResponse(null, { status: 404 });
  }

  if (pathname === "/admin/waitlist" || pathname.startsWith("/admin/waitlist/")) {
    const securityHeaders = waitlistAdminHeaders();
    if (!isWaitlistAdminAuthConfigured()) {
      return new NextResponse("Waitlist admin is not configured.", {
        status: 503,
        headers: { ...securityHeaders, "Content-Type": "text/plain; charset=utf-8" },
      });
    }
    if (!isWaitlistAdminAuthorized(request.headers.get("authorization"))) {
      return new NextResponse("Authentication required.", {
        status: 401,
        headers: {
          ...securityHeaders,
          "Content-Type": "text/plain; charset=utf-8",
          "WWW-Authenticate": "Basic realm=\"BloomMD Waitlist\", charset=\"UTF-8\"",
        },
      });
    }

    const response = NextResponse.next({ request: { headers: requestHeaders } });
    for (const [key, value] of Object.entries(securityHeaders)) response.headers.set(key, value);
    return response;
  }

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ["/:path*"],
};
