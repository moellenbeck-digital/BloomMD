import type { PayloadHandler, PayloadRequest } from "payload";
import { operatorRole, signedInOperator } from "../access";
import { recordAudit } from "./audit";
import { RATE_LIMITS } from "./env";
import { checkTotp, decryptSecret, encryptSecret, findRecoveryHash, generateRecoveryCodes, hashRecoveryCode, looksLikeRecoveryCode, newTotpSecret, qrDataUrl, totpUri } from "./mfa";
import { mfaSetCookie, sessionIdOf, signMfaCookie } from "./mfa-session";
import { hitRateLimit, poolOf } from "./shared-store";

/**
 * Endpoints of the second factor on the collection `operators` (`/api/operators/mfa/*`), custom because
 * Payload has none (ADR O9, appendix "Ergebnis #206"). They need a session after the password login (the
 * guard in front of `/api` lets every operator session through) and nothing else: this is the only thing a
 * session without the second factor can do besides `me` and `logout`.
 *
 * - `begin`: new secret for the setup (not yet active), returns secret, otpauth URI and QR code.
 * - `confirm`: first code activates the factor and returns the recovery codes once.
 * - `verify`: code (or a recovery code) after the password; sets the second-factor cookie.
 * - `:id/mfa-reset`: admin removes the factor of an operator; the operator has to set it up again.
 */
const json = (status: number, body: unknown, headers: Record<string, string> = {}) => Response.json(body, { status, headers: { "cache-control": "no-store", ...headers } });
const secureCookies = () => process.env.NODE_ENV === "production";

interface MfaRow {
  id: string | number;
  email: string;
  totpSecret?: string | null;
  totpPending?: string | null;
  totpLastStep?: number | null;
  totpEnabledAt?: string | null;
  recoveryHashes?: string[] | null;
}

