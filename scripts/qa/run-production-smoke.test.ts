import { describe, expect, test } from "bun:test";
import { parseArgs, runSmoke, type SmokeFetcher } from "./run-production-smoke";

const options = {
  marketingUrl: "https://bloommd.io",
  appUrl: "https://bloommd.app",
  timeoutMs: 1000,
  betaGate: false,
  json: false,
};

function headers(host: string) {
  const values: Record<string, string> = {
    "strict-transport-security": "max-age=31536000",
    "x-content-type-options": "nosniff",
    "content-security-policy": "default-src 'self'",
  };
  if (host === "bloommd.app") values["x-robots-tag"] = "noindex, nofollow";
  return values;
}

const OPEN_SIGNUP_BODY = 'data-testid="signup-form" BloomMD Account erstellen Mindestens 10 Zeichen';
const GATE_SIGNUP_BODY = 'data-testid="beta-access-gate" Account erstellen Dein Cloud-Zugang ist noch nicht freigeschaltet. Beta-Code (optional)';

/** Fetcher for a deployment; `betaGate` mirrors BLOOMMD_BETA_ACCESS=1 on the app. */
function fetcherFor(betaGate: boolean): SmokeFetcher {
  return async (url, init, timeoutMs) => {
    const parsed = new URL(url);
    if (parsed.host === "bloommd.app" && parsed.pathname === "/signup") {
      const email = parsed.searchParams.get("email");
      if (!betaGate) return new Response(OPEN_SIGNUP_BODY, { status: 200, headers: headers(parsed.host) });
      if (parsed.searchParams.get("access") === "granted") {
        return new Response(`${OPEN_SIGNUP_BODY} ${email}`, { status: 200, headers: headers(parsed.host) });
      }
      return new Response(GATE_SIGNUP_BODY, { status: 200, headers: headers(parsed.host) });
    }
    return baseFetcher(url, init, timeoutMs);
  };
}

const baseFetcher: SmokeFetcher = async (url, init) => {
  const parsed = new URL(url);
  if (init.method === "POST" && parsed.host === "bloommd.io" && parsed.pathname === "/api/waitlist") {
    return new Response(JSON.stringify({ error: "The waitlist has ended.", signup: "https://bloommd.app/signup" }), { status: 410, headers: headers(parsed.host) });
  }
  if (parsed.host === "bloommd.io" && parsed.pathname === "/waitlist/bestaetigt") {
    return new Response("", { status: 308, headers: { ...headers(parsed.host), location: "https://bloommd.app/signup" } });
  }
  if (parsed.pathname === "/api/version") {
    return new Response(JSON.stringify({
      product: "BloomMD",
      packageName: parsed.host === "bloommd.io" ? "@bloommd/marketing" : "@bloommd/web-app",
      deployment: parsed.host === "bloommd.io" ? "marketing" : "app",
      version: "0.1.0-beta.2",
      gitSha: "de8aff39cb9c93c36d62036899735eaf4c72dfa8",
      shortSha: "de8aff3",
      gitTag: "v0.1.0-beta.2",
      buildTime: "2026-08-16T09:00:00.000Z",
      displayVersion: "BloomMD 0.1.0-beta.2 (de8aff3)",
    }), { status: 200, headers: headers(parsed.host) });
  }

  if (parsed.host === "bloommd.io") {
    const rejected = ["/app", "/login", "/signup", "/account", "/api/mindmaps", "/api/sync-ticket", "/_next/static/chunks/bloommd-production-smoke.js.map"];
    const legalPaths = ["/impressum", "/datenschutz", "/agb", "/widerruf"];
    if (parsed.pathname === "/_desktop-updates/stable-macos-arm64-BloomMD.dmg" && init.method === "HEAD") {
      return new Response(null, {
        status: 200,
        headers: {
          ...headers(parsed.host),
          "content-length": "20767242",
          "content-type": "application/octet-stream",
        },
      });
    }
    const body = legalPaths.includes(parsed.pathname) ? "BloomMD Dennis Moellenbeck legal@bloommd.io" : "";
    return new Response(body, { status: rejected.includes(parsed.pathname) ? 404 : 200, headers: headers(parsed.host) });
  }

  const appMarketingPages = [
    "/demo",
    "/docs",
    "/templates",
    "/waitlist/bestaetigt",
  ];
  if (appMarketingPages.includes(parsed.pathname)) {
    return new Response("", {
      status: 308,
      headers: {
        ...headers(parsed.host),
        location: `https://bloommd.io${parsed.pathname}`,
      },
    });
  }

  const appRejects = [
    "/api/waitlist",
    "/api/billing/checkout",
    "/api/billing/portal",
    "/api/billing/webhook",
    "/_next/static/chunks/bloommd-production-smoke.js.map",
  ];
  return new Response("", { status: appRejects.includes(parsed.pathname) ? 404 : 200, headers: headers(parsed.host) });
};

