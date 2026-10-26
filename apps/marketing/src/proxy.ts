import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isRetiredWaitlistPath, waitlistSignupUrl } from "./lib/waitlist-redirect";

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

  // The waitlist is gone; registration replaces it. Permanent, so old links and bookmarks settle.
  if (isRetiredWaitlistPath(pathname)) {
    return NextResponse.redirect(waitlistSignupUrl(request.nextUrl.searchParams), 308);
  }

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ["/:path*"],
};
