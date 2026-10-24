import { createHash } from "node:crypto";
import { describe, expect, test } from "bun:test";
import {
  createPkcePair,
  describeDevice,
  MobileAuth,
  MobileAuthError,
  normalizeServerUrl,
  parseAuthCallback,
  PENDING_KEY,
  PENDING_TTL_MS,
  SESSION_KEY,
  type KeychainLike,
} from "./mobile-auth";

class MemoryKeychain implements KeychainLike {
  values = new Map<string, string>();
  async get({ key }: { key: string }) { return { value: this.values.get(key) ?? null }; }
  async set({ key, value }: { key: string; value: string }) { this.values.set(key, value); }
  async remove({ key }: { key: string }) { this.values.delete(key); }
}

const TOKEN_RESPONSE = {
  token: "bloom_pat_abc",
  tokenId: "t1",
  expiresAt: "2027-10-04T00:00:00.000Z",
  deviceName: "iPad",
  user: { email: "max@bloommd.test", name: "Max" },
  workspaces: [{ id: "w1", name: "Persönlich", kind: "personal", role: "owner" }],
};

function setup(responder: (url: string, init?: RequestInit) => Response | Promise<Response> = () => Response.json(TOKEN_RESPONSE)) {
  const keychain = new MemoryKeychain();
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const opened: string[] = [];
  let now = Date.parse("2026-10-04T10:00:00Z");
  const auth = new MobileAuth({
    keychain,
    fetch: (async (url: string, init?: RequestInit) => { requests.push({ url, init }); return responder(url, init); }) as typeof fetch,
    openBrowser: async (url) => { opened.push(url); },
    closeBrowser: async () => undefined,
    now: () => now,
  });
  return { auth, keychain, requests, opened, advance: (ms: number) => { now += ms; } };
}

async function startedSignIn(env: ReturnType<typeof setup>, serverUrl = "https://bloommd.app") {
  await env.auth.start({ serverUrl, device: "iPad", lang: "de" });
  const authorize = new URL(env.opened.at(-1)!);
  return { authorize, state: authorize.searchParams.get("state")!, challenge: authorize.searchParams.get("challenge")! };
}

