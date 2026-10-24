export interface SmokeOptions {
  marketingUrl: string;
  appUrl: string;
  timeoutMs: number;
  waitlistEmail?: string;
  expectedSha?: string;
  expectedOpenClawPluginVersion?: string;
  json: boolean;
}

export interface SmokeCheck {
  name: string;
  url: string;
  expected: string;
  actual: string;
  status: "pass" | "fail";
  detail?: string;
}

export type SmokeFetcher = (url: string, init: RequestInit, timeoutMs: number) => Promise<Response>;

const MARKETING_PUBLIC_PATHS = [
  "/",
  "/demo",
  "/templates",
  "/docs",
  "/download",
  "/impressum",
  "/datenschutz",
  "/agb",
  "/widerruf",
  "/cookies",
  "/lizenz",
  "/leistungen",
];
const DESKTOP_DMG_PATH = "/_desktop-updates/stable-macos-arm64-BloomMD.dmg";
const MARKETING_APP_ONLY_PATHS = ["/app", "/login", "/signup", "/account", "/api/mindmaps", "/api/sync-ticket"];
const MARKETING_LEGAL_CONTENT_PATHS = ["/impressum", "/datenschutz", "/agb", "/widerruf"];
const APP_PUBLIC_PATHS = ["/", "/api/health/ready", "/app", "/login", "/signup", "/account"];
const APP_MARKETING_PAGE_PATHS = ["/demo", "/docs", "/templates", "/waitlist/bestaetigt"];
const APP_MARKETING_API_PATHS = ["/api/waitlist"];
const APP_DISABLED_BILLING_PATHS = ["/api/billing/checkout", "/api/billing/portal", "/api/billing/webhook"];
const SOURCE_MAP_PATH = "/_next/static/chunks/bloommd-production-smoke.js.map";
const LEGAL_PLACEHOLDER_PATTERN = /Noch einzutragen|Max Mustermann|Musterstra(?:ss|ß)e|Musterstadt|example\.[a-z]+|placeholder|platzhalter|todo|tbd/i;
const SIGNUP_FAILURE_PATTERN = /DATABASE_URL ist noch nicht konfiguriert|NEXT_REDIRECT|Registrierung fehlgeschlagen/i;

function usage() {
  return `BloomMD production smoke

Usage:
  bun run qa:production-smoke [options]

Options:
  --marketing-url <url>     Marketing origin (default: https://bloommd.io)
  --app-url <url>           Private app origin (default: https://bloommd.app)
  --waitlist-email <email>  Also submit the marketing waitlist form with this explicit test address
  --expected-sha <sha>      Require app and marketing /api/version to report this Git SHA
  --expected-openclaw-plugin-version <version>
                            Require latest and immutable plugin downloads to report this version
  --timeout-ms <ms>         Per-request timeout (default: 8000)
  --json                    Print machine-readable JSON
  --help                    Show this help
`;
}

export function parseArgs(argv: string[]): SmokeOptions {
  const options: SmokeOptions = {
    marketingUrl: "https://bloommd.io",
    appUrl: "https://bloommd.app",
    timeoutMs: 8000,
    json: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help") {
      console.log(usage());
      process.exit(0);
    }
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--marketing-url") {
      options.marketingUrl = requireValue(argv, ++index, arg);
      continue;
    }
    if (arg === "--app-url") {
      options.appUrl = requireValue(argv, ++index, arg);
      continue;
    }
    if (arg === "--waitlist-email") {
      options.waitlistEmail = requireValue(argv, ++index, arg);
      continue;
    }
    if (arg === "--expected-sha") {
      options.expectedSha = requireValue(argv, ++index, arg);
      continue;
    }
    if (arg === "--expected-openclaw-plugin-version") {
      options.expectedOpenClawPluginVersion = requireValue(argv, ++index, arg);
      continue;
    }
    if (arg === "--timeout-ms") {
      const value = Number(requireValue(argv, ++index, arg));
      if (!Number.isInteger(value) || value < 1000) throw new Error("--timeout-ms must be an integer >= 1000");
      options.timeoutMs = value;
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }

  options.marketingUrl = normalizeOrigin(options.marketingUrl);
  options.appUrl = normalizeOrigin(options.appUrl);
  return options;
}

