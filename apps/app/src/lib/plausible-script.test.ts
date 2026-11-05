import { describe, expect, test } from "bun:test";
import { PLAUSIBLE_EVENT_PATH, normalizePlausiblePath } from "./plausible";
import { plausibleTrackerSource } from "./plausible-script";

/** Runs the served script against a minimal fake browser and records what it sends. */
function runTracker(options: { url: string; domain?: string; doNotTrack?: boolean }) {
  const url = new URL(options.url);
  const beacons: Array<{ api: string; body: Record<string, unknown> }> = [];
  const listeners: Record<string, Array<() => void>> = {};
  const history = {
    pushState(_state: unknown, _title: string, next: string) {
      const target = new URL(next, url);
      location.pathname = target.pathname;
      location.search = target.search;
      location.hash = target.hash;
    },
    replaceState(_state: unknown, _title: string, next: string) {
      history.pushState(null, "", next);
    },
  };
  const location = { protocol: url.protocol, hostname: url.hostname, pathname: url.pathname, search: url.search, hash: url.hash };
  const tag = {
    getAttribute: (name: string) => ({ "data-domain": options.domain ?? "bloommd.app", "data-api": PLAUSIBLE_EVENT_PATH })[name] ?? null,
  };
  const win: Record<string, unknown> = {
    location,
    doNotTrack: options.doNotTrack ? "1" : null,
    addEventListener: (name: string, fn: () => void) => (listeners[name] ??= []).push(fn),
  };
  const navigatorFake = {
    doNotTrack: options.doNotTrack ? "1" : null,
    sendBeacon: (api: string, body: string) => {
      beacons.push({ api, body: JSON.parse(body) as Record<string, unknown> });
      return true;
    },
  };
  const documentFake = { currentScript: tag, visibilityState: "visible", addEventListener: () => undefined };
  new Function("window", "document", "navigator", "history", "fetch", plausibleTrackerSource())(win, documentFake, navigatorFake, history, () => {
    throw new Error("fetch must not be used while sendBeacon works");
  });
  return {
    beacons,
    win,
    navigate(path: string) {
      history.pushState(null, "", path);
    },
    popstate(path: string) {
      const target = new URL(path, url);
      location.pathname = target.pathname;
      location.search = target.search;
      location.hash = target.hash;
      for (const fn of listeners.popstate ?? []) fn();
    },
  };
}

describe("served tracker script", () => {
  test("is syntactically valid, self-contained ES5 text without template placeholders", () => {
    const source = plausibleTrackerSource();
    expect(() => new Function(source)).not.toThrow();
    expect(source).not.toContain("${");
    expect(source).not.toMatch(/=>|\bconst\b|\blet\b/);
  });

  test("sends one pageview on load, with a normalized URL: no query, no hash, no id", () => {
    const run = runTracker({ url: "https://bloommd.app/app?file=Gehaltsliste.md&workspace=11111111-1111-4111-8111-111111111111#node-7" });
    expect(run.beacons).toEqual([{ api: "/_plausible/api/event", body: { n: "pageview", u: "https://bloommd.app/app", d: "bloommd.app" } }]);
  });

  test("share and invite tokens never leave the browser", () => {
    expect(runTracker({ url: "https://bloommd.app/share/bloom_share_geheim123" }).beacons[0]?.body.u).toBe("https://bloommd.app/share/:token");
    expect(runTracker({ url: "https://bloommd.app/invite/einladung-xyz?x=1" }).beacons[0]?.body.u).toBe("https://bloommd.app/invite/:token");
    expect(runTracker({ url: "https://bloommd.app/wiki/privater-titel" }).beacons[0]?.body.u).toBe("https://bloommd.app/other");
  });

  test("single-page navigation sends a pageview only when the route pattern changes", () => {
    const run = runTracker({ url: "https://bloommd.app/app" });
    run.navigate("/app?file=a.md");
    run.navigate("/app?file=b.md#x");
    expect(run.beacons).toHaveLength(1);
    run.navigate("/account");
    run.popstate("/share/bloom_share_t0ken");
    expect(run.beacons.map((beacon) => beacon.body.u)).toEqual(["https://bloommd.app/app", "https://bloommd.app/account", "https://bloommd.app/share/:token"]);
  });

  test("the pattern logic of the browser equals the server logic on every probe", () => {
    const probes = ["/", "/app", "/app/", "/APP", "/login", "/invite/confirm", "/invite/abc", "/invite/", "/share/x", "/share/x/y", "/wiki/t", "/api/x", "/zzz", "/auth/mobile"];
    for (const probe of probes) {
      const run = runTracker({ url: `https://bloommd.app${probe}?a=1#b` });
      expect(run.beacons[0]?.body.u).toBe(`https://bloommd.app${normalizePlausiblePath(probe)}`);
    }
  });

  test("does nothing on another host (test system, customer installation)", () => {
    expect(runTracker({ url: "https://app.bloommd.test/app" }).beacons).toEqual([]);
    expect(runTracker({ url: "https://notes.customer.example/app" }).beacons).toEqual([]);
  });

  test("does nothing outside http(s), as in the desktop app on views://mainview", () => {
    const view = new URL("views://mainview/index.html");
    const beacons = runTracker({ url: view.href, domain: "mainview" }).beacons;
    expect(beacons).toEqual([]);
  });

  test("does nothing with Do Not Track", () => {
    expect(runTracker({ url: "https://bloommd.app/app", doNotTrack: true }).beacons).toEqual([]);
  });

  test("window.plausible accepts allowlisted names only and takes no properties", () => {
    const run = runTracker({ url: "https://bloommd.app/app" });
    const plausible = run.win.plausible as (name: string, options?: unknown) => void;
    plausible("search", { props: { q: "x" } });
    plausible("pageview", { props: { userId: "u-1" }, u: "https://bloommd.app/app?secret=1" });
    const bodies = run.beacons.map((beacon) => beacon.body);
    expect(bodies).toHaveLength(2);
    for (const body of bodies) expect(Object.keys(body).sort()).toEqual(["d", "n", "u"]);
    expect(bodies[1]?.u).toBe("https://bloommd.app/app");
  });
});
