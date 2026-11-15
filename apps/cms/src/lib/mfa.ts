import { createCipheriv, createDecipheriv, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { Secret, TOTP } from "otpauth";
import qrcode from "qrcode-generator";
import { derivedKey } from "./mfa-session";

/**
 * Second factor of the operators, own build (decision in ticket #206, appendix "Ergebnis #206" of the
 * ADR): TOTP (RFC 6238, SHA-1, 6 digits, 30 s, the setting every authenticator app supports), the secret
 * encrypted at rest (AES-256-GCM, key derived from `PAYLOAD_SECRET`), recovery codes only as a keyed hash.
 * Pure functions; the storage and the endpoints are in `collections/Operators.ts`.
 */
const ISSUER = "BloomMD CMS";
const PERIOD_SECONDS = 30;
export const RECOVERY_CODE_COUNT = 10;

export function newTotpSecret(): string {
  return new Secret({ size: 20 }).base32;
}

function totpOf(secret: string, label = "operator"): TOTP {
  return new TOTP({ issuer: ISSUER, label, algorithm: "SHA1", digits: 6, period: PERIOD_SECONDS, secret: Secret.fromBase32(secret) });
}

export function totpUri(secret: string, label: string): string {
  return totpOf(secret, label).toString();
}

/** SVG of the QR code as a data URL (shown in an `<img>`, so no markup is ever injected into the page). */
export function qrDataUrl(text: string): string {
  const code = qrcode(0, "M");
  code.addData(text);
  code.make();
  const svg = code.createSvgTag({ cellSize: 6, margin: 4, scalable: true });
  return `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
}

export type TotpCheck = { ok: true; step: number } | { ok: false };

/**
 * Checks a 6-digit code (one step either side for clock drift). A step that was already used is refused
 * (`lastStep`), so a code observed over the shoulder or in a log works once at most.
 */
export function checkTotp(secret: string, code: string, lastStep: number | null | undefined, now: number = Date.now()): TotpCheck {
  const token = code.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(token)) return { ok: false };
  const delta = totpOf(secret).validate({ token, timestamp: now, window: 1 });
  if (delta === null) return { ok: false };
  const step = Math.floor(now / 1000 / PERIOD_SECONDS) + delta;
  if (typeof lastStep === "number" && step <= lastStep) return { ok: false };
  return { ok: true, step };
}

/** Code for a point in time; used by tests and nowhere else. */
export function totpCodeAt(secret: string, now: number): string {
  return totpOf(secret).generate({ timestamp: now });
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", derivedKey("operator-totp-secret"), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `v1.${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${data.toString("base64url")}`;
}

export function decryptSecret(stored: string): string {
  const [version, iv, tag, data] = stored.split(".");
  if (version !== "v1" || !iv || !tag || !data) throw new Error("Unknown format of the stored secret.");
  const decipher = createDecipheriv("aes-256-gcm", derivedKey("operator-totp-secret"), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}

/** No 0, 1, i, l, o: codes are read from paper. */
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

/** Ten codes of 10 characters (about 50 bits each), written `xxxxx-xxxxx`. Shown once, stored only as hashes. */
export function generateRecoveryCodes(count: number = RECOVERY_CODE_COUNT): string[] {
  return Array.from({ length: count }, () => {
    const chars = Array.from({ length: 10 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
    return `${chars.slice(0, 5)}-${chars.slice(5)}`;
  });
}

const normalizeRecovery = (code: string) => code.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Keyed hash (HMAC-SHA-256): the stored value alone does not allow to test guesses offline. */
export function hashRecoveryCode(code: string): string {
  return createHmac("sha256", derivedKey("operator-recovery-code")).update(normalizeRecovery(code)).digest("hex");
}

export function looksLikeRecoveryCode(input: string): boolean {
  return normalizeRecovery(input).length === 10;
}

/** Position of the matching hash (constant-time compare against every entry), or -1. */
export function findRecoveryHash(hashes: readonly string[], code: string): number {
  const wanted = Buffer.from(hashRecoveryCode(code));
  let found = -1;
  hashes.forEach((hash, index) => {
    const candidate = Buffer.from(hash);
    if (candidate.length === wanted.length && timingSafeEqual(candidate, wanted)) found = index;
  });
  return found;
}
