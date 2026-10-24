import { describe, expect, test } from "bun:test";
import {
  isMarketingAnalyticsConfigured,
  scrubMarketingAnalyticsEvent,
  scrubTelemetryEvent,
  sanitizeTelemetryUrl,
} from "./telemetryPrivacy";

describe("telemetry privacy", () => {
  test("redacts sensitive query values", () => {
    const value = sanitizeTelemetryUrl("https://bloommd.app/reset-password?token=secret&email=user@example.com&view=map");
    expect(value).not.toContain("secret");
    expect(value).not.toContain("user@example.com");
    expect(value).toContain("view=map");
  });

  test("removes users, headers, cookies, and console breadcrumbs", () => {
    const event = scrubTelemetryEvent({
      user: { email: "private@example.com" },
      request: { headers: { authorization: "secret" }, cookies: { session: "secret" }, url: "https://bloommd.app/app?token=secret" },
      breadcrumbs: [{ category: "console" }, { category: "fetch", data: { url: "https://bloommd.app/api?email=private@example.com" } }],
    });
    expect(event.user).toBeUndefined();
    expect(event.request?.headers).toBeUndefined();
    expect(event.request?.cookies).toBeUndefined();
    expect(event.breadcrumbs).toHaveLength(1);
    expect(JSON.stringify(event)).not.toContain("private@example.com");
  });

  test("allows only documented marketing analytics events and properties", () => {
    expect(scrubMarketingAnalyticsEvent("node_opened", {
      template: "starter-vault",
      node_level: 2,
      filename: "private.md",
      markdown: "# Private",
    })).toEqual({
      name: "node_opened",
      properties: {
        template: "starter-vault",
        node_level: 2,
      },
    });

    expect(scrubMarketingAnalyticsEvent("unknown_event", { path: "/demo" })).toBeNull();
  });

  test("allows the closed beta waitlist CTA without leaking properties", () => {
    expect(scrubMarketingAnalyticsEvent("closed_beta_waitlist_clicked", {
      email: "private@example.com",
      path: "/demo",
    })).toEqual({
      name: "closed_beta_waitlist_clicked",
      properties: {},
    });
  });

  test("allows Plausible conversion events without personal properties", () => {
    expect(scrubMarketingAnalyticsEvent("waitlist_signup", {
      email: "person@example.com",
      name: "Person",
    })).toEqual({ name: "waitlist_signup", properties: {} });
    expect(scrubMarketingAnalyticsEvent("demo_click", {
      path: "/demo",
      token: "secret",
    })).toEqual({ name: "demo_click", properties: {} });
  });

  test("keeps marketing pageviews path-only", () => {
    expect(scrubMarketingAnalyticsEvent("$pageview", {
      path: "/demo",
      url: "https://bloommd.io/demo?email=private@example.com",
      referrer: "https://example.com",
    })).toEqual({
      name: "$pageview",
      properties: {
        path: "/demo",
      },
    });
  });

  test("requires both PostHog key and host before analytics can run", () => {
    expect(isMarketingAnalyticsConfigured({})).toBe(false);
    expect(isMarketingAnalyticsConfigured({ NEXT_PUBLIC_POSTHOG_KEY: "phc_test" })).toBe(false);
    expect(isMarketingAnalyticsConfigured({
      NEXT_PUBLIC_POSTHOG_KEY: "phc_test",
      NEXT_PUBLIC_POSTHOG_HOST: "https://eu.i.posthog.com",
    })).toBe(true);
  });
});
