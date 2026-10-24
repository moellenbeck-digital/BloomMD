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

const plausibleOrigin = "https://plausible.moellenbeck-digital.io";
const plausibleScriptUrl = `${plausibleOrigin}/js/script.js`;

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
  if (src !== plausibleScriptUrl || apiHost !== plausibleOrigin) return null;
  return { domain, src, apiHost };
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
  if (!isPlausibleConfigured({
    NEXT_PUBLIC_PLAUSIBLE_DOMAIN: process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN,
    NEXT_PUBLIC_PLAUSIBLE_SRC: process.env.NEXT_PUBLIC_PLAUSIBLE_SRC,
    NEXT_PUBLIC_PLAUSIBLE_API_HOST: process.env.NEXT_PUBLIC_PLAUSIBLE_API_HOST,
  })) return;
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
