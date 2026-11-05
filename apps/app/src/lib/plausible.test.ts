import { describe, expect, test } from "bun:test";
import {
  DEFAULT_PLAUSIBLE_TARGET_URL,
  PLAUSIBLE_EVENT_ALLOWLIST,
  normalizePlausiblePath,
  plausibleBrowserConfig,
  plausibleRequestHost,
  plausibleScriptAttributes,
  plausibleStartupLine,
  readPlausibleSettings,
  scrubPlausibleEvent,
} from "./plausible";

describe("plausible settings from the environment", () => {
  test("empty or unset means on, with the defaults", () => {
    for (const env of [{}, { BLOOMMD_PLAUSIBLE_DISABLED: "" }, { BLOOMMD_PLAUSIBLE_DISABLED: "  " }]) {
      expect(readPlausibleSettings(env)).toEqual({ disabled: false, domain: "bloommd.app", targetUrl: DEFAULT_PLAUSIBLE_TARGET_URL, targetExplicit: false });
    }
    expect(DEFAULT_PLAUSIBLE_TARGET_URL).toBe("https://ping.bloommd.app");
  });

  test("BLOOMMD_PLAUSIBLE_DISABLED switches off with true and 1, in any case", () => {
    for (const value of ["true", "TRUE", " true ", "1"]) {
      expect(readPlausibleSettings({ BLOOMMD_PLAUSIBLE_DISABLED: value }).disabled).toBe(true);
    }
    for (const value of ["false", "0", "no", "yes", "off"]) {
      expect(readPlausibleSettings({ BLOOMMD_PLAUSIBLE_DISABLED: value }).disabled).toBe(false);
    }
  });

  test("the target must be an http(s) URL, anything else falls back to the default and is not explicit", () => {
    expect(readPlausibleSettings({ BLOOMMD_PLAUSIBLE_TARGET_URL: "https://plausible.ops.moellenbeck-digital.io/" })).toMatchObject({
      targetUrl: "https://plausible.ops.moellenbeck-digital.io",
      targetExplicit: true,
    });
    expect(readPlausibleSettings({ BLOOMMD_PLAUSIBLE_TARGET_URL: "http://127.0.0.1:4010/x?y=1" })).toMatchObject({ targetUrl: "http://127.0.0.1:4010", targetExplicit: true });
    for (const bad of ["ftp://example.com", "javascript:alert(1)", "not a url", "plausible.example.com", ""]) {
      expect(readPlausibleSettings({ BLOOMMD_PLAUSIBLE_TARGET_URL: bad })).toMatchObject({ targetUrl: DEFAULT_PLAUSIBLE_TARGET_URL, targetExplicit: false });
    }
  });

  test("the domain is lower-cased and must look like a host name", () => {
    expect(readPlausibleSettings({ BLOOMMD_PLAUSIBLE_DOMAIN: " Notes.Example.COM " }).domain).toBe("notes.example.com");
    for (const bad of ["a b", "https://x.example", "x.example/path", "-x.example", ""]) {
      expect(readPlausibleSettings({ BLOOMMD_PLAUSIBLE_DOMAIN: bad }).domain).toBe("bloommd.app");
    }
  });
});

