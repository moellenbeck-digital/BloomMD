import { describe, expect, test } from "bun:test";
import { createRestGuard, decideRestAccess } from "./rest-guard";

describe("guard in front of /api (ADR 3, layer 4)", () => {
  test("without an operator session everything is 404 except the operator sign-in paths", () => {
    for (const path of ["/api/users", "/api/users/abc", "/api/blog", "/api/news", "/api/media", "/api/auth-tokens", "/api/read-tokens", "/api/operators", "/api/globals/platform-settings", "/api/access", "/api/payload-preferences/x", "/api/payload-jobs/run"]) {
      expect(decideRestAccess(path, false)).toBe("not_found");
    }
    for (const path of ["/api/operators/login", "/api/operators/logout", "/api/operators/me", "/api/operators/refresh-token"]) {
      expect(decideRestAccess(path, false)).toBe("allow");
    }
  });

  test("other operator paths stay closed: first-register, init, password reset", () => {
    for (const name of ["first-register", "init", "forgot-password", "reset-password", "unlock", "verify/abc"]) {
      expect(decideRestAccess(`/api/operators/${name}`, false)).toBe("not_found");
    }
  });

  test("an operator session opens the REST API for the admin UI", () => {
    for (const path of ["/api/users", "/api/blog/1", "/api/media", "/api/access", "/api/globals/platform-settings", "/api/operators"]) {
      expect(decideRestAccess(path, true)).toBe("allow");
    }
  });

  test("the default auth endpoints of users are closed even for operators", () => {
    for (const name of ["login", "logout", "me", "refresh-token", "forgot-password", "reset-password", "first-register", "init", "unlock", "verify/token123"]) {
      expect(decideRestAccess(`/api/users/${name}`, true)).toBe("not_found");
      expect(decideRestAccess(`/api/users/${name}/`, true)).toBe("not_found");
    }
  });

  test("GraphQL paths are never allowed (also without route files)", () => {
    expect(decideRestAccess("/api/graphql", false)).toBe("not_found");
    expect(decideRestAccess("/api/graphql-playground", false)).toBe("not_found");
  });

  test("the guard calls the handler only when allowed and looks up the session only when it matters", async () => {
    let lookups = 0;
    const guarded = createRestGuard(async (headers) => {
      lookups += 1;
      return headers.get("x-op") === "1";
    })(async () => new Response("ok"));
    const call = (path: string, op = false) => guarded(new Request(`http://cms.test${path}`, { headers: op ? { "x-op": "1" } : {} }), undefined as never);
    expect((await call("/api/users")).status).toBe(404);
    expect(lookups).toBe(1);
    expect((await call("/api/users", true)).status).toBe(200);
    expect((await call("/api/operators/login")).status).toBe(200);
    expect(lookups).toBe(2);
    expect((await call("/api/users/login", true)).status).toBe(404);
    expect(lookups).toBe(2);
    const failing = createRestGuard(async () => {
      throw new Error("db down");
    })(async () => new Response("ok"));
    expect((await failing(new Request("http://cms.test/api/users"), undefined as never)).status).toBe(404);
  });
});