/** Default deployment: gate off, open registration. */
const passingFetcher = fetcherFor(false);
const betaGateFetcher = fetcherFor(true);

describe("production smoke runner", () => {
  test("parses explicit origins and the beta gate switch", () => {
    expect(parseArgs([
      "--marketing-url",
      "https://preview.bloommd.io/path",
      "--app-url",
      "https://preview.bloommd.app/app",
      "--timeout-ms",
      "2000",
      "--beta-gate",
      "--expected-sha",
      "de8aff39cb9c93c36d62036899735eaf4c72dfa8",
      "--expected-openclaw-plugin-version",
      "0.4.1",
      "--json",
    ])).toEqual({
      marketingUrl: "https://preview.bloommd.io",
      appUrl: "https://preview.bloommd.app",
      timeoutMs: 2000,
      betaGate: true,
      expectedSha: "de8aff39cb9c93c36d62036899735eaf4c72dfa8",
      expectedOpenClawPluginVersion: "0.4.1",
      json: true,
    });
  });

  test("defaults to the open registration (gate off)", () => {
    expect(parseArgs([]).betaGate).toBe(false);
  });

  test("no longer accepts the waitlist submit option", () => {
    expect(() => parseArgs(["--waitlist-email", "smoke@example.test"])).toThrow("Unknown option");
  });

  test("rejects non-https origins", () => {
    expect(() => parseArgs(["--marketing-url", "http://bloommd.io"])).toThrow("must use https://");
  });

  test("passes with the gate off: open signup form, closed waitlist, split boundaries and headers", async () => {
    const checks = await runSmoke(options, passingFetcher);
    expect(checks).toHaveLength(51);
    expect(checks.every((check) => check.status === "pass")).toBe(true);
    expect(checks.some((check) => check.name === "app open signup form")).toBe(true);
    expect(checks.some((check) => check.name.startsWith("app beta gate"))).toBe(false);
  });

  test("passes with --beta-gate: access gate and granted signup form", async () => {
    const checks = await runSmoke({ ...options, betaGate: true }, betaGateFetcher);
    expect(checks).toHaveLength(52);
    expect(checks.every((check) => check.status === "pass")).toBe(true);
    expect(checks.some((check) => check.name === "app open signup form")).toBe(false);
  });

  test("gate off fails while the app still shows the beta gate", async () => {
    const checks = await runSmoke(options, betaGateFetcher);
    const signupCheck = checks.find((check) => check.name === "app open signup form");
    expect(signupCheck?.status).toBe("fail");
    expect(signupCheck?.actual).toContain("beta gate still shown");
    expect(checks.filter((check) => check.status === "fail")).toHaveLength(1);
  });

  test("gate off fails when the retired waitlist link is back in the signup", async () => {
    const checks = await runSmoke(options, async (url, init) => {
      const parsed = new URL(url);
      if (parsed.host === "bloommd.app" && parsed.pathname === "/signup") {
        return new Response(`${OPEN_SIGNUP_BODY} Zur Beta-Warteliste`, { status: 200, headers: headers(parsed.host) });
      }
      return passingFetcher(url, init, options.timeoutMs);
    });
    expect(checks.find((check) => check.name === "app open signup form")?.status).toBe("fail");
  });

  test("--beta-gate fails when registration is open", async () => {
    const checks = await runSmoke({ ...options, betaGate: true }, passingFetcher);
    expect(checks.find((check) => check.name === "app beta gate signup entrypoint")?.status).toBe("fail");
  });

  test("fails when the waitlist endpoint still accepts submissions", async () => {
    const checks = await runSmoke(options, async (url, init) => {
      const parsed = new URL(url);
      if (init.method === "POST" && parsed.pathname === "/api/waitlist") {
        return new Response("Bitte bestätige deine E-Mail.", { status: 202, headers: headers(parsed.host) });
      }
      return passingFetcher(url, init, options.timeoutMs);
    });
    const waitlist = checks.find((check) => check.name === "marketing waitlist is closed");
    expect(waitlist?.status).toBe("fail");
    expect(waitlist?.actual).toBe("202");
  });

  test("verifies that latest and immutable plugin URLs resolve the same release", async () => {
    const checks = await runSmoke(
      { ...options, expectedOpenClawPluginVersion: "0.4.1" },
      async (url, init, timeoutMs) => {
        const parsed = new URL(url);
        if (
          parsed.host === "bloommd.io" &&
          init.method === "HEAD" &&
          ["/openclaw-plugin/latest.tgz", "/openclaw-plugin/0.4.1.tgz"].includes(parsed.pathname)
        ) {
          return new Response(null, {
            status: 200,
            headers: {
              ...headers(parsed.host),
              "x-bloommd-plugin-version": "0.4.1",
              "cache-control": parsed.pathname.endsWith("latest.tgz")
                ? "public, max-age=0, s-maxage=60, stale-while-revalidate=60"
                : "public, max-age=31536000, s-maxage=31536000, immutable",
            },
          });
        }
        return passingFetcher(url, init, timeoutMs);
      },
    );

    const pluginChecks = checks.filter((check) => check.name.includes("OpenClaw plugin"));
    expect(pluginChecks).toHaveLength(2);
    expect(pluginChecks.every((check) => check.status === "pass")).toBe(true);
  });

  test("fails when signup redirects to a stale database configuration error", async () => {
    const checks = await runSmoke(options, async (url, init) => {
      const parsed = new URL(url);
      if (parsed.host === "bloommd.app" && parsed.pathname === "/signup" && init.redirect === "manual") {
        return new Response("", {
          status: 307,
          headers: {
            ...headers(parsed.host),
            location: "https://bloommd.app/login?error=DATABASE_URL%20ist%20noch%20nicht%20konfiguriert.",
          },
        });
      }
      return passingFetcher(url, init, options.timeoutMs);
    });

    const signupCheck = checks.find((check) => check.name === "app open signup form");
    expect(signupCheck?.status).toBe("fail");
    expect(signupCheck?.actual).toContain("DATABASE_URL");
  });

  test("fails when live version metadata does not match the expected SHA", async () => {
    const checks = await runSmoke({ ...options, expectedSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }, passingFetcher);

    const versionChecks = checks.filter((check) => check.name.endsWith("version metadata"));
    expect(versionChecks).toHaveLength(2);
    expect(versionChecks.every((check) => check.status === "fail")).toBe(true);
  });

  test("fails when marketing legal pages still contain placeholders", async () => {
    const checks = await runSmoke(options, async (url, init) => {
      const parsed = new URL(url);
      if (parsed.host === "bloommd.io" && parsed.pathname === "/impressum") {
        return new Response("Noch einzutragen vor Live-Verkauf", { status: 200, headers: headers(parsed.host) });
      }
      return passingFetcher(url, init, options.timeoutMs);
    });

    const legalCheck = checks.find((check) => check.name === "marketing legal content /impressum");
    expect(legalCheck?.status).toBe("fail");
    expect(legalCheck?.actual).toBe("Noch einzutragen");
  });

  test("reports network failures as failed checks", async () => {
    const checks = await runSmoke(options, async () => {
      throw new Error("connection refused");
    });

    expect(checks).toHaveLength(51);
    expect(checks.every((check) => check.status === "fail")).toBe(true);
    expect(checks[0]?.detail).toBe("connection refused");
  });
});
