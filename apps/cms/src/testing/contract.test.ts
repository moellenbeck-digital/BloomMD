import { describe, expect, test } from "bun:test";
import { ALLOWED_ROUTE_FILES } from "../inventory/routes";
import { loadSpec, operations, templateOf, validate } from "./openapi";

/**
 * The OpenAPI file and the route files describe the same interface (ADR 3). Part 1 here needs no
 * database; part 2 (the answers of the handlers against the schemas) is in `svc.db.test.ts`.
 */
const spec = loadSpec();
const routeFiles = ALLOWED_ROUTE_FILES.filter((file) => file.startsWith("svc/v1/"));
const toTemplate = (file: string) => `/${file.replace(/\/route\.ts$/, "").replace(/\[([^\]]+)\]/g, "{$1}")}`;

describe("OpenAPI contract of /svc/v1", () => {
  test("every documented path is a route file and every route file is documented", () => {
    const documented = Object.keys(spec.paths).sort();
    // `content/{kind}` and `users/{id}` use the same parameter names in the file system and in the spec.
    expect(routeFiles.map(toTemplate).sort()).toEqual(documented);
  });

  test("every documented method is exported by its route file, and no other method is", async () => {
    for (const file of routeFiles) {
      const module = (await import(`../app/${file}`)) as Record<string, unknown>;
      const exported = ["GET", "POST", "PUT", "PATCH", "DELETE"].filter((verb) => typeof module[verb] === "function");
      const item = spec.paths[toTemplate(file)] as Record<string, unknown>;
      const documented = ["get", "post", "put", "patch", "delete"].filter((verb) => item[verb]).map((verb) => verb.toUpperCase());
      expect(exported.sort(), file).toEqual(documented.sort());
    }
  });

  test("the endpoints of the ADR table are there, except payment-refs and refund-requests (#368, #276)", () => {
    expect(operations(spec).sort()).toEqual(
      [
        "GET /svc/v1/content/{kind}",
        "GET /svc/v1/health/ready",
        "GET /svc/v1/users",
        "GET /svc/v1/users/{id}/access",
        "GET /svc/v1/users/{id}/export",
        "POST /svc/v1/auth/login",
        "POST /svc/v1/password-resets",
        "POST /svc/v1/tokens/redeem",
        "POST /svc/v1/users",
        "POST /svc/v1/users/{id}/deletion",
      ].sort(),
    );
    expect(Object.keys(spec.paths).some((path) => /payment-refs|refund-requests/.test(path))).toBe(false);
  });

  test("signature is the default security; only health and content differ", () => {
    expect(spec.security).toEqual([{ appSignature: [] }]);
    const overridden = Object.entries(spec.paths).flatMap(([path, item]) => Object.values(item).filter((operation) => operation.security).map(() => path));
    expect(overridden.sort()).toEqual(["/svc/v1/content/{kind}", "/svc/v1/health/ready"]);
  });

  test("every error response names `error` and `requestId`", () => {
    const schema = (spec.components.schemas as Record<string, { required?: string[] }>).Error;
    expect(schema?.required).toEqual(["error", "requestId"]);
  });

  test("the validator rejects what it should", () => {
    const access = { $ref: "#/components/schemas/AccessState" };
    expect(validate(spec, access, {})).not.toEqual([]);
    expect(validate(spec, { $ref: "#/components/schemas/Error" }, { error: "x", requestId: "r" })).toEqual([]);
    expect(validate(spec, { $ref: "#/components/schemas/Error" }, { error: 1, requestId: "r" })).not.toEqual([]);
    expect(templateOf(spec, "/svc/v1/users/00000000-0000-4000-8000-000000000000/access")).toBe("/svc/v1/users/{id}/access");
    expect(templateOf(spec, "/svc/v1/nope")).toBeNull();
  });
});
