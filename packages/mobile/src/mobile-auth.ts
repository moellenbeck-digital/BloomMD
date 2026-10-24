/**
 * Sign-in of the app with a BloomMD account (authorization code + PKCE, no client secret).
 *
 * 1. `start` creates a code verifier, its S256 challenge and a state, keeps them in the keychain
 *    and opens `<server>/auth/mobile?…` in the system browser (in-app Safari / Custom Tabs).
 * 2. The user signs in there and allows the app; the browser opens `bloommd://auth?code=…&state=…`.
 * 3. `complete` checks the state, exchanges code + verifier at `/api/mobile/token` and stores the
 *    access token in the keychain. The token never touches WebView storage.
 * 4. `restore` brings the session back on launch; `signOut` revokes the token on the server and
 *    deletes it on the device.
 */

export const DEFAULT_SERVER_URL = "https://bloommd.app";
export const SESSION_KEY = "bloommd.session";
export const PENDING_KEY = "bloommd.auth.pending";
/** The browser step must finish within this time (the server code itself lives 5 minutes). */
export const PENDING_TTL_MS = 15 * 60 * 1000;

export interface KeychainLike {
  get(options: { key: string }): Promise<{ value: string | null }>;
  set(options: { key: string; value: string }): Promise<void>;
  remove(options: { key: string }): Promise<void>;
}

export interface MobileSession {
  serverUrl: string;
  token: string;
  tokenId: string;
  expiresAt: string | null;
  deviceName: string;
  user: { email: string; name: string | null };
  workspaces: Array<{ id: string; name: string; kind: string; role: string }>;
}

interface PendingSignIn {
  serverUrl: string;
  verifier: string;
  state: string;
  device: string;
  createdAt: number;
}

export type MobileAuthErrorCode =
  | "invalid_server"
  | "no_pending"
  | "expired"
  | "state_mismatch"
  | "denied"
  | "exchange_failed"
  | "network";

export class MobileAuthError extends Error {
  constructor(readonly code: MobileAuthErrorCode, message: string = code) {
    super(message);
    this.name = "MobileAuthError";
  }
}

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * The BloomMD server to sign in with: `https://` (a scheme is added when missing), or `http://`
 * only for this machine (simulator development). Query, fragment and credentials are dropped.
 */
export function normalizeServerUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }
  if (url.username || url.password) return null;
  if (url.protocol !== "https:" && !(url.protocol === "http:" && LOOPBACK.has(url.hostname))) return null;
  return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
}

export function base64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function createPkcePair() {
  const verifier = base64Url(crypto.getRandomValues(new Uint8Array(32)));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return { verifier, challenge: base64Url(new Uint8Array(digest)) };
}

export function createState() {
  return base64Url(crypto.getRandomValues(new Uint8Array(24)));
}

/** Compares without stopping at the first difference. */
export function statesMatch(expected: string, received: string) {
  if (expected.length !== received.length) return false;
  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) difference |= expected.charCodeAt(index) ^ received.charCodeAt(index);
  return difference === 0;
}

/** A readable name for the consent screen and the token list. */
export function describeDevice(nav: { userAgent: string; maxTouchPoints?: number }) {
  const agent = nav.userAgent;
  if (/iPad/.test(agent) || (/Macintosh/.test(agent) && (nav.maxTouchPoints ?? 0) > 1)) return "iPad";
  if (/iPhone/.test(agent)) return "iPhone";
  if (/Android/.test(agent)) return /Mobile/.test(agent) ? "Android-Smartphone" : "Android-Tablet";
  return "BloomMD Mobile";
}

export function buildAuthorizeUrl(serverUrl: string, params: { challenge: string; state: string; device: string; lang: "de" | "en" }) {
  const url = new URL(`${serverUrl}/auth/mobile`);
  url.searchParams.set("challenge", params.challenge);
  url.searchParams.set("state", params.state);
  url.searchParams.set("device", params.device);
  url.searchParams.set("lang", params.lang);
  return url.toString();
}

export type AuthCallback =
  | { kind: "code"; code: string; state: string }
  | { kind: "error"; error: string; state: string | null };

/** Parses `bloommd://auth?code=…&state=…` (or `?error=…`); null for anything else. */
export function parseAuthCallback(raw: string): AuthCallback | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "bloommd:" || (url.host || url.pathname.replace(/^\/+/, "")) !== "auth") return null;
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  if (error) return { kind: "error", error: error.slice(0, 64), state };
  const code = url.searchParams.get("code");
  if (!code || !state) return null;
  return { kind: "code", code, state };
}

function parseJson<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function isSession(value: unknown): value is MobileSession {
  const session = value as MobileSession | null;
  return Boolean(session && typeof session.serverUrl === "string" && typeof session.token === "string" && session.token.startsWith("bloom_pat_") && session.user && typeof session.user.email === "string");
}

export interface MobileAuthDeps {
  keychain: KeychainLike;
  fetch: typeof fetch;
  /** Opens the sign-in page in the system browser. */
  openBrowser: (url: string) => Promise<void>;
  /** Closes the in-app browser after the app received the code (best effort). */
  closeBrowser?: () => Promise<void>;
  now?: () => number;
}