async function body(req: PayloadRequest): Promise<Record<string, unknown>> {
  try {
    const parsed = req.json ? await req.json() : {};
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

async function load(req: PayloadRequest, id: string | number): Promise<MfaRow | null> {
  try {
    return (await req.payload.findByID({ collection: "operators", id, depth: 0, overrideAccess: true, showHiddenFields: true })) as unknown as MfaRow;
  } catch {
    return null;
  }
}

function sessionCookie(req: PayloadRequest, userId: string): string | null {
  const sid = sessionIdOf(req.headers, req.payload.config.cookiePrefix);
  return sid ? mfaSetCookie(signMfaCookie(userId, sid), { prefix: req.payload.config.cookiePrefix, secure: secureCookies() }) : null;
}

async function throttled(req: PayloadRequest, kind: "code" | "begin", id: string): Promise<Response | null> {
  const window = kind === "code" ? RATE_LIMITS.mfaCodePerOperator : RATE_LIMITS.mfaBeginPerOperator;
  const result = await hitRateLimit(poolOf(req.payload), `mfa-${kind}:${id}`, window.limit, window.windowSeconds);
  return result.allowed ? null : json(429, { error: "rate_limited", message: "Zu viele Versuche. Bitte später erneut versuchen." }, { "retry-after": String(result.retryAfterSeconds) });
}

const unauthorized = () => json(401, { error: "unauthorized" });

export const beginSetup: PayloadHandler = async (req) => {
  const operator = signedInOperator(req);
  if (!operator || operator.blocked) return unauthorized();
  const row = await load(req, operator.id);
  if (!row) return unauthorized();
  if (row.totpEnabledAt) return json(409, { error: "already_enabled", message: "Der zweite Faktor ist schon eingerichtet." });
  const limited = await throttled(req, "begin", operator.id);
  if (limited) return limited;
  const secret = newTotpSecret();
  await req.payload.update({ collection: "operators", id: operator.id, data: { totpPending: encryptSecret(secret) }, overrideAccess: true, depth: 0 });
  const uri = totpUri(secret, row.email);
  return json(200, { secret, uri, qr: qrDataUrl(uri) });
};

export const confirmSetup: PayloadHandler = async (req) => {
  const operator = signedInOperator(req);
  if (!operator || operator.blocked) return unauthorized();
  const row = await load(req, operator.id);
  if (!row) return unauthorized();
  if (row.totpEnabledAt) return json(409, { error: "already_enabled", message: "Der zweite Faktor ist schon eingerichtet." });
  if (!row.totpPending) return json(409, { error: "no_setup", message: "Die Einrichtung wurde nicht gestartet." });
  const limited = await throttled(req, "code", operator.id);
  if (limited) return limited;
  const code = (await body(req)).code;
  const check = typeof code === "string" ? checkTotp(decryptSecret(row.totpPending), code, null) : ({ ok: false } as const);
  if (!check.ok) return json(400, { error: "invalid_code", message: "Der Code ist nicht gültig." });
  const cookie = sessionCookie(req, operator.id);
  if (!cookie) return unauthorized();
  const recoveryCodes = generateRecoveryCodes();
  await req.payload.update({
    collection: "operators",
    id: operator.id,
    data: { totpSecret: row.totpPending, totpPending: null, totpLastStep: check.step, totpEnabledAt: new Date().toISOString(), recoveryHashes: recoveryCodes.map(hashRecoveryCode) },
    overrideAccess: true,
    depth: 0,
  });
  await recordAudit(req, { action: "operator.mfa_enabled", targetType: "operators", targetId: operator.id, targetLabel: row.email, changes: [{ field: "totpEnabledAt", from: null, to: new Date().toISOString() }] });
  return json(200, { ok: true, recoveryCodes }, { "set-cookie": cookie });
};

export const verifyCode: PayloadHandler = async (req) => {
  const operator = signedInOperator(req);
  if (!operator || operator.blocked) return unauthorized();
  const row = await load(req, operator.id);
  if (!row) return unauthorized();
  if (!row.totpEnabledAt || !row.totpSecret) return json(409, { error: "not_enabled", message: "Der zweite Faktor ist noch nicht eingerichtet." });
  const limited = await throttled(req, "code", operator.id);
  if (limited) return limited;
  const code = (await body(req)).code;
  const invalid = () => json(400, { error: "invalid_code", message: "Der Code ist nicht gültig." });
  if (typeof code !== "string" || code.length > 64) return invalid();
  const pool = poolOf(req.payload);
  let recoveryLeft: number | undefined;
  if (looksLikeRecoveryCode(code)) {
    const hashes = row.recoveryHashes ?? [];
    if (findRecoveryHash(hashes, code) < 0) return invalid();
    // One atomic statement: a recovery code works once, also when two requests bring it at the same moment.
    const hash = hashRecoveryCode(code);
    const used = await pool.query(
      `update operators set recovery_hashes = (select coalesce(jsonb_agg(entry), '[]'::jsonb) from jsonb_array_elements(recovery_hashes) entry where entry #>> '{}' <> $1)
       where id = $2 and recovery_hashes @> to_jsonb($1::text) returning jsonb_array_length(recovery_hashes) as left_over`,
      [hash, operator.id],
    );
    if ((used.rowCount ?? 0) !== 1) return invalid();
    recoveryLeft = hashes.length - 1;
    await recordAudit(req, { action: "operator.mfa_recovery_used", targetType: "operators", targetId: operator.id, targetLabel: row.email, changes: [{ field: "recoveryCodesLeft", from: hashes.length, to: recoveryLeft }] });
  } else {
    const check = checkTotp(decryptSecret(row.totpSecret), code, row.totpLastStep);
    if (!check.ok) return invalid();
    // The step is claimed atomically: a code already used (also by a parallel request) is refused.
    const claimed = await pool.query("update operators set totp_last_step = $1 where id = $2 and (totp_last_step is null or totp_last_step < $1)", [check.step, operator.id]);
    if ((claimed.rowCount ?? 0) !== 1) return invalid();
  }
  const cookie = sessionCookie(req, operator.id);
  if (!cookie) return unauthorized();
  return json(200, { ok: true, ...(recoveryLeft === undefined ? {} : { recoveryCodesLeft: recoveryLeft }) }, { "set-cookie": cookie });
};

export const resetFactor: PayloadHandler = async (req) => {
  if (operatorRole(req) !== "admin") return json(403, { error: "forbidden" });
  const id = (req.routeParams as { id?: string } | undefined)?.id;
  const row = id ? await load(req, id) : null;
  if (!id || !row) return json(404, { error: "not_found" });
  await req.payload.update({
    collection: "operators",
    id,
    data: { totpSecret: null, totpPending: null, totpLastStep: null, totpEnabledAt: null, recoveryHashes: [] },
    overrideAccess: true,
    depth: 0,
  });
  // The operator signs in again and sets the factor up anew: every open session ends.
  await poolOf(req.payload).query("delete from operators_sessions where _parent_id = $1", [id]);
  await recordAudit(req, { action: "operator.mfa_reset", targetType: "operators", targetId: id, targetLabel: row.email, changes: [{ field: "totpEnabledAt", from: row.totpEnabledAt ?? null, to: null }] });
  return json(200, { ok: true });
};
