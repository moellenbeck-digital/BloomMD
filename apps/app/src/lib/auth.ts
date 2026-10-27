import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import {
  createSessionRecord,
  isDatabaseConfigured,
  isSessionRecordActive,
  normalizeUuid,
  resolveAccessToken,
  revokeSessionRecord,
} from "./db";

export interface BloomSession {
  provider: "local" | "password";
  userId?: string;
  email: string;
  name?: string;
  createdAt: number;
  sessionId?: string;
}

export interface ApiRequestIdentity {
  authKind: "session" | "access-token" | "instance-key" | "anonymous";
  userId?: string;
  email?: string;
  name?: string;
  filesystemScope?: string;
  /** Access-token limits; absent for sessions. */
  tokenId?: string;
  tokenScope?: "read" | "write";
  tokenWorkspaceIds?: string[] | null;
  agentName?: string | null;
  /** Agent tokens: may create read-only share links. */
  tokenAllowShare?: boolean;
  /** 'mobile_app' for tokens issued by the app sign-in. */
  tokenClient?: "mobile_app" | null;
  tokenExpiresAt?: string | null;
}

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** Rights, proposals and change log of agent tokens: tools of the workspace owner, never of an agent. */
const AGENT_OWNER_PATH = /^\/api\/workspaces\/[^/]+\/(agent-rights|agent-token-proposals|agent-log)(\/|$)/;

/**
 * Whether a token's limits allow this request. Limited tokens (read-only, bound to workspaces or
 * named for an agent) exist for agents and only reach the document API; everything else (account,
 * members, billing) needs a full token or a session. A person's limited token may also use the
 * owner tools for agent rights; an agent token never may, so it cannot widen its own rights.
 */
export function accessTokenAllows(request: Request, token: { scope: "read" | "write"; workspaceIds: string[] | null; agentName?: string | null }): boolean {
  if (token.scope === "read" && !READ_METHODS.has(request.method.toUpperCase())) return false;
  const limited = token.scope === "read" || Boolean(token.workspaceIds?.length) || Boolean(token.agentName);
  if (!limited) return true;
  try {
    const path = new URL(request.url).pathname;
    if (!token.agentName && AGENT_OWNER_PATH.test(path)) return true;
    return path === "/api/mindmaps" || path.startsWith("/api/mindmaps/") || (token.scope === "write" && path === "/api/sync-ticket");
  } catch {
    return false;
  }
}

const SESSION_COOKIE = "bloommd_session";
const SESSION_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 30;
export const SESSION_MAX_AGE_SECONDS = SESSION_MAX_AGE_MS / 1000;

function authSecret() {
  const secret = process.env.BLOOMMD_AUTH_SECRET;
  if (secret) {
    if (process.env.NODE_ENV === "production" && secret.length < 32) {
      throw new Error("BLOOMMD_AUTH_SECRET must contain at least 32 characters in production.");
    }
    return secret;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("BLOOMMD_AUTH_SECRET must be configured in production.");
  }
  return "dev-secret-change-before-production";
}

function encode(input: string) {
  return Buffer.from(input, "utf-8").toString("base64url");
}

function decode(input: string) {
  return Buffer.from(input, "base64url").toString("utf-8");
}

function sign(payload: string) {
  return createHmac("sha256", authSecret()).update(payload).digest("base64url");
}

function isAllowedEmail(email: string) {
  const allowed = process.env.BLOOMMD_ALLOWED_EMAILS?.split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
  if (!allowed || allowed.length === 0) return true;
  return allowed.includes(email.toLowerCase());
}

export function isAuthRequired() {
  const configured = process.env.BLOOMMD_REQUIRE_AUTH;
  if (configured === "1") return true;
  // Self-hosted filesystem mode stays open only when anonymous access is chosen explicitly.
  if (configured === "0") return false;
  // Unset: local development keeps working, but a production build must never serve documents
  // anonymously just because the flag was forgotten in the deployment environment.
  return process.env.NODE_ENV === "production";
}

export { isE2EAuthBypassEnabled } from "./e2e-mode";

export function createSessionToken(session: BloomSession) {
  const payload = encode(JSON.stringify(session));
  return `${payload}.${sign(payload)}`;
}

export async function issueSession(input: Omit<BloomSession, "createdAt" | "sessionId">) {
  const createdAt = Date.now();
  const userId = normalizeUuid(input.userId);
  const sessionId = userId && isDatabaseConfigured()
    ? await createSessionRecord(userId, new Date(createdAt + SESSION_MAX_AGE_MS).toISOString())
    : undefined;
  if (userId && isDatabaseConfigured() && !sessionId) throw new Error("Session konnte nicht erstellt werden.");
  return createSessionToken({ ...input, createdAt, sessionId: sessionId ?? undefined });
}

