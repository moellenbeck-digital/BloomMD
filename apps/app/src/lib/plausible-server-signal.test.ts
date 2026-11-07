import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import {
  DEFAULT_PLAUSIBLE_TARGET_URL,
  SERVER_SIGNAL_FORWARDED_FOR,
  INSTALLATIONS_PLAUSIBLE_DOMAIN,
  sanitizeServerSignalVersion,
  serverSignalConfig,
} from "./plausible";
import { resetServerSignalForTests, sendServerSignal, startServerSignal } from "./plausible-server-signal";

// The default target is never contacted: every test points the request at its own stub.
const PROD = { NODE_ENV: "production" } as const;

type Received = { url: string; method: string; headers: Record<string, string>; body: string };
let received: Received[] = [];
let stub: ReturnType<typeof Bun.serve> | null = null;
let stubStatus = 202;

function startStub() {
  stub = Bun.serve({
    port: 0,
    async fetch(request) {
      received.push({
        url: new URL(request.url).pathname,
        method: request.method,
        headers: Object.fromEntries(request.headers.entries()),
        body: await request.text(),
      });
      return new Response("ok", { status: stubStatus });
    },
  });
  return `http://127.0.0.1:${stub.port}`;
}

/** Real fetch, but the default target host is replaced by the stub; the rest of the request is untouched. */
function towards(base: string) {
  return (input: string, init?: RequestInit) => fetch(input.replace(DEFAULT_PLAUSIBLE_TARGET_URL, base), init);
}

let warn: ReturnType<typeof spyOn<Console, "warn">>;
let info: ReturnType<typeof spyOn<Console, "info">>;
let error: ReturnType<typeof spyOn<Console, "error">>;
beforeEach(() => {
  received = [];
  stubStatus = 202;
  resetServerSignalForTests();
  warn = spyOn(console, "warn").mockImplementation(() => undefined);
  info = spyOn(console, "info").mockImplementation(() => undefined);
  error = spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  void stub?.stop(true);
  stub = null;
  warn.mockRestore();
  info.mockRestore();
  error.mockRestore();
});

describe("serverSignalConfig: when the signal is sent", () => {
  test("default target and tracking not switched off: sends, on the fixed installations domain", () => {
    expect(serverSignalConfig("1.2.3", PROD)).toEqual({
      targetUrl: "https://ping.bloommd.app",
      domain: "installations.bloommd.app",
      version: "1.2.3",
      userAgent: "BloomMD-Server/1.2.3",
    });
  });

  test("BLOOMMD_PLAUSIBLE_DISABLED switches it off", () => {
    expect(serverSignalConfig("1.2.3", { ...PROD, BLOOMMD_PLAUSIBLE_DISABLED: "true" })).toBeNull();
    expect(serverSignalConfig("1.2.3", { ...PROD, BLOOMMD_PLAUSIBLE_DISABLED: "1" })).toBeNull();
  });

  test("an explicit target (our own installation) sends no server signal, with or without our domain", () => {
    const target = "https://plausible.ops.moellenbeck-digital.io";
    expect(serverSignalConfig("1.2.3", { ...PROD, BLOOMMD_PLAUSIBLE_TARGET_URL: target })).toBeNull();
    expect(serverSignalConfig("1.2.3", { ...PROD, BLOOMMD_PLAUSIBLE_TARGET_URL: target, BLOOMMD_PLAUSIBLE_DOMAIN: "notes.customer.example" })).toBeNull();
  });

  test("an invalid target is not explicit: the signal goes to the default target", () => {
    expect(serverSignalConfig("1.2.3", { ...PROD, BLOOMMD_PLAUSIBLE_TARGET_URL: "not a url" })?.targetUrl).toBe(DEFAULT_PLAUSIBLE_TARGET_URL);
  });

  test("the domain variable does not change the signal domain", () => {
    expect(serverSignalConfig("1.2.3", { ...PROD, BLOOMMD_PLAUSIBLE_DOMAIN: "notes.customer.example" })?.domain).toBe(INSTALLATIONS_PLAUSIBLE_DOMAIN);
  });

  test("not from a dev server, a build or the E2E test mode", () => {
    expect(serverSignalConfig("1.2.3", { NODE_ENV: "development" })).toBeNull();
    expect(serverSignalConfig("1.2.3", {})).toBeNull();
    expect(serverSignalConfig("1.2.3", { ...PROD, NEXT_PHASE: "phase-production-build" })).toBeNull();
    expect(serverSignalConfig("1.2.3", { ...PROD, BLOOMMD_E2E_TEST_MODE: "1" })).toBeNull();
  });

  test("the version is a plain version string or `unknown`, nothing else reaches header or body", () => {
    expect(sanitizeServerSignalVersion(" 0.5.8 ")).toBe("0.5.8");
    expect(sanitizeServerSignalVersion("1.0.0-rc.1+build5")).toBe("1.0.0-rc.1+build5");
    for (const bad of [undefined, "", "a b", "1.0\r\nX-Evil: 1", "https://x.example/", "x".repeat(33), "/etc/passwd"]) {
      expect(sanitizeServerSignalVersion(bad)).toBe("unknown");
    }
    expect(serverSignalConfig("1.0\r\nX-Evil: 1", PROD)?.userAgent).toBe("BloomMD-Server/unknown");
  });
});

