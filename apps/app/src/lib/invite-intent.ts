import { createHmac, timingSafeEqual } from "node:crypto";

const HANDOFF_PREFIX = "bloom_invite_intent_v1_";
const HANDOFF_MAX_AGE_MS = 1000 * 60 * 60 * 24;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface WorkspaceInviteHandoffPayload {
  invitationId: string;
  expiresAt: string;
}

export interface WorkspaceInviteHandoff {
  invitationId: string;
  expiresAt: string;
}

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

function sign(encodedPayload: string) {
  return createHmac("sha256", authSecret()).update(encodedPayload).digest("base64url");
}

export function createWorkspaceInviteHandoff(input: { invitationId: string; expiresAt: string }) {
  if (!UUID_PATTERN.test(input.invitationId)) throw new Error("Invalid workspace invitation id.");
  const expiresAt = new Date(input.expiresAt);
  if (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) throw new Error("Workspace invitation is no longer active.");
  // The database invitation may live for up to 30 days, but the auth continuation must stay
  // short-lived. Re-opening the original invite URL creates a fresh handoff when this one expires.
  const handoffExpiresAt = new Date(Math.min(expiresAt.getTime(), Date.now() + HANDOFF_MAX_AGE_MS));
  const payload: WorkspaceInviteHandoffPayload = { invitationId: input.invitationId, expiresAt: handoffExpiresAt.toISOString() };
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${HANDOFF_PREFIX}${encodedPayload}.${sign(encodedPayload)}`;
}

export function parseWorkspaceInviteHandoff(value: string | null | undefined): WorkspaceInviteHandoff | null {
  if (!value || value.length > 320 || !value.startsWith(HANDOFF_PREFIX)) return null;
  const signedValue = value.slice(HANDOFF_PREFIX.length);
  const [encodedPayload, signature] = signedValue.split(".");
  if (!encodedPayload || !signature) return null;
  const expected = sign(encodedPayload);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as Partial<WorkspaceInviteHandoffPayload>;
    const expiresAt = new Date(String(payload.expiresAt ?? ""));
    if (!UUID_PATTERN.test(String(payload.invitationId ?? "")) || !Number.isFinite(expiresAt.getTime())) return null;
    if (expiresAt.getTime() <= Date.now() || expiresAt.getTime() > Date.now() + HANDOFF_MAX_AGE_MS) return null;
    return { invitationId: payload.invitationId!, expiresAt: expiresAt.toISOString() };
  } catch {
    return null;
  }
}

export function appendAuthParams(path: string, params: Record<string, string | null | undefined>) {
  const [pathname = "/", query = ""] = path.split("?", 2);
  const search = new URLSearchParams(query);
  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === "") search.delete(key);
    else search.set(key, value);
  }
  const serialized = serializeAuthParams(search);
  return serialized ? `${pathname}?${serialized}` : pathname;
}

/** Keep auth links readable and compatible with existing redirects that use %20 for spaces. */
export function serializeAuthParams(params: URLSearchParams) {
  return params.toString().replace(/\+/g, "%20");
}
