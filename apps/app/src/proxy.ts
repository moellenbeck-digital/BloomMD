import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { publicMarketingUrl } from "./lib/deployment";
import { mobileCorsHeaders } from "./lib/mobile-cors";

function configuredOrigin(value: string | undefined) {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function unique(values: Array<string | null>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function isMarketingPageRoute(pathname: string) {
  return ["/demo", "/docs", "/templates", "/waitlist"].some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

function marketingRedirect(request: NextRequest) {
  const target = new URL(`${request.nextUrl.pathname}${request.nextUrl.search}`, publicMarketingUrl());
  const response = NextResponse.redirect(target, 308);
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}

function contentSecurityPolicy() {
  const syncOrigin = configuredOrigin(process.env.NEXT_PUBLIC_SYNC_URL);
  const connectSources = unique([
    "'self'",
    configuredOrigin(process.env.NEXT_PUBLIC_POSTHOG_HOST),
    configuredOrigin(process.env.NEXT_PUBLIC_SENTRY_DSN),
    syncOrigin,
    // Runtime env is the source of truth, but production images are built before those values exist.
    process.env.NODE_ENV === "production" ? "wss://sync.bloommd.app" : null,
  ]);

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "production" ? "" : " 'unsafe-eval'"}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob: https:",
    "font-src 'self' data:",
    `connect-src ${connectSources.join(" ")}`,
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    process.env.NODE_ENV === "production" ? "upgrade-insecure-requests" : "",
  ].filter(Boolean).join("; ");
}

/**
 * Product app proxy.
 *
 * The product app is always private and noindex. Marketing and waitlist routes are not part of this
 * app root, so route separation is enforced by the build boundary rather than a runtime mode switch.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-bloommd-locale", request.nextUrl.searchParams.get("lang") === "en" ? "en" : "de");

  if (pathname.startsWith("/_next/static/") && pathname.endsWith(".map")) {
    return new NextResponse(null, { status: 404 });
  }

  if ((request.method === "GET" || request.method === "HEAD") && isMarketingPageRoute(pathname)) {
    return marketingRedirect(request);
  }

  // The mobile app calls bearer-token routes from its WebView origin (never with cookies).
  const cors = mobileCorsHeaders(request.headers.get("Origin"), pathname);
  if (cors && request.method === "OPTIONS") {
    return new NextResponse(null, { status: 204, headers: { ...cors, "X-Robots-Tag": "noindex, nofollow" } });
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  if (cors) for (const [key, value] of Object.entries(cors)) response.headers.set(key, value);
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  response.headers.set("Content-Security-Policy", contentSecurityPolicy());
  return response;
}

export const config = {
  matcher: ["/:path*"],
};
