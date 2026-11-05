/**
 * Anonymous usage statistics with Plausible (#299), read from the environment at request time.
 *
 * Nothing here is `NEXT_PUBLIC_*`: those values are baked in at build time, so changing them needs a
 * new image. These are read on the server per request, so the ConfigMap decides.
 *
 * Two operating modes, decided by the request host:
 * - Our own installation (host == BLOOMMD_PLAUSIBLE_DOMAIN, default `bloommd.app`): the browser tracks
 *   through the first-party proxy `/_plausible`, which forwards to the target.
 * - Every other host (customer installations): never browser tracking. A foreign host cannot make the
 *   proxy send visitor IPs to us, which is the decision of the management (variant A).
 *
 * Only pageviews and an allowlist of usage events leave this app. No user, organisation or workspace
 * ids, no file names, titles, share tokens or search terms, neither as property nor in the URL.
 */

type PlausibleEnv = Record<string, string | undefined>;

/** Public receiving point for customer installations. The single place this host is set in code. */
export const DEFAULT_PLAUSIBLE_TARGET_URL = "https://ping.bloommd.app";
/** The domain of our own installation. */
export const OWN_PLAUSIBLE_DOMAIN = "bloommd.app";

export const PLAUSIBLE_SCRIPT_PATH = "/_plausible/js/script.js";
export const PLAUSIBLE_EVENT_PATH = "/_plausible/api/event";

/** Names only, never properties. Extend here, and only with events that carry no identifying data. */
export const PLAUSIBLE_EVENT_ALLOWLIST: readonly string[] = ["pageview"];

/** Plausible events are a few hundred bytes; anything bigger is not an event. */
export const MAX_PLAUSIBLE_EVENT_BYTES = 4 * 1024;

export type PlausibleSettings = {
  disabled: boolean;
  domain: string;
  targetUrl: string;
  /** True when BLOOMMD_PLAUSIBLE_TARGET_URL holds a valid http(s) URL. */
  targetExplicit: boolean;
};

export type PlausibleBrowserConfig = {
  domain: string;
  targetUrl: string;
};

function isTruthyFlag(value: string | undefined) {
  const normalized = value?.trim().toLowerCase();
  return normalized === "true" || normalized === "1";
}

function parseHttpOrigin(value: string | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" || url.protocol === "http:" ? url.origin : null;
  } catch {
    return null;
  }
}

function parseDomain(value: string | undefined): string | null {
  const domain = value?.trim().toLowerCase();
  return domain && /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/.test(domain) ? domain : null;
}

export function readPlausibleSettings(env: PlausibleEnv = process.env): PlausibleSettings {
  const explicitTarget = parseHttpOrigin(env.BLOOMMD_PLAUSIBLE_TARGET_URL);
  return {
    disabled: isTruthyFlag(env.BLOOMMD_PLAUSIBLE_DISABLED),
    domain: parseDomain(env.BLOOMMD_PLAUSIBLE_DOMAIN) ?? OWN_PLAUSIBLE_DOMAIN,
    targetUrl: explicitTarget ?? DEFAULT_PLAUSIBLE_TARGET_URL,
    targetExplicit: explicitTarget !== null,
  };
}

/** Host of a request without port, lower case. `X-Forwarded-Host` wins when a proxy sits in front. */
export function plausibleRequestHost(headers: Headers): string {
  const raw = headers.get("x-forwarded-host") ?? headers.get("host") ?? "";
  const first = raw.split(",")[0]?.trim().toLowerCase() ?? "";
  return first.replace(/:\d+$/, "");
}

/**
 * Browser tracking runs only when it is on, the request host is the configured domain, and sending is
 * safe: the domain is our own, or the target was set explicitly. Without that, an installation with
 * its own domain but the default target would send its visitors' IPs to us.
 * `null` means: no script tag, and the proxy routes answer 404.
 */
