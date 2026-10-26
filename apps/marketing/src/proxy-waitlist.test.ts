import { afterEach, describe, expect, test } from "bun:test";
import { NextRequest } from "next/server";
import { proxy } from "./proxy";

const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL;
const originalNodeEnv = process.env.NODE_ENV;

function setEnvValue(key: string, value: string) {
  (process.env as Record<string, string | undefined>)[key] = value;
}

afterEach(() => {
  if (originalAppUrl == null) delete process.env.NEXT_PUBLIC_APP_URL;
  else process.env.NEXT_PUBLIC_APP_URL = originalAppUrl;
  setEnvValue("NODE_ENV", originalNodeEnv ?? "test");
});

function production() {
  setEnvValue("NODE_ENV", "production");
  process.env.NEXT_PUBLIC_APP_URL = "https://bloommd.app";
}

describe("retired waitlist pages", () => {
  for (const path of ["/waitlist", "/waitlist/", "/waitlist/bestaetigt", "/waitlist/ungueltig"]) {
    test(`${path} redirects permanently (308) to the registration`, () => {
      production();
      const response = proxy(new NextRequest(`https://bloommd.io${path}`));

      expect(response.status).toBe(308);
      expect(response.headers.get("location")).toBe("https://bloommd.app/signup");
    });
  }

  test("keeps the language of the visitor", () => {
    production();
    const response = proxy(new NextRequest("https://bloommd.io/waitlist/bestaetigt?lang=en"));

    expect(response.headers.get("location")).toBe("https://bloommd.app/signup?lang=en");
  });
});

describe("waitlist pages that keep working", () => {
  test("the unsubscribe page is not redirected", () => {
    production();
    const response = proxy(new NextRequest("https://bloommd.io/waitlist/abgemeldet"));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  test("the unsubscribe API is not redirected", () => {
    production();
    const response = proxy(new NextRequest("https://bloommd.io/api/waitlist/unsubscribe?token=x"));

    expect(response.headers.get("location")).toBeNull();
  });

  test("an unrelated path is untouched", () => {
    production();
    const response = proxy(new NextRequest("https://bloommd.io/demo"));

    expect(response.status).toBe(200);
  });
});

describe("the waitlist admin is gone", () => {
  test("the proxy no longer answers for /admin/waitlist (no basic-auth gate, no 401/503)", () => {
    production();
    const response = proxy(new NextRequest("https://bloommd.io/admin/waitlist"));

    // Falls through to Next.js routing, where no route exists any more → 404.
    expect(response.status).toBe(200);
    expect(response.headers.get("www-authenticate")).toBeNull();
  });
});
