import { createHash, randomBytes } from "node:crypto";
import { describe, expect, test } from "bun:test";
import {
  hashSecret,
  isValidAuthCode,
  isValidChallenge,
  isValidState,
  isValidVerifier,
  mobileRedirectUrl,
  mobileTokenName,
  normalizeDeviceName,
  pkceChallenge,
  verifyPkce,
  verifyStateHash,
} from "./mobile-auth";

const verifier = randomBytes(32).toString("base64url");

describe("app sign-in (PKCE)", () => {
  test("S256 challenge is the base64url SHA-256 of the verifier", () => {
    const challenge = pkceChallenge(verifier);
    expect(challenge).toBe(createHash("sha256").update(verifier).digest("base64url"));
    expect(isValidChallenge(challenge)).toBe(true);
    expect(verifyPkce(verifier, challenge)).toBe(true);
  });

  test("a different, short or malformed verifier does not match", () => {
    const challenge = pkceChallenge(verifier);
    expect(verifyPkce(randomBytes(32).toString("base64url"), challenge)).toBe(false);
    expect(verifyPkce(verifier.slice(0, 42), pkceChallenge(verifier.slice(0, 42)))).toBe(false);
    expect(verifyPkce(`${verifier}+`, challenge)).toBe(false);
    expect(verifyPkce(verifier, challenge.slice(0, 42))).toBe(false);
    // A "plain" challenge (the verifier itself) is never accepted.
    expect(verifyPkce(verifier, verifier)).toBe(false);
  });

  test("state is compared against its stored hash", () => {
    const state = randomBytes(16).toString("base64url");
    expect(verifyStateHash(state, hashSecret(state))).toBe(true);
    expect(verifyStateHash(`${state}x`, hashSecret(state))).toBe(false);
    expect(isValidState("short")).toBe(false);
  });

  test("validates codes, verifiers and challenges strictly", () => {
    expect(isValidAuthCode(`bloom_mac_${randomBytes(32).toString("base64url")}`)).toBe(true);
    expect(isValidAuthCode(`bloom_pat_${randomBytes(32).toString("base64url")}`)).toBe(false);
    expect(isValidAuthCode(42)).toBe(false);
    expect(isValidVerifier("a".repeat(129))).toBe(false);
    expect(isValidChallenge("a".repeat(44))).toBe(false);
  });

  test("redirects only to the app scheme", () => {
    expect(mobileRedirectUrl({ code: "bloom_mac_x", state: "s".repeat(16) })).toBe(`bloommd://auth?code=bloom_mac_x&state=${"s".repeat(16)}`);
    expect(mobileRedirectUrl({ error: "access_denied", state: "s".repeat(16) })).toBe(`bloommd://auth?error=access_denied&state=${"s".repeat(16)}`);
  });

  test("device names are cleaned for display", () => {
    expect(normalizeDeviceName("  Max’ iPad \n Pro ")).toBe("Max’ iPad Pro");
    expect(normalizeDeviceName("<script>")).toBe("script");
    expect(normalizeDeviceName("\u0000\u0007")).toBeNull();
    expect(normalizeDeviceName(undefined)).toBeNull();
    expect([...normalizeDeviceName("x".repeat(200))!]).toHaveLength(60);
    expect(mobileTokenName("iPad")).toBe("BloomMD App (iPad)");
  });
});
