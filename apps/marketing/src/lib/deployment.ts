/** URL helpers for the public marketing app. */

const LOCAL_APP_URL = "http://127.0.0.1:3210";
const LOCAL_MARKETING_URL = "http://127.0.0.1:3212";

function currentDeploymentEnv() {
  return {
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_MARKETING_URL: process.env.NEXT_PUBLIC_MARKETING_URL,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  } as NodeJS.ProcessEnv;
}

export function appUrl(env: NodeJS.ProcessEnv = currentDeploymentEnv()): string {
  return (
    localSafeUrl(env.NEXT_PUBLIC_APP_URL, env)
    || (env.NODE_ENV === "production" ? "https://bloommd.app" : LOCAL_APP_URL)
  ).replace(/\/$/, "");
}

export function marketingUrl(env: NodeJS.ProcessEnv = currentDeploymentEnv()): string {
  return (
    localSafeUrl(env.NEXT_PUBLIC_MARKETING_URL, env)
    || localSafeUrl(env.NEXT_PUBLIC_SITE_URL, env)
    || (env.NODE_ENV === "production" ? "https://bloommd.io" : LOCAL_MARKETING_URL)
  ).replace(/\/$/, "");
}

function isLoopbackHost(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function localSafeUrl(value: string | undefined, env: NodeJS.ProcessEnv) {
  if (!value || env.NODE_ENV === "production") return value;

  try {
    const url = new URL(value);
    if (isLoopbackHost(url.hostname) && url.port === "3000") return undefined;
  } catch {
    return undefined;
  }

  return value;
}

export function publicMarketingUrl(env: NodeJS.ProcessEnv = currentDeploymentEnv()): string {
  const configured = marketingUrl(env);
  if (env.NODE_ENV !== "production") return configured;

  try {
    const url = new URL(configured);
    if (url.protocol === "https:" && !isLoopbackHost(url.hostname)) return configured;
  } catch {
    // Fall through to the public M1 marketing domain.
  }

  return "https://bloommd.io";
}

export function publicAppUrl(env: NodeJS.ProcessEnv = currentDeploymentEnv()): string {
  const configured = appUrl(env);
  if (env.NODE_ENV !== "production") return configured;

  try {
    const url = new URL(configured);
    if (url.protocol === "https:" && !isLoopbackHost(url.hostname)) return configured;
  } catch {
    // Fall through to the public M1 app domain.
  }

  return "https://bloommd.app";
}