function requireValue(argv: string[], index: number, flag: string) {
  const value = argv[index];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

function normalizeOrigin(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:") throw new Error(`${value} must use https://`);
  return url.origin;
}

function joinUrl(origin: string, path: string) {
  return `${origin}${path}`;
}

function statusCheck(name: string, url: string, expected: string, status: "pass" | "fail", actual: string, detail?: string): SmokeCheck {
  return { name, url, expected, actual, status, detail };
}

async function request(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  return fetch(url, {
    ...init,
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      "user-agent": "BloomMD-Production-Smoke/1.0",
      ...(init.headers ?? {}),
    },
  });
}

async function expectStatus(name: string, url: string, expectedStatus: number, timeoutMs: number, fetcher: SmokeFetcher): Promise<SmokeCheck> {
  try {
    const response = await fetcher(url, { method: "GET", redirect: "follow" }, timeoutMs);
    const actual = String(response.status);
    return statusCheck(name, url, String(expectedStatus), response.status === expectedStatus ? "pass" : "fail", actual);
  } catch (error) {
    return statusCheck(name, url, String(expectedStatus), "fail", "network-error", error instanceof Error ? error.message : String(error));
  }
}

async function expectDesktopDownload(name: string, url: string, timeoutMs: number, fetcher: SmokeFetcher): Promise<SmokeCheck> {
  try {
    const response = await fetcher(url, { method: "HEAD", redirect: "follow" }, timeoutMs);
    const contentLength = Number(response.headers.get("content-length") ?? "0");
    const ok = response.status === 200 && Number.isFinite(contentLength) && contentLength > 1_000_000;
    const actual = `${response.status} ${contentLength || "<missing-length>"}`;
    return statusCheck(name, url, "200 HEAD with non-empty DMG artifact", ok ? "pass" : "fail", actual);
  } catch (error) {
    return statusCheck(name, url, "200 HEAD with non-empty DMG artifact", "fail", "network-error", error instanceof Error ? error.message : String(error));
  }
}

async function expectOpenClawPluginDownload(
  name: string,
  url: string,
  expectedVersion: string,
  expectedCacheControl: string,
  timeoutMs: number,
  fetcher: SmokeFetcher,
): Promise<SmokeCheck> {
  try {
    const response = await fetcher(url, { method: "HEAD", redirect: "follow" }, timeoutMs);
    const version = response.headers.get("x-bloommd-plugin-version") ?? "";
    const cacheControl = response.headers.get("cache-control") ?? "";
    const ok = response.status === 200
      && version === expectedVersion
      && cacheControl.includes(expectedCacheControl);
    return statusCheck(
      name,
      url,
      `200 plugin ${expectedVersion} with ${expectedCacheControl} cache policy`,
      ok ? "pass" : "fail",
      `${response.status} ${version || "<missing-version>"} ${cacheControl || "<missing-cache-control>"}`,
    );
  } catch (error) {
    return statusCheck(
      name,
      url,
      `200 plugin ${expectedVersion} with ${expectedCacheControl} cache policy`,
      "fail",
      "network-error",
      error instanceof Error ? error.message : String(error),
    );
  }
}

async function expectClosedBetaSignupEntry(name: string, url: string, timeoutMs: number, fetcher: SmokeFetcher): Promise<SmokeCheck> {
  try {
    const response = await fetcher(url, { method: "GET", redirect: "manual" }, timeoutMs);
    const body = await response.text();
    const hasEntry = body.includes('data-testid="beta-access-gate"')
      && body.includes("Dein Cloud-Zugang ist noch nicht freigeschaltet.")
      && body.includes("Zur Beta-Warteliste")
      && body.includes("Beta-Code (optional)");
    const failureMatch = body.match(SIGNUP_FAILURE_PATTERN)?.[0] ?? "";
    const ok = response.status === 200 && !response.headers.get("location") && hasEntry && !failureMatch;
    const actual = response.headers.get("location")
      ? `${response.status} -> ${response.headers.get("location")}`
      : response.status === 200
        ? failureMatch || (hasEntry ? "closed beta signup entry" : "missing closed beta signup entry")
        : String(response.status);
    return statusCheck(name, url, "200 waitlist-first closed beta entrypoint without redirect/config error", ok ? "pass" : "fail", actual);
  } catch (error) {
    return statusCheck(name, url, "200 waitlist-first closed beta entrypoint without redirect/config error", "fail", "network-error", error instanceof Error ? error.message : String(error));
  }
}

