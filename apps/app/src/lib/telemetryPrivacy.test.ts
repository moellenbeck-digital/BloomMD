import { describe, expect, test } from "bun:test";
import { redactTelemetryPath, scrubTelemetryEvent, sanitizeTelemetryUrl } from "./telemetryPrivacy";

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

  test("redacts read-only share tokens in paths, URLs and navigation breadcrumbs", () => {
    expect(redactTelemetryPath("/share/bloom_share_abc123")).toBe("/share/[token]");
    expect(redactTelemetryPath("/app")).toBe("/app");
    expect(sanitizeTelemetryUrl("https://bloommd.app/share/bloom_share_abc123?x=1")).toBe("https://bloommd.app/share/[token]?x=1");
    const event = scrubTelemetryEvent({
      request: { url: "https://bloommd.app/share/bloom_share_abc123" },
      breadcrumbs: [{ category: "navigation", data: { from: "/share/bloom_share_abc123", to: "/app" } }],
    });
    expect(JSON.stringify(event)).not.toContain("bloom_share_abc123");
  });
});
