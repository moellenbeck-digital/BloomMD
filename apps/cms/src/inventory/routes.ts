/**
 * Positive list of everything the CMS may answer (ADR 3, layer 5: inventory test). `inventory.test.ts`
 * fails for every route file or Payload endpoint that is not listed here; `scripts/probe-routes.ts`
 * asks a running service and fails for every status that deviates. A new route is a conscious change of
 * this file and of the OpenAPI description.
 */

/** Every file below `src/app` that makes a route or a page, relative to `src/app`. */
export const ALLOWED_ROUTE_FILES = [
  "(payload)/admin/[[...segments]]/not-found.tsx",
  "(payload)/admin/[[...segments]]/page.tsx",
  "(payload)/api/[...slug]/route.ts",
  "(payload)/layout.tsx",
  "svc/v1/auth/login/route.ts",
  "svc/v1/content/[kind]/route.ts",
  "svc/v1/health/ready/route.ts",
  "svc/v1/password-resets/route.ts",
  "svc/v1/tokens/redeem/route.ts",
  "svc/v1/users/[id]/access/route.ts",
  "svc/v1/users/[id]/deletion/route.ts",
  "svc/v1/users/[id]/export/route.ts",
  "svc/v1/users/route.ts",
] as const;

/** Files below `src/app` that are neither routes nor pages (generated import map, styles). */
export const IGNORED_APP_FILES = ["(payload)/admin/importMap.js", "(payload)/custom.scss"] as const;

export interface Probe {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  /** Accepted statuses without any sign-in, signature or token. */
  expect: number[];
}

const ID = "00000000-0000-4000-8000-000000000000";

export const PROBES: Probe[] = [
  // Admin UI and the sign-in paths of the operators are reachable.
  { method: "GET", path: "/admin/login", expect: [200] },
  { method: "GET", path: "/api/operators/me", expect: [200] },
  { method: "POST", path: "/api/operators/login", expect: [400, 401] },
  // /svc/v1 without signature or token: 401; health is open and carries no data.
  { method: "GET", path: "/svc/v1/health/ready", expect: [200] },
  { method: "POST", path: "/svc/v1/auth/login", expect: [401] },
  { method: "POST", path: "/svc/v1/users", expect: [401] },
  { method: "GET", path: `/svc/v1/users?ids=${ID}`, expect: [401] },
  { method: "GET", path: `/svc/v1/users/${ID}/access`, expect: [401] },
  { method: "GET", path: `/svc/v1/users/${ID}/export`, expect: [401] },
  { method: "POST", path: `/svc/v1/users/${ID}/deletion`, expect: [401] },
  { method: "POST", path: "/svc/v1/tokens/redeem", expect: [401] },
  { method: "POST", path: "/svc/v1/password-resets", expect: [401] },
  { method: "GET", path: "/svc/v1/content/blog", expect: [401] },
  { method: "GET", path: "/svc/v1/content/news", expect: [401] },
  // Everything else is 404: no sessionless REST, no GraphQL, no routes that do not exist.
  ...[
    "/",
    "/robots.txt",
    "/api",
    "/api/users",
    "/api/users/login",
    "/api/users/forgot-password",
    "/api/users/first-register",
    "/api/users/me",
    "/api/operators",
    "/api/operators/first-register",
    "/api/operators/forgot-password",
    "/api/blog",
    "/api/news",
    "/api/media",
    "/api/entitlements",
    "/api/auth-tokens",
    "/api/read-tokens",
    "/api/trial-reminders",
    "/api/globals/platform-settings",
    "/api/access",
    "/api/payload-preferences/x",
    "/api/payload-jobs/run",
    "/api/graphql",
    "/api/graphql-playground",
    "/api/openapi.json",
    "/svc",
    "/svc/v1",
    "/svc/v1/nope",
    "/svc/v1/content/users",
    "/svc/v1/content",
    "/svc/v2/health/ready",
  ].map((path): Probe => ({ method: "GET", path, expect: [404] })),
  { method: "POST", path: "/api/users", expect: [404] },
  { method: "POST", path: "/api/graphql", expect: [404] },
  { method: "PATCH", path: `/api/users/${ID}`, expect: [404] },
  { method: "DELETE", path: `/api/users/${ID}`, expect: [404] },
];