async function expectInvitedSignupForm(name: string, url: string, expectedEmail: string, timeoutMs: number, fetcher: SmokeFetcher): Promise<SmokeCheck> {
  try {
    const response = await fetcher(url, { method: "GET", redirect: "manual" }, timeoutMs);
    const body = await response.text();
    const hasForm = body.includes('data-testid="signup-form"')
      && body.includes("Account erstellen")
      && body.includes(expectedEmail)
      && body.includes("Mindestens 10 Zeichen")
      && !body.includes('data-testid="beta-access-gate"');
    const failureMatch = body.match(SIGNUP_FAILURE_PATTERN)?.[0] ?? "";
    const ok = response.status === 200 && !response.headers.get("location") && hasForm && !failureMatch;
    const actual = response.headers.get("location")
      ? `${response.status} -> ${response.headers.get("location")}`
      : response.status === 200
        ? failureMatch || (hasForm ? "invited signup form" : "missing invited signup form")
        : String(response.status);
    return statusCheck(name, url, "200 invited signup form without redirect/config error", ok ? "pass" : "fail", actual);
  } catch (error) {
    return statusCheck(name, url, "200 invited signup form without redirect/config error", "fail", "network-error", error instanceof Error ? error.message : String(error));
  }
}

async function expectHeaderContains(name: string, url: string, header: string, expected: string, timeoutMs: number, fetcher: SmokeFetcher): Promise<SmokeCheck> {
  try {
    const response = await fetcher(url, { method: "GET", redirect: "follow" }, timeoutMs);
    const value = response.headers.get(header) ?? "";
    return statusCheck(name, url, `${header}: ${expected}`, value.includes(expected) ? "pass" : "fail", value || "<missing>");
  } catch (error) {
    return statusCheck(name, url, `${header}: ${expected}`, "fail", "network-error", error instanceof Error ? error.message : String(error));
  }
}

async function expectRedirect(name: string, url: string, expectedStatus: number, expectedLocation: string, timeoutMs: number, fetcher: SmokeFetcher): Promise<SmokeCheck> {
  try {
    const response = await fetcher(url, { method: "GET", redirect: "manual" }, timeoutMs);
    const location = response.headers.get("location") ?? "";
    const ok = response.status === expectedStatus && location === expectedLocation;
    return statusCheck(name, url, `${expectedStatus} -> ${expectedLocation}`, ok ? "pass" : "fail", `${response.status} -> ${location || "<missing>"}`);
  } catch (error) {
    return statusCheck(name, url, `${expectedStatus} -> ${expectedLocation}`, "fail", "network-error", error instanceof Error ? error.message : String(error));
  }
}

async function expectHeaderPresent(name: string, url: string, header: string, timeoutMs: number, fetcher: SmokeFetcher): Promise<SmokeCheck> {
  try {
    const response = await fetcher(url, { method: "GET", redirect: "follow" }, timeoutMs);
    const value = response.headers.get(header) ?? "";
    return statusCheck(name, url, `${header}: present`, value ? "pass" : "fail", value || "<missing>");
  } catch (error) {
    return statusCheck(name, url, `${header}: present`, "fail", "network-error", error instanceof Error ? error.message : String(error));
  }
}

async function expectNoLegalPlaceholder(name: string, url: string, timeoutMs: number, fetcher: SmokeFetcher): Promise<SmokeCheck> {
  try {
    const response = await fetcher(url, { method: "GET", redirect: "follow" }, timeoutMs);
    const body = await response.text();
    const match = body.match(LEGAL_PLACEHOLDER_PATTERN)?.[0] ?? "";
    const ok = response.status === 200 && !match;
    return statusCheck(name, url, "200 without legal placeholders", ok ? "pass" : "fail", response.status === 200 ? (match || "no placeholders") : String(response.status));
  } catch (error) {
    return statusCheck(name, url, "200 without legal placeholders", "fail", "network-error", error instanceof Error ? error.message : String(error));
  }
}

