import {
  MAX_PLAUSIBLE_EVENT_BYTES,
  plausibleBrowserConfig,
  plausibleRequestHost,
  scrubPlausibleEvent,
  type PlausibleBrowserConfig,
} from "./plausible";
import { plausibleTrackerSource } from "./plausible-script";

/**
 * First-party proxy for Plausible (#299), pattern of #297. The browser talks to our own origin
 * (/_plausible/...); the event is scrubbed here and forwarded to the target.
 *
 * Only what Plausible needs is forwarded: User-Agent and the client IP from X-Forwarded-For (country and
 * device), and the content type. Cookies, Authorization and everything else stay here.
 *
 * Why route handlers and not `rewrites()` in next.config.mjs: the target is read from the environment at
 * request time, a rewrite is fixed at build time; a rewrite forwards every request header, cookies
 * included; and Next ignores `headers()` for external rewrites, so the event POST could not be `no-store`.
 * src/proxy.ts maps the public paths to internal segments that are not reachable from outside.
 *
 * Fail-safe: whatever happens to the target, the browser sees no error. The script is local, the event
 * POST answers 202 also when the target is down, slow or answers with an error. Nothing at start waits
 * for the network.
 */

const UPSTREAM_TIMEOUT_MS = 3_000;
const SCRIPT_CACHE_CONTROL = "public, max-age=3600";
const NO_STORE = "no-store, max-age=0";

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;
type Env = Record<string, string | undefined>;

let failureReported = false;

/** One log line per process for the first failure, then silence: an unreachable target is normal on foreign setups. */
function reportFailureOnce(target: string, reason: string) {
  if (failureReported) return;
  failureReported = true;
  console.warn(`[BloomMD] Plausible-Ziel ${target} nicht erreichbar (${reason}); weitere Ausfälle werden nicht protokolliert.`);
}

/** For tests: the log line is once per process, so each test needs a fresh state. */
export function resetPlausibleFailureLog() {
  failureReported = false;
}

function plain(status: number): Response {
  return new Response(null, { status, headers: { "Cache-Control": NO_STORE, "X-Content-Type-Options": "nosniff" } });
}

function configFor(request: Request, env: Env): PlausibleBrowserConfig | null {
  return plausibleBrowserConfig(plausibleRequestHost(request.headers), env);
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

/** Reads at most `limit` bytes; `null` when the body is bigger, without buffering the rest. */
async function readLimited(request: Request, limit: number): Promise<string | null> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declared) && declared > limit) return null;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export function proxyPlausibleScript(request: Request, env: Env = process.env): Response {
  if (!configFor(request, env)) return plain(404);
  return new Response(plausibleTrackerSource(), {
    status: 200,
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": SCRIPT_CACHE_CONTROL,
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function proxyPlausibleEvent(request: Request, env: Env = process.env, fetchImpl: FetchLike = fetch): Promise<Response> {
  const config = configFor(request, env);
  if (!config) return plain(404);

  const text = await readLimited(request, MAX_PLAUSIBLE_EVENT_BYTES);
  if (text === null) return plain(413);

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return plain(400);
  }
  const event = scrubPlausibleEvent(parsed, config.domain);
  // Unknown events are accepted and dropped: the sender learns nothing about the allowlist.
  if (!event) return plain(202);

  try {
    const upstream = await fetchImpl(`${config.targetUrl}/api/event`, {
      method: "POST",
      headers: plausibleEventRequestHeaders(request),
      body: JSON.stringify(event),
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    // The body is not read: a keep-alive connection is freed by cancelling it.
    void upstream.body?.cancel().catch(() => undefined);
    if (!upstream.ok) reportFailureOnce(config.targetUrl, `HTTP ${upstream.status}`);
  } catch (error) {
    reportFailureOnce(config.targetUrl, error instanceof Error ? error.name : "Fehler");
  }
  return plain(202);
}
