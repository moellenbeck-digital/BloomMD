import {
  SERVER_SIGNAL_EVENT,
  SERVER_SIGNAL_FORWARDED_FOR,
  SERVER_SIGNAL_INTERVAL_MS,
  serverSignalConfig,
} from "./plausible";

/**
 * Server signal of customer installations (#299): one `server-start` event with the version at start,
 * then at most one per 24 h. It is the server talking, not a browser, so there is no visitor, no
 * visitor address, no cookie and no identifier in it.
 *
 * What leaves: `POST <target>/api/event` with the fixed User-Agent `BloomMD-Server/<version>`, the fixed
 * neutral `X-Forwarded-For` (the address of this server is not sent from here), and the body
 * `{ name, url, domain, props: { version } }` on the domain `installations.bloommd.app`.
 *
 * Fire and forget: 3 s timeout, the timer does not keep the process alive, and nothing here ever throws
 * or logs. An unreachable target (the normal case on setups without access to it) stays silent.
 */

const SIGNAL_TIMEOUT_MS = 3_000;

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;
type Env = Record<string, string | undefined>;

/** One attempt. Resolves `true` when a request went out and the target accepted it; never rejects. */
export async function sendServerSignal(version: string | undefined, env: Env = process.env, fetchImpl: FetchLike = fetch): Promise<boolean> {
  const config = serverSignalConfig(version, env);
  if (!config) return false;
  try {
    const response = await fetchImpl(`${config.targetUrl}/api/event`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": config.userAgent,
        "X-Forwarded-For": SERVER_SIGNAL_FORWARDED_FOR,
      },
      body: JSON.stringify({
        name: SERVER_SIGNAL_EVENT,
        url: `https://${config.domain}/`,
        domain: config.domain,
        props: { version: config.version },
      }),
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(SIGNAL_TIMEOUT_MS),
    });
    void response.body?.cancel().catch(() => undefined);
    return response.ok;
  } catch {
    return false;
  }
}

let started = false;

/** For tests: the signal is started once per process. */
export function resetServerSignalForTests() {
  started = false;
}

/**
 * Sends the signal now (not awaited) and then every 24 h. Returns `null` when nothing is scheduled
 * (already started, or the environment says no signal), otherwise a function that stops the timer.
 */
export function startServerSignal(
  version: string | undefined,
  env: Env = process.env,
  fetchImpl: FetchLike = fetch,
  intervalMs: number = SERVER_SIGNAL_INTERVAL_MS,
): (() => void) | null {
  if (started || !serverSignalConfig(version, env)) return null;
  started = true;
  const send = () => void sendServerSignal(version, env, fetchImpl);
  send();
  const timer = setInterval(send, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