export function parseSessionToken(token?: string): BloomSession | null {
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;

  const expected = sign(payload);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) {
    return null;
  }

  try {
    const session = JSON.parse(decode(payload)) as BloomSession;
    if (!session.email || !isAllowedEmail(session.email)) return null;
    const now = Date.now();
    if (
      !Number.isFinite(session.createdAt) ||
      session.createdAt > now + 5 * 60 * 1000 ||
      now - session.createdAt > SESSION_MAX_AGE_MS
    ) return null;
    session.provider ??= "local";
    return session;
  } catch {
    return null;
  }
}

export async function getSession() {
  const cookieStore = await cookies();
  const session = parseSessionToken(cookieStore.get(SESSION_COOKIE)?.value);
  if (!session) return null;

  const userId = normalizeUuid(session.userId);
  if (userId && isDatabaseConfigured()) {
    if (!session.sessionId || !(await isSessionRecordActive(userId, session.sessionId))) return null;
  }
  return session;
}

export async function revokeCurrentSession() {
  const session = await getSession();
  const userId = normalizeUuid(session?.userId);
  if (!session?.sessionId || !userId) return false;
  return revokeSessionRecord(userId, session.sessionId);
}

export async function getApiRequestIdentity(request: Request): Promise<ApiRequestIdentity | null> {
  const authorization = request.headers.get("Authorization");
  if (authorization?.startsWith("Bearer ")) {
    const resolved = await resolveAccessToken(authorization.slice(7).trim());
    if (resolved) {
      // A valid but limited token never falls back to the browser session.
      if (!accessTokenAllows(request, resolved)) return null;
      return {
        authKind: "access-token",
        userId: resolved.userId,
        email: resolved.email,
        name: resolved.name ?? undefined,
        tokenId: resolved.tokenId,
        tokenScope: resolved.scope,
        tokenWorkspaceIds: resolved.workspaceIds,
        agentName: resolved.agentName,
        tokenAllowShare: resolved.allowShare,
        tokenClient: resolved.client,
        tokenExpiresAt: resolved.expiresAt,
      };
    }
  }

  const session = await getSession();
  if (session) {
    return { authKind: "session", userId: session.userId, email: session.email, name: session.name };
  }

  const configuredKey = process.env.BLOOMMD_API_KEY;
  const providedKey = request.headers.get("X-API-Key");
  if (configuredKey && providedKey) {
    const configuredBuffer = Buffer.from(configuredKey);
    const providedBuffer = Buffer.from(providedKey);
    if (configuredBuffer.length === providedBuffer.length && timingSafeEqual(configuredBuffer, providedBuffer)) {
      return { authKind: "instance-key", filesystemScope: `instance:${configuredKey}` };
    }
  }

  return isAuthRequired() ? null : { authKind: "anonymous" };
}

export async function isApiRequestAuthorized(request: Request) {
  return Boolean(await getApiRequestIdentity(request));
}

export function sessionCookieName() {
  return SESSION_COOKIE;
}

export function shouldUseSecureCookies(requestUrl: string) {
  try {
    const url = new URL(process.env.NEXT_PUBLIC_SITE_URL || requestUrl);
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Raised when an address is malformed or not permitted for this instance.
 *
 * A class rather than a plain `Error` so callers can tell this apart from an unexpected failure.
 * The alternative — matching on the message text — breaks the moment the wording changes, and
 * wording changes for reasons that have nothing to do with control flow.
 */
export class InvalidEmailError extends Error {
  constructor(message: string, readonly reason: "malformed" | "not-allowed") {
    super(message);
    this.name = "InvalidEmailError";
  }
}

export function validateLoginEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new InvalidEmailError("Bitte gib eine gültige E-Mail-Adresse ein.", "malformed");
  }
  if (!isAllowedEmail(normalized)) {
    throw new InvalidEmailError("Diese E-Mail ist für diese BloomMD-Instanz nicht freigeschaltet.", "not-allowed");
  }
  return normalized;
}

export function safeNextPath(value: FormDataEntryValue | string | null | undefined, fallback = "/app") {
  const next = String(value || fallback);
  if (!next.startsWith("/") || next.startsWith("//")) return fallback;

  try {
    const parsed = new URL(next, "http://bloommd.local");
    if (parsed.origin !== "http://bloommd.local") return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}
