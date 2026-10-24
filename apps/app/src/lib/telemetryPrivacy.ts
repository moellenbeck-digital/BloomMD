const SENSITIVE_QUERY_PARAMS = new Set(["token", "email", "next", "error"]);
/** Path segments that are secrets themselves, e.g. the token of a read-only share link. */
const SECRET_PATH_SEGMENTS = /^(\/share\/)[^/?#]+/;

/** Replaces secrets inside a path, e.g. `/share/bloom_share_…` → `/share/[token]`. */
export function redactTelemetryPath(pathname: string) {
  return pathname.replace(SECRET_PATH_SEGMENTS, "$1[token]");
}

export function sanitizeTelemetryUrl(value: unknown) {
  if (typeof value !== "string" || !value) return value;

  try {
    const url = new URL(value, "https://bloommd.app");
    for (const key of Array.from(url.searchParams.keys())) {
      if (SENSITIVE_QUERY_PARAMS.has(key.toLowerCase())) {
        url.searchParams.set(key, "[redacted]");
      }
    }
    return `${url.origin}${redactTelemetryPath(url.pathname)}${url.search}`;
  } catch {
    return redactTelemetryPath(value.split("?")[0] ?? "");
  }
}

export function filterTelemetryBreadcrumb(breadcrumb: { category?: string; data?: Record<string, unknown> }) {
  if (breadcrumb.category === "console") return null;
  if (breadcrumb.data) {
    // Fetch/XHR breadcrumbs carry `url`, navigation breadcrumbs `from` and `to`.
    const data = { ...breadcrumb.data };
    for (const key of ["url", "from", "to"]) {
      if (data[key]) data[key] = sanitizeTelemetryUrl(data[key]);
    }
    breadcrumb.data = data;
  }
  return breadcrumb;
}

export function scrubTelemetryEvent<T extends {
  breadcrumbs?: Array<{ category?: string; data?: Record<string, unknown> }>;
  request?: {
    cookies?: unknown;
    headers?: unknown;
    url?: string;
  };
  user?: unknown;
}>(event: T) {
  delete event.user;

  if (event.request) {
    delete event.request.cookies;
    delete event.request.headers;
    event.request.url = sanitizeTelemetryUrl(event.request.url) as string | undefined;
  }

  event.breadcrumbs = event.breadcrumbs
    ?.map((breadcrumb) => filterTelemetryBreadcrumb(breadcrumb))
    .filter((breadcrumb): breadcrumb is { category?: string; data?: Record<string, unknown> } => Boolean(breadcrumb));

  return event;
}
