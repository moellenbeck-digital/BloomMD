import { afterEach, describe, expect, test } from "bun:test";
import { hashPassword, verifyPassword, verifyPasswordOrDummy } from "./passwordAuth";
import { isAuthRequired } from "./auth";

describe("password authentication", () => {
  test("accepts the original password and rejects another password", () => {
    const hash = hashPassword("market-ready-42");
    expect(verifyPassword("market-ready-42", hash)).toBe(true);
    expect(verifyPassword("wrong-password-42", hash)).toBe(false);
  });

  test("rejects missing and malformed hashes through the dummy path", () => {
    expect(verifyPasswordOrDummy("unknown-password-42", null)).toBe(false);
    expect(verifyPasswordOrDummy("unknown-password-42", "invalid")).toBe(false);
  });
});

describe("isAuthRequired defaults", () => {
  const original = { require: process.env.BLOOMMD_REQUIRE_AUTH, node: process.env.NODE_ENV };
  const setEnv = (requireAuth: string | undefined, nodeEnv: string) => {
    if (requireAuth === undefined) delete process.env.BLOOMMD_REQUIRE_AUTH;
    else process.env.BLOOMMD_REQUIRE_AUTH = requireAuth;
    Object.defineProperty(process.env, "NODE_ENV", { value: nodeEnv, configurable: true });
  };

  afterEach(() => {
    setEnv(original.require, original.node ?? "test");
  });

  test("requires auth in production when the flag was forgotten", () => {
    setEnv(undefined, "production");
    expect(isAuthRequired()).toBe(true);
  });

  test("stays open for local development when the flag is unset", () => {
    setEnv(undefined, "development");
    expect(isAuthRequired()).toBe(false);
  });

  test("honours an explicit anonymous self-hosted opt-out", () => {
    setEnv("0", "production");
    expect(isAuthRequired()).toBe(false);
  });

  test("honours an explicit requirement", () => {
    setEnv("1", "development");
    expect(isAuthRequired()).toBe(true);
  });
});