async function expectWaitlistSubmit(options: SmokeOptions, fetcher: SmokeFetcher): Promise<SmokeCheck> {
  const url = joinUrl(options.marketingUrl, "/api/waitlist");
  try {
    const response = await fetcher(url, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        origin: options.marketingUrl,
      },
      body: new URLSearchParams({ email: options.waitlistEmail ?? "", source: "production-smoke" }),
    }, options.timeoutMs);
    const body = await response.text();
    const normalizedBody = body.toLowerCase();
    const generic = normalizedBody.includes("\"status\":\"pending\"") || normalizedBody.includes("bestätig") || normalizedBody.includes("bestaetig");
    const ok = (response.status === 200 || response.status === 202) && generic;
    return statusCheck("marketing waitlist submit", url, "200/202 generic confirmation response", ok ? "pass" : "fail", `${response.status}`, ok ? undefined : body.slice(0, 300));
  } catch (error) {
    return statusCheck("marketing waitlist submit", url, "200/202 generic confirmation response", "fail", "network-error", error instanceof Error ? error.message : String(error));
  }
}

async function expectVersionApi(
  name: string,
  url: string,
  expectedDeployment: "app" | "marketing",
  expectedSha: string | undefined,
  timeoutMs: number,
  fetcher: SmokeFetcher,
): Promise<SmokeCheck> {
  try {
    const response = await fetcher(url, { method: "GET", redirect: "follow" }, timeoutMs);
    const payload = await response.json().catch(() => null) as {
      deployment?: string;
      version?: string;
      gitSha?: string | null;
      shortSha?: string | null;
      displayVersion?: string;
    } | null;
    const actual = payload ? `${response.status} ${payload.deployment ?? "<missing>"} ${payload.version ?? "<missing>"} ${payload.gitSha ?? payload.shortSha ?? "<missing>"}` : `${response.status} invalid-json`;
    const hasShape = response.status === 200
      && payload?.deployment === expectedDeployment
      && Boolean(payload.version)
      && Boolean(payload.displayVersion);
    const shaMatches = !expectedSha || payload?.gitSha === expectedSha;
    const expected = expectedSha
      ? `200 ${expectedDeployment} with gitSha ${expectedSha}`
      : `200 ${expectedDeployment} with version metadata`;
    return statusCheck(name, url, expected, hasShape && shaMatches ? "pass" : "fail", actual);
  } catch (error) {
    return statusCheck(name, url, `200 ${expectedDeployment} with version metadata`, "fail", "network-error", error instanceof Error ? error.message : String(error));
  }
}

