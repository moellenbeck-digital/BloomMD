import { isMarketingAnalyticsConfigured, scrubMarketingAnalyticsEvent } from "./telemetryPrivacy";

export type PlausibleEventOptions = {
  props?: Record<string, string | number | boolean>;
};

export type PlausibleFunction = ((eventName: string, options?: PlausibleEventOptions) => void) & {
  q?: Array<[string, PlausibleEventOptions?]>;
};

export type PlausibleConfig = {
  domain: string;
  src: string;
  apiHost: string;
};

type PlausibleEnv = Record<string, string | undefined>;

// Script and events go through our own origin; src/proxy.ts and src/lib/plausible-proxy.ts forward them
// to the Plausible instance of Ops. Only these two relative values are accepted, never a foreign host.
export const PLAUSIBLE_SCRIPT_PATH = "/_plausible/js/script.js";
export const PLAUSIBLE_API_BASE = "/_plausible";

function publicPlausibleEnv(): PlausibleEnv {
  return {
    NEXT_PUBLIC_PLAUSIBLE_DOMAIN: process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN,
    NEXT_PUBLIC_PLAUSIBLE_SRC: process.env.NEXT_PUBLIC_PLAUSIBLE_SRC,
    NEXT_PUBLIC_PLAUSIBLE_API_HOST: process.env.NEXT_PUBLIC_PLAUSIBLE_API_HOST,
  };
}

export function getPlausibleConfig(env: PlausibleEnv = publicPlausibleEnv()): PlausibleConfig | null {
  const domain = env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN?.trim();
  const src = env.NEXT_PUBLIC_PLAUSIBLE_SRC?.trim();
  const apiHost = env.NEXT_PUBLIC_PLAUSIBLE_API_HOST?.trim();
  if (!domain || !src || !apiHost) return null;
  if (src !== PLAUSIBLE_SCRIPT_PATH || apiHost !== PLAUSIBLE_API_BASE) return null;
  return { domain, src, apiHost };
}

/**
 * The same image runs on the test system, which must not write into the production statistics. The
 * script therefore only loads when the page is served from the configured domain (or its www host).
 */
export function isPlausibleHostAllowed(domain: string, hostname: string) {
  const configured = domain.trim().toLowerCase();
  const current = hostname.trim().toLowerCase();
  if (!configured || !current) return false;
  return current === configured || current === `www.${configured}`;
}

export function isPlausibleConfigured(env: PlausibleEnv = publicPlausibleEnv()) {
  return getPlausibleConfig(env) !== null;
}

export function ensurePlausibleStub(): PlausibleFunction {
  if (window.plausible) return window.plausible;

  const plausible = ((eventName: string, options?: PlausibleEventOptions) => {
    (plausible.q ??= []).push([eventName, options]);
  }) as PlausibleFunction;
  window.plausible = plausible;
  return plausible;
}

export function trackPlausibleEvent(name: string, properties: Record<string, string | number | boolean> = {}) {
  const config = getPlausibleConfig();
  if (!config || !isPlausibleHostAllowed(config.domain, window.location.hostname)) return;
  const event = scrubMarketingAnalyticsEvent(name, properties);
  if (!event) return;
  const options = Object.keys(event.properties).length > 0 ? { props: event.properties } : undefined;
  ensurePlausibleStub()(event.name, options);
}

declare global {
  interface Window {
    plausible?: PlausibleFunction;
  }
}