describe("app sign-in", () => {
  test("opens the consent page with an S256 challenge and exchanges the code with the verifier", async () => {
    const env = setup();
    const { authorize, state, challenge } = await startedSignIn(env);
    expect(`${authorize.origin}${authorize.pathname}`).toBe("https://bloommd.app/auth/mobile");
    expect(authorize.searchParams.get("device")).toBe("iPad");

    const session = await env.auth.complete(`bloommd://auth?code=bloom_mac_x&state=${state}`);
    expect(session).toMatchObject({ serverUrl: "https://bloommd.app", token: "bloom_pat_abc", user: { email: "max@bloommd.test" } });
    expect(env.requests[0]!.url).toBe("https://bloommd.app/api/mobile/token");
    const body = JSON.parse(String(env.requests[0]!.init!.body)) as { code: string; verifier: string; state: string };
    expect(body.code).toBe("bloom_mac_x");
    expect(createHash("sha256").update(body.verifier).digest("base64url")).toBe(challenge);
    // Token in the keychain, the one-time pending data gone.
    expect(JSON.parse(env.keychain.values.get(SESSION_KEY)!)).toMatchObject({ token: "bloom_pat_abc" });
    expect(env.keychain.values.has(PENDING_KEY)).toBe(false);
  });

  test("a callback with another state is rejected without contacting the server and keeps the sign-in", async () => {
    const env = setup();
    const { state } = await startedSignIn(env);
    await expect(env.auth.complete("bloommd://auth?code=bloom_mac_x&state=forged-state-0000000")).rejects.toMatchObject({ code: "state_mismatch" });
    await expect(env.auth.complete("bloommd://auth?code=bloom_mac_x")).rejects.toBeInstanceOf(MobileAuthError);
    expect(env.requests).toHaveLength(0);
    await env.auth.complete(`bloommd://auth?code=bloom_mac_x&state=${state}`);
    // Used once: the same callback again has no pending sign-in.
    await expect(env.auth.complete(`bloommd://auth?code=bloom_mac_x&state=${state}`)).rejects.toMatchObject({ code: "no_pending" });
  });

  test("cancelled, expired and refused sign-ins store no token", async () => {
    const denied = setup();
    const first = await startedSignIn(denied);
    await expect(denied.auth.complete(`bloommd://auth?error=access_denied&state=${first.state}`)).rejects.toMatchObject({ code: "denied" });

    const late = setup();
    const second = await startedSignIn(late);
    late.advance(PENDING_TTL_MS + 1);
    await expect(late.auth.complete(`bloommd://auth?code=bloom_mac_x&state=${second.state}`)).rejects.toMatchObject({ code: "expired" });

    const refused = setup(() => Response.json({ error: "invalid_grant" }, { status: 400 }));
    const third = await startedSignIn(refused);
    await expect(refused.auth.complete(`bloommd://auth?code=bloom_mac_x&state=${third.state}`)).rejects.toMatchObject({ code: "expired" });

    for (const env of [denied, late, refused]) expect(env.keychain.values.has(SESSION_KEY)).toBe(false);
    expect(denied.requests.length + late.requests.length).toBe(0);
  });

  test("restores the session silently and drops a revoked token", async () => {
    let status = 200;
    const env = setup((url) => url.endsWith("/api/mobile/session")
      ? Response.json({ user: { email: "max@bloommd.test", name: "Max M." } }, { status })
      : Response.json(TOKEN_RESPONSE));
    const { state } = await startedSignIn(env);
    await env.auth.complete(`bloommd://auth?code=bloom_mac_x&state=${state}`);

    const restored = await env.auth.restore();
    expect(restored).toMatchObject({ offline: false, session: { user: { name: "Max M." } } });
    expect((env.requests.at(-1)!.init!.headers as Record<string, string>).Authorization).toBe("Bearer bloom_pat_abc");

    status = 401;
    expect(await env.auth.restore()).toBeNull();
    expect(env.keychain.values.has(SESSION_KEY)).toBe(false);
  });

  test("keeps the session offline and signs out locally even when the server is unreachable", async () => {
    let online = true;
    const env = setup(() => { if (!online) throw new TypeError("offline"); return Response.json(TOKEN_RESPONSE); });
    const { state } = await startedSignIn(env);
    await env.auth.complete(`bloommd://auth?code=bloom_mac_x&state=${state}`);
    online = false;
    expect(await env.auth.restore()).toMatchObject({ offline: true });
    expect(await env.auth.signOut()).toEqual({ revoked: false });
    expect(env.keychain.values.has(SESSION_KEY)).toBe(false);
  });

  test("sign-out revokes the token on the server", async () => {
    const env = setup();
    const { state } = await startedSignIn(env);
    await env.auth.complete(`bloommd://auth?code=bloom_mac_x&state=${state}`);
    expect(await env.auth.signOut()).toEqual({ revoked: true });
    expect(env.requests.at(-1)).toMatchObject({ url: "https://bloommd.app/api/mobile/logout", init: { method: "POST" } });
    expect(env.keychain.values.has(SESSION_KEY)).toBe(false);
  });

  test("self-hosted servers: https only, http just for this machine", async () => {
    expect(normalizeServerUrl("bloom.example.org/")).toBe("https://bloom.example.org");
    expect(normalizeServerUrl("https://example.org/bloommd/?x=1#y")).toBe("https://example.org/bloommd");
    expect(normalizeServerUrl("http://127.0.0.1:3210")).toBe("http://127.0.0.1:3210");
    expect(normalizeServerUrl("http://example.org")).toBeNull();
    expect(normalizeServerUrl("https://user:pw@example.org")).toBeNull();
    expect(normalizeServerUrl("javascript:alert(1)")).toBeNull();
    const env = setup();
    await expect(env.auth.start({ serverUrl: "ftp://example.org", device: "iPad", lang: "en" })).rejects.toMatchObject({ code: "invalid_server" });
    await startedSignIn(env, "https://bloom.example.org/");
    expect(env.opened.at(-1)).toStartWith("https://bloom.example.org/auth/mobile?");
  });

  test("helpers", async () => {
    const pair = await createPkcePair();
    expect(pair.verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(pair.challenge).toBe(createHash("sha256").update(pair.verifier).digest("base64url"));
    expect(parseAuthCallback("bloommd://open?path=a.md")).toBeNull();
    expect(parseAuthCallback("https://bloommd.app/auth?code=x&state=y")).toBeNull();
    expect(describeDevice({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", maxTouchPoints: 5 })).toBe("iPad");
    expect(describeDevice({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)" })).toBe("iPhone");
  });
});