describe("plausibleBrowserConfig: browser tracking only on our own host (decision A)", () => {
  test("our own host with defaults tracks, towards the default target", () => {
    expect(plausibleBrowserConfig("bloommd.app", {})).toEqual({ domain: "bloommd.app", targetUrl: "https://ping.bloommd.app" });
    expect(plausibleBrowserConfig("BLOOMMD.APP", {})).not.toBeNull();
  });

  test("our own host with the explicit internal target tracks towards it", () => {
    const env = { BLOOMMD_PLAUSIBLE_TARGET_URL: "https://plausible.ops.moellenbeck-digital.io" };
    expect(plausibleBrowserConfig("bloommd.app", env)).toEqual({ domain: "bloommd.app", targetUrl: "https://plausible.ops.moellenbeck-digital.io" });
  });

  test("a foreign host never tracks, with or without an explicit target", () => {
    for (const host of ["notes.customer.example", "app.bloommd.test", "test.bloommd.app", "www.bloommd.app", "bloommd.app.evil.example", "", null, undefined]) {
      expect(plausibleBrowserConfig(host, {})).toBeNull();
      expect(plausibleBrowserConfig(host, { BLOOMMD_PLAUSIBLE_TARGET_URL: "https://stats.example.com" })).toBeNull();
    }
  });

  test("a foreign installation with its own domain and the default target sends nothing", () => {
    const env = { BLOOMMD_PLAUSIBLE_DOMAIN: "notes.customer.example" };
    expect(plausibleBrowserConfig("notes.customer.example", env)).toBeNull();
  });

  test("a foreign installation with its own domain and its own explicit target tracks, towards that target", () => {
    const env = { BLOOMMD_PLAUSIBLE_DOMAIN: "notes.customer.example", BLOOMMD_PLAUSIBLE_TARGET_URL: "https://stats.customer.example" };
    expect(plausibleBrowserConfig("notes.customer.example", env)).toEqual({ domain: "notes.customer.example", targetUrl: "https://stats.customer.example" });
    expect(plausibleBrowserConfig("bloommd.app", env)).toBeNull();
  });

  test("an invalid target does not count as explicit", () => {
    const env = { BLOOMMD_PLAUSIBLE_DOMAIN: "notes.customer.example", BLOOMMD_PLAUSIBLE_TARGET_URL: "ftp://x" };
    expect(plausibleBrowserConfig("notes.customer.example", env)).toBeNull();
  });

  test("switched off wins over everything", () => {
    const env = { BLOOMMD_PLAUSIBLE_DISABLED: "true", BLOOMMD_PLAUSIBLE_TARGET_URL: "https://stats.example.com" };
    expect(plausibleBrowserConfig("bloommd.app", env)).toBeNull();
    expect(plausibleBrowserConfig("bloommd.app", { BLOOMMD_PLAUSIBLE_DISABLED: "1" })).toBeNull();
  });

  test("the value is read at call time: changing the environment switches tracking without a rebuild", () => {
    const env: Record<string, string | undefined> = {};
    expect(plausibleBrowserConfig("bloommd.app", env)).not.toBeNull();
    env.BLOOMMD_PLAUSIBLE_DISABLED = "true";
    expect(plausibleBrowserConfig("bloommd.app", env)).toBeNull();
    delete env.BLOOMMD_PLAUSIBLE_DISABLED;
    expect(plausibleBrowserConfig("bloommd.app", env)).not.toBeNull();
  });
});

describe("plausibleRequestHost", () => {
  test("strips the port, lower-cases, prefers the forwarded host", () => {
    expect(plausibleRequestHost(new Headers({ host: "BloomMD.app:443" }))).toBe("bloommd.app");
    expect(plausibleRequestHost(new Headers({ host: "web.internal:3000", "x-forwarded-host": "bloommd.app, other" }))).toBe("bloommd.app");
    expect(plausibleRequestHost(new Headers())).toBe("");
  });
});

describe("startup line", () => {
  test("on: names the switch, the host rule and what is sent", () => {
    const line = plausibleStartupLine({});
    expect(line).toContain("BLOOMMD_PLAUSIBLE_DISABLED");
    expect(line).toContain("AN");
    expect(line).toContain("bloommd.app");
    expect(line).toContain("nur Seitenaufrufe und Nutzungsereignisse, keine Kennung");
  });

  test("off: one line that still names the switch", () => {
    const line = plausibleStartupLine({ BLOOMMD_PLAUSIBLE_DISABLED: "true" });
    expect(line).toContain("AUS");
    expect(line).toContain("BLOOMMD_PLAUSIBLE_DISABLED");
    expect(line).not.toContain("\n");
  });

  test("own domain without a target of its own: says it is inactive", () => {
    expect(plausibleStartupLine({ BLOOMMD_PLAUSIBLE_DOMAIN: "notes.customer.example" })).toContain("INAKTIV");
  });
});

