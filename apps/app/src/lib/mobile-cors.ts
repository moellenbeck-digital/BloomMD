/**
 * CORS for the BloomMD mobile app. Its WebView runs on `capacitor://localhost` (iOS) or
 * `https://localhost` (Android) and calls the document API cross-origin with a bearer token.
 * Credentials (cookies) are never allowed cross-origin, so a browser session cannot be used from
 * these origins; only routes that accept bearer tokens are opened.
 */
const APP_ORIGINS = new Set(["capacitor://localhost", "https://localhost"]);
const DEV_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1):\d{2,5}$/;

export function isMobileApiPath(pathname: string) {
  return (
    pathname === "/api/mobile/token" ||
    pathname === "/api/mobile/session" ||
    pathname === "/api/mobile/logout" ||
    pathname === "/api/sync-ticket" ||
    pathname === "/api/mindmaps" ||
    pathname.startsWith("/api/mindmaps/")
  );
}

export function isMobileAppOrigin(origin: string | null, nodeEnv = process.env.NODE_ENV) {
  if (!origin) return false;
  if (APP_ORIGINS.has(origin)) return true;
  // `vite dev` of packages/mobile in a desktop browser.
  return nodeEnv !== "production" && DEV_ORIGIN.test(origin);
}

/** CORS headers for an allowed app origin on a bearer-token route, otherwise null. */
export function mobileCorsHeaders(origin: string | null, pathname: string, nodeEnv = process.env.NODE_ENV): Record<string, string> | null {
  if (!isMobileApiPath(pathname) || !isMobileAppOrigin(origin, nodeEnv)) return null;
  return {
    "Access-Control-Allow-Origin": origin!,
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, X-BloomMD-Workspace-ID",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
}
