import { beforeEach, describe, expect, mock, test } from "bun:test";

let revokeCalls = 0;

const actualAuth = await import("../../../../lib/auth");
mock.module("../../../../lib/auth", () => ({
  ...actualAuth,
  revokeCurrentSession: async () => {
    revokeCalls += 1;
    return true;
  },
}));

const { POST } = await import("./route");

const URL_ = "https://app.bloommd.test/api/auth/logout";
const ORIGIN = "https://app.bloommd.test";

function logoutRequest(init: { origin?: string | null; contentType?: string; body?: string } = {}) {
  const headers: Record<string, string> = { Cookie: `${actualAuth.sessionCookieName()}=session-token` };
  if (init.origin !== null) headers.Origin = init.origin ?? ORIGIN;
  if (init.contentType) headers["Content-Type"] = init.contentType;
  return new Request(URL_, { method: "POST", headers, body: init.body });
}

function expectLoggedOut(response: Response) {
  expect(revokeCalls).toBe(1);
  const cookie = (response as import("next/server").NextResponse).cookies.get(actualAuth.sessionCookieName());
  expect(cookie?.value).toBe("");
  expect(cookie?.maxAge).toBe(0);
}

describe("POST /api/auth/logout", () => {
  beforeEach(() => {
    revokeCalls = 0;
  });

  test("without body and Content-Type it ends the session and redirects to /", async () => {
    const response = await POST(logoutRequest());
    expect(response.status).toBe(303);
    expect(new URL(response.headers.get("location") ?? "").pathname).toBe("/");
    expectLoggedOut(response);
  });

  test("a JSON body does not break the logout", async () => {
    const response = await POST(logoutRequest({ contentType: "application/json", body: JSON.stringify({ next: "/account" }) }));
    expect(response.status).toBe(303);
    expect(new URL(response.headers.get("location") ?? "").pathname).toBe("/");
    expectLoggedOut(response);
  });

  test("an empty urlencoded body redirects to /", async () => {
    const response = await POST(logoutRequest({ contentType: "application/x-www-form-urlencoded", body: "" }));
    expect(response.status).toBe(303);
    expect(new URL(response.headers.get("location") ?? "").pathname).toBe("/");
    expectLoggedOut(response);
  });

  test("a urlencoded next field is still honoured", async () => {
    const response = await POST(logoutRequest({ contentType: "application/x-www-form-urlencoded", body: "next=/account" }));
    expect(response.status).toBe(303);
    expect(new URL(response.headers.get("location") ?? "").pathname).toBe("/account");
    expectLoggedOut(response);
  });

  test("a foreign next target falls back to /", async () => {
    const response = await POST(logoutRequest({ contentType: "application/x-www-form-urlencoded", body: "next=//evil.example" }));
    expect(response.status).toBe(303);
    expect(new URL(response.headers.get("location") ?? "").pathname).toBe("/");
  });

  test("a foreign origin is rejected and the session stays", async () => {
    const response = await POST(logoutRequest({ origin: "https://evil.example" }));
    expect(response.status).toBe(403);
    expect(revokeCalls).toBe(0);
  });

  test("a missing origin is rejected", async () => {
    const response = await POST(logoutRequest({ origin: null }));
    expect(response.status).toBe(403);
    expect(revokeCalls).toBe(0);
  });
});