describe("script tag attributes", () => {
  test("relative first-party paths and the domain, nothing of the target", () => {
    const attributes = plausibleScriptAttributes({ domain: "bloommd.app", targetUrl: "https://plausible.ops.moellenbeck-digital.io" });
    expect(attributes).toEqual({ src: "/_plausible/js/script.js", "data-domain": "bloommd.app", "data-api": "/_plausible/api/event", defer: true });
    expect(JSON.stringify(attributes)).not.toContain("moellenbeck");
  });
});

describe("normalizePlausiblePath: route pattern only", () => {
  test.each([
    ["/", "/"],
    ["/app", "/app"],
    ["/app/", "/app"],
    ["/app?file=Geheim.md&workspace=11111111-1111-4111-8111-111111111111#node-42", "/app"],
    ["https://bloommd.app/login?next=/app#x", "/login"],
    ["/share/bloom_share_abcdef123456", "/share/:token"],
    ["/share/bloom_share_abcdef123456?x=1#y", "/share/:token"],
    ["/invite/abc123", "/invite/:token"],
    ["/invite/confirm", "/invite/confirm"],
    ["/share/", "/other"],
    ["/share/a/b", "/other"],
    ["/wiki/some-private-title", "/other"],
    ["/api/mindmaps/plan.md", "/other"],
    ["/LOGIN", "/login"],
  ])("%s -> %s", (input, expected) => {
    expect(normalizePlausiblePath(input)).toBe(expected);
  });
});

describe("scrubPlausibleEvent: allowlist, no properties, no ids", () => {
  test("a pageview keeps its name and a normalized URL on the configured domain, nothing else", () => {
    const event = scrubPlausibleEvent(
      {
        n: "pageview",
        u: "https://bloommd.app/share/bloom_share_secret?token=abc#frag",
        d: "attacker.example",
        r: "https://bloommd.app/app?file=private.md",
        p: { userId: "u-123", email: "a@example.test" },
        m: "{\"org\":\"o-1\"}",
        h: 1,
        $: 99,
      },
      "bloommd.app",
    );
    expect(event).toEqual({ n: "pageview", u: "https://bloommd.app/share/:token", d: "bloommd.app" });
    expect(Object.keys(event ?? {}).sort()).toEqual(["d", "n", "u"]);
  });

  test("an unknown event is discarded, also with innocent properties", () => {
    expect(scrubPlausibleEvent({ n: "search", u: "https://bloommd.app/app", p: { q: "tax" } }, "bloommd.app")).toBeNull();
    expect(scrubPlausibleEvent({ n: "Pageview", u: "https://bloommd.app/app" }, "bloommd.app")).toBeNull();
    expect(scrubPlausibleEvent({ n: "__proto__", u: "https://bloommd.app/app" }, "bloommd.app")).toBeNull();
    expect(scrubPlausibleEvent({ u: "https://bloommd.app/app" }, "bloommd.app")).toBeNull();
  });

  test("garbage input is discarded", () => {
    for (const input of [null, undefined, "pageview", 42, [], [{ n: "pageview" }]]) {
      expect(scrubPlausibleEvent(input, "bloommd.app")).toBeNull();
    }
  });

  test("a pageview without a usable URL falls back to /other", () => {
    expect(scrubPlausibleEvent({ n: "pageview" }, "bloommd.app")).toEqual({ n: "pageview", u: "https://bloommd.app/other", d: "bloommd.app" });
    expect(scrubPlausibleEvent({ n: "pageview", u: 5 }, "bloommd.app")).toEqual({ n: "pageview", u: "https://bloommd.app/other", d: "bloommd.app" });
  });

  test("the allowlist holds names only", () => {
    for (const name of PLAUSIBLE_EVENT_ALLOWLIST) expect(name).toMatch(/^[a-z_]+$/);
  });
});
