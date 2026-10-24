import { describe, expect, test } from "bun:test";
import { appRedirectUrl, appUrl, marketingUrl, publicAppUrl, publicMarketingUrl } from "./deployment";

describe("product app deployment URLs", () => {
  test("defaults to local split origins outside production", () => {
    const env = { NODE_ENV: "development" } as unknown as NodeJS.ProcessEnv;

    expect(appUrl(env)).toBe("http://127.0.0.1:3210");
    expect(marketingUrl(env)).toBe("http://127.0.0.1:3212");
    expect(new URL("/waitlist/bestaetigt", publicMarketingUrl(env)).href).toBe("http://127.0.0.1:3212/waitlist/bestaetigt");
  });

  test("ignores stale local marketing URLs from the pre-split dev port", () => {
    const env = {
      NODE_ENV: "development",
      NEXT_PUBLIC_MARKETING_URL: "http://localhost:3000/",
    } as unknown as NodeJS.ProcessEnv;

    expect(publicMarketingUrl(env)).toBe("http://127.0.0.1:3212");
  });

  test("defaults to the private app and public marketing origins in production", () => {
    const env = { NODE_ENV: "production" } as unknown as NodeJS.ProcessEnv;

    expect(appUrl(env)).toBe("https://bloommd.app");
    expect(marketingUrl(env)).toBe("https://bloommd.io");
  });

  test("uses explicit split URLs without trailing slashes", () => {
    const env = {
      NEXT_PUBLIC_SITE_URL: "https://bloommd.app/",
      NEXT_PUBLIC_APP_URL: "https://app.example.test/",
      NEXT_PUBLIC_MARKETING_URL: "https://marketing.example.test/",
    } as unknown as NodeJS.ProcessEnv;

    expect(appUrl(env)).toBe("https://app.example.test");
    expect(marketingUrl(env)).toBe("https://marketing.example.test");
  });

  test("does not expose localhost as the public app origin in production", () => {
    const env = {
      NODE_ENV: "production",
      NEXT_PUBLIC_SITE_URL: "http://localhost:3000/",
      NEXT_PUBLIC_APP_URL: "http://localhost:3000/",
    } as unknown as NodeJS.ProcessEnv;

    expect(publicAppUrl(env)).toBe("https://bloommd.app");
  });

  test("does not expose localhost as the public marketing origin from the app in production", () => {
    const env = {
      NODE_ENV: "production",
      NEXT_PUBLIC_SITE_URL: "https://bloommd.app",
      NEXT_PUBLIC_APP_URL: "https://bloommd.app",
      NEXT_PUBLIC_MARKETING_URL: "http://localhost:3000/",
    } as unknown as NodeJS.ProcessEnv;

    expect(publicMarketingUrl(env)).toBe("https://bloommd.io");
    expect(new URL("/waitlist/bestaetigt", publicMarketingUrl(env)).href).toBe("https://bloommd.io/waitlist/bestaetigt");
  });

  test("builds production redirects from the public app origin", () => {
    const env = {
      NODE_ENV: "production",
      NEXT_PUBLIC_SITE_URL: "https://bloommd.app",
      NEXT_PUBLIC_APP_URL: "https://bloommd.app",
    } as unknown as NodeJS.ProcessEnv;

    expect(String(appRedirectUrl("/login?verified=1", "https://localhost:3000/api/auth/verify-email", env))).toBe("https://bloommd.app/login?verified=1");
  });

  test("keeps local redirects on the incoming request origin", () => {
    const env = { NODE_ENV: "development" } as unknown as NodeJS.ProcessEnv;

    expect(String(appRedirectUrl("/app", "http://127.0.0.1:3210/api/auth/login", env))).toBe("http://127.0.0.1:3210/app");
  });

  test("keeps Docker rehearsal redirects on the loopback request origin", () => {
    const env = {
      NODE_ENV: "production",
      BLOOMMD_LOCAL_DEPLOYMENT: "1",
      NEXT_PUBLIC_SITE_URL: "http://localhost:33000",
      NEXT_PUBLIC_APP_URL: "http://localhost:33000",
    } as unknown as NodeJS.ProcessEnv;

    expect(String(appRedirectUrl("/app", "http://localhost:3000/api/auth/login", env))).toBe("http://localhost:33000/app");
  });
});
