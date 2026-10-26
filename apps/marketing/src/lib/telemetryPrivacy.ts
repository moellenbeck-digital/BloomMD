const SENSITIVE_QUERY_PARAMS = new Set(["token", "email", "next", "error"]);
const MARKETING_ANALYTICS_EVENT_PROPERTIES: Record<string, ReadonlySet<string>> = {
  "$pageview": new Set(["path"]),
  demo_opened: new Set([]),
  node_opened: new Set(["template", "node_level"]),
  node_moved: new Set(["template"]),
  template_opened: new Set(["slug"]),
  custom_markdown_pasted: new Set([]),
  custom_file_selected: new Set([]),
  download_clicked: new Set([]),
  markdown_view_opened: new Set([]),
  mindmap_view_opened: new Set([]),
  explore_templates_clicked: new Set([]),
  signup_click: new Set([]),
  obsidian_plugin_clicked: new Set([]),
  demo_click: new Set([]),
  login_click: new Set([]),
  contact_click: new Set([]),
};

export const ANALYTICS_CONSENT_KEY = "bloommd:analytics-consent:v1";

type MarketingAnalyticsProperties = Record<string, string | number | boolean | null | undefined>;
type MarketingAnalyticsEnv = {
  NEXT_PUBLIC_POSTHOG_KEY?: string;
  NEXT_PUBLIC_POSTHOG_HOST?: string;
};

export function isMarketingAnalyticsConfigured(env: MarketingAnalyticsEnv) {
  return Boolean(env.NEXT_PUBLIC_POSTHOG_KEY && env.NEXT_PUBLIC_POSTHOG_HOST);
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
    return `${url.origin}${url.pathname}${url.search}`;
  } catch {
    return value.split("?")[0];
  }
}

export function filterTelemetryBreadcrumb(breadcrumb: { category?: string; data?: Record<string, unknown> }) {
  if (breadcrumb.category === "console") return null;
  if (breadcrumb.data?.url) {
    breadcrumb.data = {
      ...breadcrumb.data,
      url: sanitizeTelemetryUrl(breadcrumb.data.url),
    };
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

export function scrubMarketingAnalyticsEvent(name: string, properties: MarketingAnalyticsProperties = {}) {
  const allowedProperties = MARKETING_ANALYTICS_EVENT_PROPERTIES[name as keyof typeof MARKETING_ANALYTICS_EVENT_PROPERTIES];
  if (!allowedProperties) return null;

  const scrubbed: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (!allowedProperties.has(key)) continue;
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      scrubbed[key] = value;
    }
  }

  return {
    name,
    properties: scrubbed,
  };
}