export class MobileAuth {
  private readonly now: () => number;

  constructor(private readonly deps: MobileAuthDeps) {
    this.now = deps.now ?? Date.now;
  }

  async start(input: { serverUrl: string; device: string; lang: "de" | "en" }) {
    const serverUrl = normalizeServerUrl(input.serverUrl);
    if (!serverUrl) throw new MobileAuthError("invalid_server");
    const { verifier, challenge } = await createPkcePair();
    const pending: PendingSignIn = { serverUrl, verifier, state: createState(), device: input.device, createdAt: this.now() };
    await this.deps.keychain.set({ key: PENDING_KEY, value: JSON.stringify(pending) });
    await this.deps.openBrowser(buildAuthorizeUrl(serverUrl, { challenge, state: pending.state, device: input.device, lang: input.lang }));
  }

  /** Handles `bloommd://auth?…`. Throws MobileAuthError; the pending sign-in is used only once. */
  async complete(rawUrl: string): Promise<MobileSession> {
    const callback = parseAuthCallback(rawUrl);
    if (!callback) throw new MobileAuthError("exchange_failed");
    const pending = parseJson<PendingSignIn>((await this.deps.keychain.get({ key: PENDING_KEY })).value);
    if (!pending) throw new MobileAuthError("no_pending");
    // A callback for another sign-in (or forged by another app) must not consume this one.
    if (!callback.state || !statesMatch(pending.state, callback.state)) throw new MobileAuthError("state_mismatch");
    await this.deps.keychain.remove({ key: PENDING_KEY });
    await this.deps.closeBrowser?.().catch(() => undefined);
    if (this.now() - pending.createdAt > PENDING_TTL_MS) throw new MobileAuthError("expired");
    if (callback.kind === "error") throw new MobileAuthError("denied", callback.error);

    let response: Response;
    try {
      response = await this.deps.fetch(`${pending.serverUrl}/api/mobile/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: callback.code, verifier: pending.verifier, state: callback.state, device: pending.device }),
      });
    } catch {
      throw new MobileAuthError("network");
    }
    const payload = await response.json().catch(() => null) as Omit<MobileSession, "serverUrl"> | null;
    const session = payload && { ...payload, serverUrl: pending.serverUrl };
    if (!response.ok || !isSession(session)) throw new MobileAuthError(response.status === 400 ? "expired" : "exchange_failed");
    const stored: MobileSession = {
      serverUrl: session.serverUrl,
      token: session.token,
      tokenId: session.tokenId,
      expiresAt: session.expiresAt ?? null,
      deviceName: session.deviceName ?? pending.device,
      user: { email: session.user.email, name: session.user.name ?? null },
      workspaces: Array.isArray(session.workspaces) ? session.workspaces : [],
    };
    await this.deps.keychain.set({ key: SESSION_KEY, value: JSON.stringify(stored) });
    return stored;
  }

  /** The stored session, without asking the server. */
  async stored(): Promise<MobileSession | null> {
    const session = parseJson<unknown>((await this.deps.keychain.get({ key: SESSION_KEY })).value);
    return isSession(session) ? session : null;
  }

  /**
   * Restores the session on launch. A token the server no longer accepts (revoked, expired) is
   * deleted; when the server cannot be reached the stored session is kept (`offline`).
   */
  async restore(): Promise<{ session: MobileSession; offline: boolean } | null> {
    const session = await this.stored();
    if (!session) return null;
    if (session.expiresAt && Date.parse(session.expiresAt) <= this.now()) {
      await this.deps.keychain.remove({ key: SESSION_KEY });
      return null;
    }
    let response: Response;
    try {
      response = await this.deps.fetch(`${session.serverUrl}/api/mobile/session`, { headers: { Authorization: `Bearer ${session.token}` } });
    } catch {
      return { session, offline: true };
    }
    if (response.status === 401 || response.status === 403) {
      await this.deps.keychain.remove({ key: SESSION_KEY });
      return null;
    }
    if (!response.ok) return { session, offline: true };
    const current = await response.json().catch(() => null) as { user?: { email?: string; name?: string | null } } | null;
    if (current?.user?.email && (current.user.email !== session.user.email || current.user.name !== session.user.name)) {
      const updated = { ...session, user: { email: current.user.email, name: current.user.name ?? null } };
      await this.deps.keychain.set({ key: SESSION_KEY, value: JSON.stringify(updated) });
      return { session: updated, offline: false };
    }
    return { session, offline: false };
  }

  /**
   * Signs out: revokes the token on the server and always deletes it on the device. `revoked` is
   * false when the server could not be reached; the token then stays valid until it is revoked in
   * the account settings or expires.
   */
  async signOut(): Promise<{ revoked: boolean }> {
    const session = await this.stored();
    let revoked = false;
    if (session) {
      try {
        const response = await this.deps.fetch(`${session.serverUrl}/api/mobile/logout`, { method: "POST", headers: { Authorization: `Bearer ${session.token}` } });
        // 401: already revoked or expired — nothing left to revoke.
        revoked = response.ok || response.status === 401;
      } catch {
        revoked = false;
      }
    }
    await this.deps.keychain.remove({ key: SESSION_KEY });
    return { revoked };
  }
}
