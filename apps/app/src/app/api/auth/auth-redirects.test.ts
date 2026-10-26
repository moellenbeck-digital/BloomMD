import { afterEach, describe, expect, test } from "bun:test";
import { resetMemoryRateLimitsForTests } from "../../../lib/request-security";
import { POST as login } from "./login/route";
import { POST as signup } from "./signup/route";
import { GET as verifyEmail } from "./verify-email/route";

const originalEnv = {
  BLOOMMD_BETA_ACCESS: process.env.BLOOMMD_BETA_ACCESS,
  BLOOMMD_BETA_INVITE_CODES: process.env.BLOOMMD_BETA_INVITE_CODES,
  DATABASE_URL: process.env.DATABASE_URL,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  NODE_ENV: process.env.NODE_ENV,
};

function setEnvValue(key: string, value: string) {
  (process.env as Record<string, string | undefined>)[key] = value;
}

function deleteEnvValue(key: string) {
  delete (process.env as Record<string, string | undefined>)[key];
}

function restoreEnvValue(key: keyof typeof originalEnv) {
  const value = originalEnv[key];
  if (value == null) deleteEnvValue(key);
  else setEnvValue(key, value);
}

function configureProductionAuth() {
  setEnvValue("NODE_ENV", "production");
  setEnvValue("NEXT_PUBLIC_SITE_URL", "https://bloommd.app");
  setEnvValue("NEXT_PUBLIC_APP_URL", "https://bloommd.app");
  setEnvValue("BLOOMMD_BETA_ACCESS", "1");
  setEnvValue("BLOOMMD_BETA_INVITE_CODES", "real-test-code");
  deleteEnvValue("DATABASE_URL");
}

function formRequest(path: string, form: Record<string, string>) {
  return new Request(`https://localhost:3000${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Origin: "https://bloommd.app",
      "X-Forwarded-For": `203.0.113.${Math.floor(Math.random() * 200) + 1}`,
    },
    body: new URLSearchParams({ website: "", formStartedAt: String(Date.now() - 1_000), ...form }),
  });
}

afterEach(() => {
  for (const key of Object.keys(originalEnv) as Array<keyof typeof originalEnv>) restoreEnvValue(key);
  resetMemoryRateLimitsForTests();
});

describe("production auth redirects", () => {
  test("signup errors use the public app origin, not the incoming localhost origin", async () => {
    configureProductionAuth();

    const response = await signup(formRequest("/api/auth/signup", {
      email: "blocked@example.test",
      password: "Testpass12345",
      acceptTerms: "1",
      inviteCode: "",
      next: "/app",
    }));

    expect(response.status).toBe(303);
    const location = response.headers.get("location") ?? "";
    expect(location.startsWith("https://bloommd.app/signup?")).toBe(true);
    expect(location).not.toContain("localhost");
    expect(decodeURIComponent(location)).toContain("email=blocked@example.test");
    expect(decodeURIComponent(location)).toContain("Diese E-Mail ist noch nicht für die Beta freigeschaltet.");
  });

  test("login errors use the public app origin, not the incoming localhost origin", async () => {
    configureProductionAuth();

    const response = await login(formRequest("/api/auth/login", {
      email: "missing@example.test",
      password: "Testpass12345",
      next: "/app",
    }));

    expect(response.status).toBe(303);
    const location = response.headers.get("location") ?? "";
    expect(location.startsWith("https://bloommd.app/login?")).toBe(true);
    expect(location).not.toContain("localhost");
  });

  test("verification redirects use the public app origin, not the incoming localhost origin", async () => {
    configureProductionAuth();

    const response = await verifyEmail(new Request("https://localhost:3000/api/auth/verify-email?token=invalid", {
      headers: { "X-Forwarded-For": "203.0.113.240" },
    }));

    expect(response.status).toBe(303);
    const location = response.headers.get("location") ?? "";
    expect(location.startsWith("https://bloommd.app/login?")).toBe(true);
    expect(location).not.toContain("localhost");
  });
});
