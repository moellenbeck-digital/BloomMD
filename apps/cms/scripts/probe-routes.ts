/**
 * HTTP probe of the inventory (ADR 3, layer 5, part 3): asks a running CMS for every path of the positive
 * list without any sign-in, signature or token and fails for every status that deviates. Usage:
 * `bun run scripts/probe-routes.ts http://127.0.0.1:3300`. An operator must exist (the login page).
 */
import { PROBES } from "../src/inventory/routes";

const base = (process.argv[2] ?? "http://127.0.0.1:3300").replace(/\/$/, "");
let failures = 0;

for (const probe of PROBES) {
  const init: RequestInit = { method: probe.method, redirect: "manual" };
  if (probe.method === "POST" || probe.method === "PATCH") {
    init.headers = { "content-type": "application/json" };
    init.body = "{}";
  }
  let status = 0;
  try {
    status = (await fetch(base + probe.path, init)).status;
  } catch (error) {
    console.error(`FAIL ${probe.method} ${probe.path}: ${error instanceof Error ? error.message : String(error)}`);
    failures += 1;
    continue;
  }
  const ok = probe.expect.includes(status);
  if (!ok) failures += 1;
  console.log(`${ok ? "ok  " : "FAIL"} ${probe.method.padEnd(6)} ${probe.path} -> ${status}${ok ? "" : ` (expected ${probe.expect.join("|")})`}`);
}

// Answers of /svc/v1 carry a request ID and are never cached.
const login = await fetch(`${base}/svc/v1/auth/login`, { method: "POST", body: "{}" });
const body = (await login.json()) as { requestId?: string };
if (!body.requestId || login.headers.get("cache-control") !== "no-store" || !login.headers.get("x-request-id")) {
  console.error("FAIL /svc/v1 answers need requestId, X-Request-Id and Cache-Control: no-store");
  failures += 1;
}

console.log(failures === 0 ? `probe: ${PROBES.length} paths as expected` : `probe: ${failures} deviation(s)`);
process.exit(failures === 0 ? 0 : 1);
