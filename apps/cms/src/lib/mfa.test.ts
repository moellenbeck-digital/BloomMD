import { beforeAll, describe, expect, test } from "bun:test";
import { checkTotp, decryptSecret, encryptSecret, findRecoveryHash, generateRecoveryCodes, hashRecoveryCode, looksLikeRecoveryCode, newTotpSecret, qrDataUrl, totpCodeAt, totpUri } from "./mfa";
import { mfaClearCookie, mfaSetCookie, mfaVerified, readCookie, sessionIdOf, signMfaCookie, verifyMfaCookie } from "./mfa-session";

beforeAll(() => {
  process.env.PAYLOAD_SECRET = "test-secret-test-secret-test-secret-0123";
});

const jwt = (claims: Record<string, unknown>) => `h.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.s`;
const headersOf = (cookie: string) => new Headers({ cookie });

describe("TOTP", () => {
  const secret = newTotpSecret();
  const t0 = Date.UTC(2026, 10, 15, 12, 0, 0);

  test("accepts the code of the current step and one step either side, nothing further away", () => {
    const code = totpCodeAt(secret, t0);
    expect(checkTotp(secret, code, null, t0).ok).toBe(true);
    expect(checkTotp(secret, code, null, t0 + 30_000).ok).toBe(true);
    expect(checkTotp(secret, code, null, t0 - 30_000).ok).toBe(true);
    expect(checkTotp(secret, code, null, t0 + 90_000).ok).toBe(false);
  });

  test("refuses a step that was already used (replay)", () => {
    const code = totpCodeAt(secret, t0);
    const first = checkTotp(secret, code, null, t0);
    expect(first.ok).toBe(true);
    if (first.ok) {
      expect(checkTotp(secret, code, first.step, t0).ok).toBe(false);
      expect(checkTotp(secret, totpCodeAt(secret, t0 + 30_000), first.step, t0 + 30_000).ok).toBe(true);
    }
  });

  test("refuses malformed input and wrong codes; spaces in the code are fine", () => {
    const code = totpCodeAt(secret, t0);
    expect(checkTotp(secret, "12345", null, t0).ok).toBe(false);
    expect(checkTotp(secret, "abcdef", null, t0).ok).toBe(false);
    expect(checkTotp(secret, code === "000000" ? "000001" : "000000", null, t0).ok).toBe(false);
    expect(checkTotp(secret, `${code.slice(0, 3)} ${code.slice(3)}`, null, t0).ok).toBe(true);
  });

  test("uri and QR code carry the secret for the authenticator app, the QR is an image data URL", () => {
    const uri = totpUri(secret, "anna@example.test");
    expect(uri.startsWith("otpauth://totp/")).toBe(true);
    expect(uri).toContain(`secret=${secret}`);
    expect(uri).toContain("issuer=BloomMD");
    expect(qrDataUrl(uri).startsWith("data:image/svg+xml;base64,")).toBe(true);
  });
});

describe("secret at rest", () => {
  test("round trip, a fresh nonce per encryption, nothing readable in the stored value", () => {
    const secret = newTotpSecret();
    const a = encryptSecret(secret);
    const b = encryptSecret(secret);
    expect(a).not.toBe(b);
    expect(a).not.toContain(secret);
    expect(decryptSecret(a)).toBe(secret);
  });

  test("a changed value or another key does not decrypt", () => {
    const stored = encryptSecret("JBSWY3DPEHPK3PXP");
    const parts = stored.split(".");
    expect(() => decryptSecret(`${parts[0]}.${parts[1]}.${parts[2]}.${Buffer.from("x").toString("base64url")}`)).toThrow();
    process.env.PAYLOAD_SECRET = "another-secret-another-secret-0123456789";
    expect(() => decryptSecret(stored)).toThrow();
    process.env.PAYLOAD_SECRET = "test-secret-test-secret-test-secret-0123";
    expect(decryptSecret(stored)).toBe("JBSWY3DPEHPK3PXP");
  });
});