export function plausibleBrowserConfig(host: string | null | undefined, env: PlausibleEnv = process.env): PlausibleBrowserConfig | null {
  const settings = readPlausibleSettings(env);
  if (settings.disabled) return null;
  if (!host || host.trim().toLowerCase() !== settings.domain) return null;
  if (settings.domain !== OWN_PLAUSIBLE_DOMAIN && !settings.targetExplicit) return null;
  return { domain: settings.domain, targetUrl: settings.targetUrl };
}

/** One line for the server log at start, also when tracking is off. It names the switch and the rule. */
export function plausibleStartupLine(env: PlausibleEnv = process.env): string {
  const settings = readPlausibleSettings(env);
  const sends = "nur Seitenaufrufe und Nutzungsereignisse, keine Kennung, keine Cookies";
  if (settings.disabled) {
    return "[BloomMD] Plausible-Statistik: AUS (BLOOMMD_PLAUSIBLE_DISABLED ist gesetzt).";
  }
  if (settings.domain !== OWN_PLAUSIBLE_DOMAIN && !settings.targetExplicit) {
    return `[BloomMD] Plausible-Statistik: INAKTIV (Domain ${settings.domain} ohne BLOOMMD_PLAUSIBLE_TARGET_URL sendet nichts). Abschalten: BLOOMMD_PLAUSIBLE_DISABLED=true.`;
  }
  return `[BloomMD] Plausible-Statistik: AN, nur auf dem Host ${settings.domain} (${sends}; Ziel ${settings.targetUrl}). Abschalten: BLOOMMD_PLAUSIBLE_DISABLED=true.`;
}

/** Attributes of the script tag that the root layout renders when tracking applies to the request. */
export function plausibleScriptAttributes(config: PlausibleBrowserConfig) {
  return {
    src: PLAUSIBLE_SCRIPT_PATH,
    "data-domain": config.domain,
    "data-api": PLAUSIBLE_EVENT_PATH,
    defer: true,
  } as const;
}

/**
 * Page paths are reduced to a route pattern: no ids, no query, no hash. Known static routes pass,
 * dynamic ones lose their segment, everything else is `/other` so an unknown path never leaks.
 * `PLAUSIBLE_PATH_RULES` is the single source: the browser script embeds it, the server applies it again.
 */
export const PLAUSIBLE_PATH_RULES = {
  statics: [
    "/", "/app", "/login", "/signup", "/forgot-password", "/reset-password", "/activate", "/account", "/beta",
    "/wiki", "/invite/confirm", "/auth/mobile", "/agb", "/datenschutz", "/impressum", "/lizenz", "/widerruf", "/cookies",
  ],
  dynamics: [
    { prefix: "/share/", pattern: "/share/:token" },
    { prefix: "/invite/", pattern: "/invite/:token" },
  ],
  fallback: "/other",
} as const;

export function normalizePlausiblePath(value: string): string {
  let pathname: string;
  try {
    pathname = new URL(value, "https://placeholder.invalid").pathname;
  } catch {
    return PLAUSIBLE_PATH_RULES.fallback;
  }
  let path = pathname.toLowerCase();
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
  if ((PLAUSIBLE_PATH_RULES.statics as readonly string[]).includes(path)) return path;
  for (const rule of PLAUSIBLE_PATH_RULES.dynamics) {
    if (path.startsWith(rule.prefix) && path.length > rule.prefix.length && !path.slice(rule.prefix.length).includes("/")) return rule.pattern;
  }
  return PLAUSIBLE_PATH_RULES.fallback;
}

export type PlausibleEvent = { n: string; u: string; d: string };

/**
 * The browser is not trusted: whatever it sent, only an allowlisted name, the domain and a normalized
 * page URL go on. Properties, referrer, revenue and every other field are dropped. `null` = discard.
 */
export function scrubPlausibleEvent(input: unknown, domain: string): PlausibleEvent | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
  const { n, u } = input as Record<string, unknown>;
  if (typeof n !== "string" || !PLAUSIBLE_EVENT_ALLOWLIST.includes(n)) return null;
  const path = typeof u === "string" ? normalizePlausiblePath(u) : PLAUSIBLE_PATH_RULES.fallback;
  return { n, u: `https://${domain}${path}`, d: domain };
}
