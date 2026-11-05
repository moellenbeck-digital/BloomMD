/**
 * First-party proxy for Plausible. The browser loads the script from and posts events to our own
 * origin (/_plausible/...); this module forwards them to the Plausible instance of Ops.
 *
 * Only what Plausible needs is forwarded (User-Agent and the client IP from X-Forwarded-For, for
 * country and device; the content type of the event). Cookies, Authorization and everything else the
 * browser sent to bloommd.io stay here.
 */

export const DEFAULT_PLAUSIBLE_PROXY_TARGET = "https://plausible.ops.moellenbeck-digital.io";

/** Plausible events are a few hundred bytes; anything much bigger is not an event. */
export const MAX_PLAUSIBLE_EVENT_BYTES = 64 * 1024;
const UPSTREAM_TIMEOUT_MS = 8_000;
const SCRIPT_CACHE_CONTROL = "public, max-age=3600";
const NO_STORE = "no-store, max-age=0";

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * Target origin of the proxy. PLAUSIBLE_PROXY_TARGET overrides it (for example a local stub in tests).
 * It is read on the server only: it is not NEXT_PUBLIC_*, so it never reaches the client bundle, and the
 * CSP never lists it. Anything that is not an http(s) URL falls back to the default.
 */
export function plausibleProxyTarget(env: Record<string, string | undefined> = process.env): string {
  const raw = env.PLAUSIBLE_PROXY_TARGET?.trim();
  if (!raw) return DEFAULT_PLAUSIBLE_PROXY_TARGET;
  try {
    const url = new URL(raw);
    if (url.protocol === "https:" || url.protocol === "http:") return url.origin;
  } catch {
    // fall through to the default
  }
  return DEFAULT_PLAUSIBLE_PROXY_TARGET;
}

function failure(status: number): Response {
  return new Response(null, { status, headers: { "Cache-Control": NO_STORE, "X-Content-Type-Options": "nosniff" } });
}

/** Headers Plausible needs to attribute an event: device from User-Agent, location from the client IP. */
export function plausibleEventRequestHeaders(request: Request): Headers {
  const headers = new Headers({ "Content-Type": request.headers.get("content-type") || "text/plain" });
  const userAgent = request.headers.get("user-agent");
  if (userAgent) headers.set("User-Agent", userAgent);
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) headers.set("X-Forwarded-For", forwardedFor);
  return headers;
}

export async function proxyPlausibleScript(env: Record<string, string | undefined> = process.env, fetchImpl: FetchLike = fetch): Promise<Response> {
  let upstream: Response;
  try {
    upstream = await fetchImpl(`${plausibleProxyTarget(env)}/js/script.js`, {
      headers: { Accept: "application/javascript, text/javascript, */*" },
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch {
    return failure(502);
  }
  if (!upstream.ok) return failure(502);

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": upstream.headers.get("content-type") || "application/javascript; charset=utf-8",
      "Cache-Control": SCRIPT_CACHE_CONTROL,
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function proxyPlausibleEvent(request: Request, env: Record<string, string | undefined> = process.env, fetchImpl: FetchLike = fetch): Promise<Response> {
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_PLAUSIBLE_EVENT_BYTES) return failure(413);
  const body = await request.arrayBuffer();
  if (body.byteLength > MAX_PLAUSIBLE_EVENT_BYTES) return failure(413);

  let upstream: Response;
  try {
    upstream = await fetchImpl(`${plausibleProxyTarget(env)}/api/event`, {
      method: "POST",
      headers: plausibleEventRequestHeaders(request),
      body,
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch {
    return failure(502);
  }
  // A redirect from the instance is not a result we can hand to the browser.
  if (upstream.status >= 300 && upstream.status < 400) return failure(502);

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "Content-Type": upstream.headers.get("content-type") || "text/plain",
      "Cache-Control": NO_STORE,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
