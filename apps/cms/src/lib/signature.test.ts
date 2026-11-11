import { describe, expect, test } from "bun:test";
import { SIGNATURE_TOLERANCE_MS, canonicalString, signCall, verifySignature, type SignedCall } from "./signature";

const KEY_A = "a".repeat(40);
const KEY_B = "b".repeat(40);
const NOW = 1_800_000_000_000;

function call(overrides: Partial<SignedCall> = {}): SignedCall {
  return { method: "POST", pathAndQuery: "/svc/v1/auth/login", body: '{"email":"a@b.de"}', timestamp: String(NOW), nonce: "nonce-0123456789abcdef", ...overrides };
}

function headersFor(c: SignedCall, key = KEY_A): Headers {
  return new Headers({ "x-svc-signature": signCall(key, c), "x-svc-timestamp": c.timestamp, "x-svc-nonce": c.nonce });
}

function verify(c: SignedCall, headers: Headers, keys = [KEY_A], now = NOW) {
  return verifySignature({ keys, method: c.method, pathAndQuery: c.pathAndQuery, body: c.body, headers, now });
}

describe("signed calls of the app (ADR 3)", () => {
  test("a valid signature is accepted and returns the nonce", () => {
    const c = call();
    expect(verify(c, headersFor(c))).toEqual({ ok: true, nonce: c.nonce });
  });

  test("the canonical string binds method, path with query, body hash, timestamp and nonce", () => {
    const lines = canonicalString(call()).split("\n");
    expect(lines[0]).toBe("v1");
    expect(lines[1]).toBe("POST");
    expect(lines[2]).toBe("/svc/v1/auth/login");
    expect(lines[3]).toMatch(/^[0-9a-f]{64}$/);
    expect(lines.slice(4)).toEqual([String(NOW), "nonce-0123456789abcdef"]);
  });

  test("changing method, path, query, body, timestamp or nonce invalidates the signature", () => {
    const base = call();
    const headers = headersFor(base);
    for (const changed of [
      call({ method: "PUT" }),
      call({ pathAndQuery: "/svc/v1/users" }),
      call({ pathAndQuery: "/svc/v1/auth/login?x=1" }),
      call({ body: '{"email":"c@d.de"}' }),
    ]) {
      expect(verify(changed, headers)).toEqual({ ok: false, reason: "bad_signature" });
    }
    const otherNonce = call({ nonce: "other-nonce-0123456789" });
    expect(verify(otherNonce, new Headers({ "x-svc-signature": headers.get("x-svc-signature")!, "x-svc-timestamp": base.timestamp, "x-svc-nonce": otherNonce.nonce })).ok).toBe(false);
  });

  test("the timestamp tolerance is exactly 60 seconds in both directions", () => {
    const c = call();
    const headers = headersFor(c);
    expect(SIGNATURE_TOLERANCE_MS).toBe(60_000);
    expect(verify(c, headers, [KEY_A], NOW + 60_000).ok).toBe(true);
    expect(verify(c, headers, [KEY_A], NOW - 60_000).ok).toBe(true);
    expect(verify(c, headers, [KEY_A], NOW + 60_001)).toEqual({ ok: false, reason: "stale" });
    expect(verify(c, headers, [KEY_A], NOW - 60_001)).toEqual({ ok: false, reason: "stale" });
  });

  test("two keys are valid at the same time (rotation); an unknown key is not", () => {
    const c = call();
    expect(verify(c, headersFor(c, KEY_A), [KEY_A, KEY_B]).ok).toBe(true);
    expect(verify(c, headersFor(c, KEY_B), [KEY_A, KEY_B]).ok).toBe(true);
    expect(verify(c, headersFor(c, KEY_B), [KEY_A]).ok).toBe(false);
    expect(verify(c, headersFor(c, "c".repeat(40)), [KEY_A, KEY_B]).ok).toBe(false);
  });

  test("missing and malformed headers are rejected without a lookup", () => {
    const c = call();
    expect(verify(c, new Headers())).toEqual({ ok: false, reason: "missing" });
    expect(verify(c, new Headers({ "x-svc-signature": "zz", "x-svc-timestamp": c.timestamp, "x-svc-nonce": c.nonce }))).toEqual({ ok: false, reason: "malformed" });
    const short = new Headers({ "x-svc-signature": signCall(KEY_A, c), "x-svc-timestamp": c.timestamp, "x-svc-nonce": "short" });
    expect(verify(c, short)).toEqual({ ok: false, reason: "malformed" });
    const noKeys = verify(c, headersFor(c), []);
    expect(noKeys.ok).toBe(false);
  });
});
