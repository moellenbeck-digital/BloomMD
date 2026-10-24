import { createHmac, timingSafeEqual } from "node:crypto";

export interface SyncTicketClaims {
  userId: string;
  workspaceId: string;
  documentId: string;
  filename: string;
  permission: "read" | "write";
  exp: number;
}

function encode(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function decode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signature(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function signSyncTicket(claims: SyncTicketClaims, secret: string) {
  if (secret.length < 32) throw new Error("BLOOMMD_SYNC_SECRET must contain at least 32 characters.");
  const payload = encode(JSON.stringify(claims));
  return `${payload}.${signature(payload, secret)}`;
}

export function verifySyncTicket(token: string | null | undefined, secret: string, now = Date.now()): SyncTicketClaims | null {
  if (!token || secret.length < 32) return null;
  const [payload, providedSignature] = token.split(".");
  if (!payload || !providedSignature) return null;

  const expected = Buffer.from(signature(payload, secret));
  const provided = Buffer.from(providedSignature);
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) return null;

  try {
    const claims = JSON.parse(decode(payload)) as SyncTicketClaims;
    if (!claims.userId || !claims.workspaceId || !claims.documentId || !claims.filename) return null;
    if (claims.permission !== "read" && claims.permission !== "write") return null;
    if (!Number.isFinite(claims.exp) || claims.exp * 1000 <= now) return null;
    return claims;
  } catch {
    return null;
  }
}