describe("recovery codes", () => {
  test("ten distinct codes in the form xxxxx-xxxxx, stored only as a hash that is not the code", () => {
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    for (const code of codes) {
      expect(code).toMatch(/^[a-z2-9]{5}-[a-z2-9]{5}$/);
      expect(hashRecoveryCode(code)).toMatch(/^[0-9a-f]{64}$/);
      expect(hashRecoveryCode(code)).not.toContain(code.replace("-", ""));
    }
  });

  test("finds a code by its hash regardless of case, dash and spaces; a wrong code does not match", () => {
    const codes = generateRecoveryCodes();
    const hashes = codes.map(hashRecoveryCode);
    expect(findRecoveryHash(hashes, codes[3]!.toUpperCase())).toBe(3);
    expect(findRecoveryHash(hashes, codes[7]!.replace("-", " "))).toBe(7);
    expect(findRecoveryHash(hashes, "aaaaa-aaaaa")).toBe(-1);
  });

  test("tells a recovery code from a 6-digit code", () => {
    expect(looksLikeRecoveryCode("abcde-fghjk")).toBe(true);
    expect(looksLikeRecoveryCode("123456")).toBe(false);
  });
});

describe("second-factor cookie", () => {
  const now = Date.UTC(2026, 10, 15, 12, 0, 0);

  test("is valid for the same operator and session until it expires", () => {
    const cookie = signMfaCookie("op-1", "sid-1", now);
    expect(verifyMfaCookie(cookie, "op-1", "sid-1", now + 1000)).toBe(true);
    expect(verifyMfaCookie(cookie, "op-1", "sid-1", now + 8 * 3600 * 1000 + 1)).toBe(false);
  });

  test("does not work for another operator, another session or without a session", () => {
    const cookie = signMfaCookie("op-1", "sid-1", now);
    expect(verifyMfaCookie(cookie, "op-2", "sid-1", now)).toBe(false);
    expect(verifyMfaCookie(cookie, "op-1", "sid-2", now)).toBe(false);
    expect(verifyMfaCookie(cookie, "op-1", undefined, now)).toBe(false);
    expect(verifyMfaCookie(undefined, "op-1", "sid-1", now)).toBe(false);
  });

  test("a tampered or foreign-signed cookie is refused", () => {
    const cookie = signMfaCookie("op-1", "sid-1", now);
    const [v, body, sig] = cookie.split(".");
    const forged = Buffer.from(JSON.stringify({ u: "op-1", s: "sid-1", e: now + 10 ** 12 })).toString("base64url");
    expect(verifyMfaCookie(`${v}.${forged}.${sig}`, "op-1", "sid-1", now)).toBe(false);
    expect(verifyMfaCookie(`${v}.${body}.${sig}x`, "op-1", "sid-1", now)).toBe(false);
    expect(verifyMfaCookie(`${v}.${body}`, "op-1", "sid-1", now)).toBe(false);
    process.env.PAYLOAD_SECRET = "another-secret-another-secret-0123456789";
    expect(verifyMfaCookie(cookie, "op-1", "sid-1", now)).toBe(false);
    process.env.PAYLOAD_SECRET = "test-secret-test-secret-test-secret-0123";
  });

  test("reads the session id from the session cookie or the Authorization header, ignores junk", () => {
    expect(sessionIdOf(headersOf(`a=b; payload-token=${jwt({ sid: "sid-9" })}`))).toBe("sid-9");
    expect(sessionIdOf(new Headers({ authorization: `JWT ${jwt({ sid: "sid-8" })}` }))).toBe("sid-8");
    expect(sessionIdOf(headersOf("payload-token=garbage"))).toBeUndefined();
    expect(sessionIdOf(headersOf(`payload-token=${jwt({ id: 1 })}`))).toBeUndefined();
    expect(sessionIdOf(undefined)).toBeUndefined();
  });

  test("mfaVerified needs both cookies and a matching session", () => {
    const token = jwt({ sid: "sid-1" });
    const cookie = signMfaCookie("op-1", "sid-1");
    expect(mfaVerified(headersOf(`payload-token=${token}; payload-mfa=${cookie}`), "op-1")).toBe(true);
    expect(mfaVerified(headersOf(`payload-token=${token}`), "op-1")).toBe(false);
    expect(mfaVerified(headersOf(`payload-token=${jwt({ sid: "other" })}; payload-mfa=${cookie}`), "op-1")).toBe(false);
    expect(mfaVerified(headersOf(`payload-mfa=${cookie}`), "op-1")).toBe(false);
  });

  test("the Set-Cookie value is HttpOnly and strict, Secure in production, and can be cleared", () => {
    expect(mfaSetCookie("v", { secure: true })).toBe("payload-mfa=v; Path=/; HttpOnly; SameSite=Strict; Max-Age=28800; Secure");
    expect(mfaSetCookie("v", { secure: false })).not.toContain("Secure");
    expect(mfaClearCookie({ secure: false })).toContain("Max-Age=0");
    expect(readCookie(headersOf("x=1; payload-mfa=abc"), "payload-mfa")).toBe("abc");
  });
});