describe("sendServerSignal: what leaves", () => {
  test("one POST /api/event: fixed User-Agent, neutral X-Forwarded-For, domain, name, only the version as property", async () => {
    const base = startStub();
    expect(await sendServerSignal("0.5.8", PROD, towards(base))).toBe(true);
    expect(received).toHaveLength(1);
    const [request] = received;
    expect(request?.method).toBe("POST");
    expect(request?.url).toBe("/api/event");
    expect(request?.headers["user-agent"]).toBe("BloomMD-Server/0.5.8");
    expect(request?.headers["x-forwarded-for"]).toBe(SERVER_SIGNAL_FORWARDED_FOR);
    expect(JSON.parse(request?.body ?? "")).toEqual({
      name: "server-start",
      url: "https://installations.bloommd.app/",
      domain: "installations.bloommd.app",
      props: { version: "0.5.8" },
    });
  });

  test("no cookie, no authorization, no identifier header, and nothing from the environment of the server", async () => {
    const base = startStub();
    await sendServerSignal("0.5.8", { ...PROD, HOSTNAME: "secret-host", BLOOMMD_AUTH_SECRET: "s3cret" }, towards(base));
    const [request] = received;
    for (const name of ["cookie", "authorization", "x-real-ip", "forwarded", "referer", "origin"]) expect(request?.headers[name]).toBeUndefined();
    expect(request?.body).not.toContain("secret");
    expect(JSON.stringify(request?.headers)).not.toContain("secret");
  });

  test("with the switch off or an explicit target nothing is sent", async () => {
    const base = startStub();
    expect(await sendServerSignal("0.5.8", { ...PROD, BLOOMMD_PLAUSIBLE_DISABLED: "true" }, towards(base))).toBe(false);
    expect(await sendServerSignal("0.5.8", { ...PROD, BLOOMMD_PLAUSIBLE_TARGET_URL: "https://plausible.example" }, towards(base))).toBe(false);
    expect(received).toHaveLength(0);
  });
});

describe("sendServerSignal: fail-safe, silent", () => {
  test("target not reachable (connection refused): resolves false, no throw, no log line", async () => {
    expect(await sendServerSignal("0.5.8", PROD, towards("http://127.0.0.1:1"))).toBe(false);
    expect(warn).not.toHaveBeenCalled();
    expect(info).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  test("DNS failure and timeout errors stay silent too", async () => {
    for (const failure of [new TypeError("fetch failed"), new DOMException("The operation timed out.", "TimeoutError")]) {
      expect(await sendServerSignal("0.5.8", PROD, async () => Promise.reject(failure))).toBe(false);
    }
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  test("the target answers 500: false, silent", async () => {
    stubStatus = 500;
    const base = startStub();
    expect(await sendServerSignal("0.5.8", PROD, towards(base))).toBe(false);
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  test("a hanging target ends after the short timeout of about 3 s", async () => {
    const hanging = Bun.serve({ port: 0, fetch: () => new Promise<Response>(() => undefined) });
    const started = Date.now();
    try {
      expect(await sendServerSignal("0.5.8", PROD, towards(`http://127.0.0.1:${hanging.port}`))).toBe(false);
      const took = Date.now() - started;
      expect(took).toBeGreaterThan(2_500);
      expect(took).toBeLessThan(4_500);
    } finally {
      void hanging.stop(true);
    }
  }, 8_000);

  test("a redirect from the target is not followed", async () => {
    const redirecting = Bun.serve({ port: 0, fetch: () => new Response(null, { status: 302, headers: { Location: "https://elsewhere.example/" } }) });
    try {
      expect(await sendServerSignal("0.5.8", PROD, towards(`http://127.0.0.1:${redirecting.port}`))).toBe(false);
    } finally {
      void redirecting.stop(true);
    }
  });
});

describe("startServerSignal: at start and then at most once per 24 h", () => {
  test("sends once at start without waiting for the network, and never twice for the same process", async () => {
    let calls = 0;
    let release: (value: Response) => void = () => undefined;
    const slow = () => {
      calls++;
      return new Promise<Response>((resolve) => {
        release = resolve;
      });
    };
    const stop = startServerSignal("0.5.8", PROD, slow, 60_000);
    // Returned although the request is still open: starting does not wait for it.
    expect(stop).not.toBeNull();
    expect(calls).toBe(1);
    expect(startServerSignal("0.5.8", PROD, slow, 60_000)).toBeNull();
    expect(calls).toBe(1);
    release(new Response(null, { status: 202 }));
    stop?.();
  });

  test("repeats on the interval and stops when asked", async () => {
    let calls = 0;
    const counting = async () => {
      calls++;
      return new Response(null, { status: 202 });
    };
    const stop = startServerSignal("0.5.8", PROD, counting, 20);
    await Bun.sleep(100);
    stop?.();
    const atStop = calls;
    expect(atStop).toBeGreaterThanOrEqual(3);
    await Bun.sleep(60);
    expect(calls).toBe(atStop);
  });

  test("the default interval is 24 hours and the timer does not keep the process alive", () => {
    const setIntervalSpy = spyOn(globalThis, "setInterval");
    const stop = startServerSignal("0.5.8", PROD, async () => new Response(null, { status: 202 }));
    expect(setIntervalSpy).toHaveBeenCalledTimes(1);
    expect(setIntervalSpy.mock.calls[0]?.[1]).toBe(24 * 60 * 60 * 1000);
    const timer = setIntervalSpy.mock.results[0]?.value as { hasRef?: () => boolean };
    expect(timer.hasRef?.()).toBe(false);
    stop?.();
    setIntervalSpy.mockRestore();
  });

  test("schedules nothing when the signal is off", () => {
    const never = async () => {
      throw new Error("must not be called");
    };
    expect(startServerSignal("0.5.8", { ...PROD, BLOOMMD_PLAUSIBLE_DISABLED: "true" }, never)).toBeNull();
    expect(startServerSignal("0.5.8", { ...PROD, BLOOMMD_PLAUSIBLE_TARGET_URL: "https://plausible.example" }, never)).toBeNull();
    expect(startServerSignal("0.5.8", { NODE_ENV: "development" }, never)).toBeNull();
  });
});