export async function runSmoke(options: SmokeOptions, fetcher: SmokeFetcher = request): Promise<SmokeCheck[]> {
  const checks: SmokeCheck[] = [];

  for (const path of MARKETING_PUBLIC_PATHS) {
    checks.push(await expectStatus(`marketing public ${path}`, joinUrl(options.marketingUrl, path), 200, options.timeoutMs, fetcher));
  }
  checks.push(await expectDesktopDownload("marketing macOS desktop download artifact", joinUrl(options.marketingUrl, DESKTOP_DMG_PATH), options.timeoutMs, fetcher));
  if (options.expectedOpenClawPluginVersion) {
    checks.push(await expectOpenClawPluginDownload(
      "marketing latest OpenClaw plugin download",
      joinUrl(options.marketingUrl, "/openclaw-plugin/latest.tgz"),
      options.expectedOpenClawPluginVersion,
      "s-maxage=60",
      options.timeoutMs,
      fetcher,
    ));
    checks.push(await expectOpenClawPluginDownload(
      "marketing immutable OpenClaw plugin download",
      joinUrl(options.marketingUrl, `/openclaw-plugin/${options.expectedOpenClawPluginVersion}.tgz`),
      options.expectedOpenClawPluginVersion,
      "immutable",
      options.timeoutMs,
      fetcher,
    ));
  }
  for (const path of MARKETING_APP_ONLY_PATHS) {
    checks.push(await expectStatus(`marketing rejects app route ${path}`, joinUrl(options.marketingUrl, path), 404, options.timeoutMs, fetcher));
  }
  for (const path of MARKETING_LEGAL_CONTENT_PATHS) {
    checks.push(await expectNoLegalPlaceholder(`marketing legal content ${path}`, joinUrl(options.marketingUrl, path), options.timeoutMs, fetcher));
  }
  checks.push(await expectStatus("marketing rejects public source map", joinUrl(options.marketingUrl, SOURCE_MAP_PATH), 404, options.timeoutMs, fetcher));

  checks.push(await expectHeaderPresent("marketing hsts", options.marketingUrl, "strict-transport-security", options.timeoutMs, fetcher));
  checks.push(await expectHeaderContains("marketing nosniff", options.marketingUrl, "x-content-type-options", "nosniff", options.timeoutMs, fetcher));
  checks.push(await expectHeaderPresent("marketing csp", options.marketingUrl, "content-security-policy", options.timeoutMs, fetcher));
  checks.push(await expectVersionApi("marketing version metadata", joinUrl(options.marketingUrl, "/api/version"), "marketing", options.expectedSha, options.timeoutMs, fetcher));

  if (options.waitlistEmail) {
    checks.push(await expectWaitlistSubmit(options, fetcher));
  }

  for (const path of APP_PUBLIC_PATHS) {
    checks.push(await expectStatus(`app public ${path}`, joinUrl(options.appUrl, path), 200, options.timeoutMs, fetcher));
  }
  checks.push(await expectClosedBetaSignupEntry("app closed beta signup entrypoint", joinUrl(options.appUrl, "/signup?next=%2Fapp"), options.timeoutMs, fetcher));
  checks.push(await expectInvitedSignupForm(
    "app invited signup form is usable",
    joinUrl(options.appUrl, "/signup?next=%2Fapp&email=smoke%40bloommd.io&access=granted"),
    "smoke@bloommd.io",
    options.timeoutMs,
    fetcher,
  ));
  for (const path of APP_MARKETING_PAGE_PATHS) {
    checks.push(await expectRedirect(`app redirects marketing page ${path}`, joinUrl(options.appUrl, path), 308, joinUrl(options.marketingUrl, path), options.timeoutMs, fetcher));
  }
  for (const path of APP_MARKETING_API_PATHS) {
    checks.push(await expectStatus(`app rejects marketing API ${path}`, joinUrl(options.appUrl, path), 404, options.timeoutMs, fetcher));
  }
  for (const path of APP_DISABLED_BILLING_PATHS) {
    checks.push(await expectStatus(`app rejects disabled billing route ${path}`, joinUrl(options.appUrl, path), 404, options.timeoutMs, fetcher));
  }
  checks.push(await expectStatus("app rejects public source map", joinUrl(options.appUrl, SOURCE_MAP_PATH), 404, options.timeoutMs, fetcher));

  checks.push(await expectHeaderContains("app noindex", options.appUrl, "x-robots-tag", "noindex", options.timeoutMs, fetcher));
  checks.push(await expectHeaderPresent("app hsts", options.appUrl, "strict-transport-security", options.timeoutMs, fetcher));
  checks.push(await expectHeaderContains("app nosniff", options.appUrl, "x-content-type-options", "nosniff", options.timeoutMs, fetcher));
  checks.push(await expectHeaderPresent("app csp", options.appUrl, "content-security-policy", options.timeoutMs, fetcher));
  checks.push(await expectVersionApi("app version metadata", joinUrl(options.appUrl, "/api/version"), "app", options.expectedSha, options.timeoutMs, fetcher));

  return checks;
}

function printChecks(checks: SmokeCheck[]) {
  for (const check of checks) {
    const mark = check.status === "pass" ? "PASS" : "FAIL";
    const detail = check.detail ? ` (${check.detail})` : "";
    console.log(`${mark} ${check.name}: expected ${check.expected}, got ${check.actual}${detail}`);
  }
}

if (import.meta.main) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const checks = await runSmoke(options);
    if (options.json) {
      console.log(JSON.stringify({ checks }, null, 2));
    } else {
      printChecks(checks);
    }

    const failures = checks.filter((check) => check.status === "fail");
    if (failures.length > 0) {
      console.error(`Production smoke failed: ${failures.length}/${checks.length} checks failed.`);
      process.exit(1);
    }

    console.log(`Production smoke passed: ${checks.length} checks.`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
