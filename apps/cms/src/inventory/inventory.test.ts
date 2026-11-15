import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import config from "@payload-config";
import { allowRoles, anyOperator } from "../access";
import { operatorReq } from "../testing/operator-req";
import { ALLOWED_ROUTE_FILES, IGNORED_APP_FILES, PROBES } from "./routes";

process.env.PAYLOAD_SECRET ||= "inventory-test-secret-inventory-test-secret";

/**
 * Inventory test (ADR 3, layer 5). Three parts, each fails for every unknown entry:
 * 1. route and page files under `src/app` against the positive list (no GraphQL route files);
 * 2. every REST endpoint Payload registers from the resolved configuration against a stored list;
 * 3. every collection and global denies by default (explicit access functions, false for anybody who
 *    is not an operator).
 * The live HTTP probe is `scripts/probe-routes.ts` with the same list (`PROBES`).
 */
const appDir = join(import.meta.dir, "..", "app");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [relative(appDir, full)];
  });
}

describe("1. route files", () => {
  const files = walk(appDir).filter((file) => !(IGNORED_APP_FILES as readonly string[]).includes(file));

  test("every file under src/app is on the positive list and the list has no stale entry", () => {
    expect(files.sort()).toEqual([...ALLOWED_ROUTE_FILES].sort());
  });

  test("the route files of GraphQL and the playground do not exist (graphQL.disable alone does not close the playground)", () => {
    expect(files.filter((file) => /graphql/i.test(file))).toEqual([]);
  });

  test("the probe list covers every /svc/v1 route file", () => {
    const probed = PROBES.map((probe) => probe.path.split("?")[0] ?? "");
    for (const file of ALLOWED_ROUTE_FILES.filter((f) => f.startsWith("svc/"))) {
      const pattern = new RegExp(`^/${file.replace(/\/route\.ts$/, "").replace(/\[[^\]]+\]/g, "[^/]+")}$`);
      expect(probed.some((path) => pattern.test(path))).toBe(true);
    }
  });
});

describe("2. endpoints of the resolved Payload configuration", () => {
  test("the registered endpoints match the stored list; GraphQL is off", async () => {
    const resolved = await config;
    const lines = new Set<string>();
    for (const endpoint of resolved.endpoints) lines.add(`${endpoint.method.toUpperCase()} /api${endpoint.path}`);
    for (const collection of resolved.collections) {
      for (const endpoint of collection.endpoints || []) lines.add(`${endpoint.method.toUpperCase()} /api/${collection.slug}${endpoint.path}`);
    }
    for (const global of resolved.globals) {
      for (const endpoint of global.endpoints || []) lines.add(`${endpoint.method.toUpperCase()} /api/globals/${global.slug}${endpoint.path}`);
    }
    const actual = [...lines].sort();
    const storedPath = join(import.meta.dir, "payload-endpoints.txt");
    if (process.env.UPDATE_INVENTORY === "1") writeFileSync(storedPath, `${actual.join("\n")}\n`);
    const stored = readFileSync(storedPath, "utf8").trim().split("\n");
    expect(actual).toEqual(stored);
    expect(resolved.graphQL.disable).toBe(true);
    expect(actual.filter((line) => /graphql/i.test(line))).toEqual([]);
  });
});

