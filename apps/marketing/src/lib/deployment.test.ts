import { describe, expect, test } from "bun:test";
import { appUrl, marketingUrl, publicAppUrl, publicMarketingUrl } from "./deployment";

describe("marketing app deployment URLs", () => {
  test("defaults to local split origins outside production", () => {
    const env = { NODE_ENV: "development" } as unknown as NodeJS.ProcessEnv;

    expect(marketingUrl(env)).toBe("http://127.0.0.1:3212");
    expect(appUrl(env)).toBe("http://127.0.0.1:3210");
  });

  test("ignores stale localhost site URLs outside production when no marketing URL is configured", () => {
    const env = {
      NODE_ENV: "development",
      NEXT_PUBLIC_SITE_URL: "http://localhost:3000/",
    } as unknown as NodeJS.ProcessEnv;

    expect(publicMarketingUrl(env)).toBe("http://127.0.0.1:3212");
  });

  test("defaults to the public marketing and private app origins in production", () => {
    const env = { NODE_ENV: "production" } as unknown as NodeJS.ProcessEnv;

    expect(marketingUrl(env)).toBe("https://bloommd.io");
    expect(appUrl(env)).toBe("https://bloommd.app");
  });

  test("uses explicit split URLs without trailing slashes", () => {
    const env = {
      NEXT_PUBLIC_SITE_URL: "https://bloommd.io/",
      NEXT_PUBLIC_MARKETING_URL: "https://marketing.example.test/",
      NEXT_PUBLIC_APP_URL: "https://app.example.test/",
    } as unknown as NodeJS.ProcessEnv;

    expect(marketingUrl(env)).toBe("https://marketing.example.test");
    expect(appUrl(env)).toBe("https://app.example.test");
  });

  test("does not expose localhost as the public app origin from marketing in production", () => {
    const env = {
      NODE_ENV: "production",
      NEXT_PUBLIC_SITE_URL: "https://bloommd.io",
      NEXT_PUBLIC_MARKETING_URL: "https://bloommd.io",
      NEXT_PUBLIC_APP_URL: "http://localhost:3000/",
    } as unknown as NodeJS.ProcessEnv;

    expect(publicAppUrl(env)).toBe("https://bloommd.app");
    expect(new URL("/signup?next=%2Fapp", publicAppUrl(env)).href).toBe("https://bloommd.app/signup?next=%2Fapp");
  });
});
