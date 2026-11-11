import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Small reader and validator for `openapi/svc-v1.yaml`, enough for the contract tests: `$ref`, `type` (also
 * lists with "null"), `enum`, `required`, `properties`, `items`, `additionalProperties` and the formats
 * `uuid` and `date-time`. The answers of the handlers are checked against the schemas of the file, so the
 * file cannot drift from the code unnoticed (ADR 3: contract tests on both sides; the app side
 * validates its client against the same file).
 */
export interface Spec {
  paths: Record<string, Record<string, { operationId?: string; security?: unknown[]; responses: Record<string, { $ref?: string; content?: { "application/json"?: { schema?: unknown } } }> }>>;
  components: { schemas: Record<string, unknown>; responses: Record<string, { content?: { "application/json"?: { schema?: unknown } } }> };
  security?: unknown[];
}

export function loadSpec(): Spec {
  const text = readFileSync(join(import.meta.dir, "..", "..", "openapi", "svc-v1.yaml"), "utf8");
  return Bun.YAML.parse(text) as Spec;
}

const METHODS = ["get", "post", "put", "patch", "delete"] as const;

/** All operations as `METHOD /path/{param}`. */
export function operations(spec: Spec): string[] {
  return Object.entries(spec.paths).flatMap(([path, item]) => METHODS.filter((method) => item[method]).map((method) => `${method.toUpperCase()} ${path}`));
}

/** Finds the path template of a concrete path (`/svc/v1/users/<uuid>/access` -> `/svc/v1/users/{id}/access`). */
export function templateOf(spec: Spec, path: string): string | null {
  for (const template of Object.keys(spec.paths)) {
    const pattern = new RegExp(`^${template.replace(/\{[^}]+\}/g, "[^/]+")}$`);
    if (pattern.test(path)) return template;
  }
  return null;
}

type Schema = { $ref?: string; type?: string | string[]; enum?: unknown[]; required?: string[]; properties?: Record<string, Schema>; items?: Schema; additionalProperties?: Schema | boolean; format?: string };

function resolve(spec: Spec, schema: Schema): Schema {
  if (!schema.$ref) return schema;
  const [, , group, name] = schema.$ref.split("/");
  const target = (spec.components as unknown as Record<string, Record<string, Schema>>)[group!]?.[name!];
  if (!target) throw new Error(`unresolved reference ${schema.$ref}`);
  return resolve(spec, target);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function typeOf(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (Number.isInteger(value)) return "integer";
  return typeof value;
}

export function validate(spec: Spec, schemaInput: unknown, value: unknown, at = "$"): string[] {
  const schema = resolve(spec, schemaInput as Schema);
  const problems: string[] = [];
  if (schema.type) {
    const allowed = Array.isArray(schema.type) ? schema.type : [schema.type];
    const actual = typeOf(value);
    const fits = allowed.includes(actual) || (actual === "integer" && allowed.includes("number"));
    if (!fits) return [`${at}: expected ${allowed.join("|")}, got ${actual}`];
  }
  if (schema.enum && !schema.enum.includes(value)) problems.push(`${at}: ${JSON.stringify(value)} is not one of ${JSON.stringify(schema.enum)}`);
  if (typeof value === "string") {
    if (schema.format === "uuid" && !UUID.test(value)) problems.push(`${at}: not a uuid`);
    if (schema.format === "date-time" && Number.isNaN(Date.parse(value))) problems.push(`${at}: not a date-time`);
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    for (const key of schema.required ?? []) if (!(key in record)) problems.push(`${at}: missing "${key}"`);
    for (const [key, child] of Object.entries(schema.properties ?? {})) if (key in record) problems.push(...validate(spec, child, record[key], `${at}.${key}`));
    if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
      for (const [key, entry] of Object.entries(record)) if (!(key in (schema.properties ?? {}))) problems.push(...validate(spec, schema.additionalProperties, entry, `${at}.${key}`));
    }
  }
  if (Array.isArray(value) && schema.items) value.forEach((entry, index) => problems.push(...validate(spec, schema.items, entry, `${at}[${index}]`)));
  return problems;
}

/** The JSON schema documented for an operation and status, or `undefined` when the status has no body schema. */
export function responseSchema(spec: Spec, template: string, method: string, status: number): { documented: boolean; schema?: unknown } {
  const operation = spec.paths[template]?.[method.toLowerCase() as (typeof METHODS)[number]];
  const response = operation?.responses[String(status)];
  if (!response) return { documented: false };
  const resolved = response.$ref ? spec.components.responses[response.$ref.split("/").pop()!] : response;
  return { documented: true, schema: resolved?.content?.["application/json"]?.schema };
}