describe("3. every collection and global denies by default", () => {
  const anonymous = { req: { user: null } } as never;
  const outsider = { req: { user: { collection: "users", id: "u", role: "admin" } } } as never;
  const operator = (role: string) => operatorReq(role);
  const OPERATIONS = ["create", "read", "update", "delete", "readVersions"] as const;

  test("each collection lists the operations explicitly and denies anonymous callers and end users", async () => {
    const resolved = await config;
    for (const collection of resolved.collections.filter((c) => !c.slug.startsWith("payload-"))) {
      for (const operation of OPERATIONS) {
        const access = (collection.access as Record<string, unknown>)[operation] as ((args: never) => unknown) | undefined;
        expect(typeof access, `${collection.slug}.access.${operation} is explicit`).toBe("function");
        expect(await access!(anonymous), `${collection.slug}.${operation} for anonymous`).toBe(false);
        expect(await access!(outsider), `${collection.slug}.${operation} for an end user`).toBe(false);
      }
    }
  });

  test("Payload's internal collections give nothing to anonymous callers", async () => {
    const resolved = await config;
    for (const collection of resolved.collections.filter((c) => c.slug.startsWith("payload-"))) {
      for (const operation of ["create", "read", "update", "delete"] as const) {
        const access = (collection.access as Record<string, unknown>)[operation] as ((args: never) => unknown) | undefined;
        if (typeof access === "function") expect(Boolean(await access(anonymous)), `${collection.slug}.${operation}`).toBe(false);
      }
    }
  });

  test("each global denies reading and updating without an operator", async () => {
    const resolved = await config;
    for (const global of resolved.globals) {
      for (const operation of ["read", "update"] as const) {
        const access = (global.access as Record<string, unknown>)[operation] as (args: never) => unknown;
        expect(await access(anonymous), `${global.slug}.${operation}`).toBe(false);
        expect(await access(outsider), `${global.slug}.${operation} end user`).toBe(false);
      }
    }
  });

  test("auth collections close unlock; end users cannot enter the admin UI", async () => {
    const resolved = await config;
    const users = resolved.collections.find((c) => c.slug === "users")!;
    const operators = resolved.collections.find((c) => c.slug === "operators")!;
    expect(await (users.access.admin as (a: never) => unknown)(operator("admin"))).toBe(false);
    expect(await (users.access.unlock as (a: never) => unknown)(anonymous)).toBe(false);
    expect(await (operators.access.admin as (a: never) => unknown)(operator("editor"))).toBe(true);
    expect(await (operators.access.admin as (a: never) => unknown)(anonymous)).toBe(false);
    expect(await (operators.access.admin as (a: never) => unknown)(outsider)).toBe(false);
  });

  test("operator roles: admin sees everything, support sees accounts read-only, editor only content", async () => {
    const resolved = await config;
    const access = (slug: string, operation: string) => (resolved.collections.find((c) => c.slug === slug)!.access as Record<string, (a: never) => unknown>)[operation]!;
    expect(await access("users", "read")(operator("admin"))).toBe(true);
    expect(await access("users", "read")(operator("support"))).toBe(true);
    expect(await access("users", "read")(operator("editor"))).toBe(false);
    expect(await access("users", "update")(operator("support"))).toBe(false);
    expect(await access("users", "create")(operator("admin"))).toBe(true);
    expect(await access("blog", "create")(operator("editor"))).toBe(true);
    expect(await access("blog", "create")(operator("support"))).toBe(false);
    expect(await access("news", "read")(operator("support"))).toBe(true);
    expect(await access("auth-tokens", "read")(operator("admin"))).toBe(false);
    expect(await access("read-tokens", "create")(operator("admin"))).toBe(false);
    expect(await access("read-tokens", "read")(operator("admin"))).toBe(true);
    expect(await access("read-tokens", "read")(operator("editor"))).toBe(false);
    expect(await access("operators", "create")(operator("editor"))).toBe(false);
  });

  test("the role helpers ignore unknown roles", async () => {
    expect(await allowRoles("admin")(operatorReq("root"))).toBe(false);
    expect(await anyOperator(operatorReq("editor"))).toBe(true);
  });
});

describe("4. a session without the second factor, and a blocked operator, have no role", () => {
  test("every operation of every collection and global denies, in the admin UI and over REST alike", async () => {
    const resolved = await config;
    const cases = [operatorReq("admin", { mfa: false }), operatorReq("admin", { blocked: true })];
    for (const args of cases) {
      for (const collection of resolved.collections.filter((c) => !c.slug.startsWith("payload-"))) {
        for (const operation of ["create", "read", "update", "delete", "readVersions", "unlock", "admin"] as const) {
          if ((operation === "unlock" || operation === "admin") && !collection.auth) continue;
          const access = (collection.access as Record<string, unknown>)[operation] as ((a: never) => unknown) | undefined;
          if (typeof access !== "function") continue;
          const result = await access(args);
          // The only exception: a signed-in operator reads their own record without the second factor (Payload's "me").
          const ownRecordOnly = collection.slug === "operators" && operation === "read" && args === cases[0];
          if (ownRecordOnly) expect(result, "operators.read is the own record only").toEqual({ id: { equals: "o" } });
          else expect(result, `${collection.slug}.${operation}`).toBe(false);
        }
      }
      for (const global of resolved.globals) {
        for (const operation of ["read", "update"] as const) {
          const access = (global.access as Record<string, (a: never) => unknown>)[operation]!;
          expect(await access(args), `${global.slug}.${operation}`).toBe(false);
        }
      }
    }
  });

  test("the cookie of another operator or another session does not count", async () => {
    const resolved = await config;
    const read = (resolved.collections.find((c) => c.slug === "users")!.access as Record<string, (a: never) => unknown>).read!;
    expect(await read(operatorReq("admin", { id: "a" }))).toBe(true);
    const foreign = operatorReq("admin", { id: "b" }) as unknown as { req: { headers: Headers } };
    const mixed = { req: { user: { collection: "operators", id: "a", role: "admin" }, headers: foreign.req.headers } };
    expect(await read(mixed as never)).toBe(false);
  });
});
