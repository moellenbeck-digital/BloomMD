import { describe, expect, test } from "bun:test";
import { canonicalEmail } from "./email-canonical";
import { passwordRuleError } from "./password-rule";
import { isEmail, isUuid, parseRegister } from "./identity";
import { SvcError } from "./svc-error";
import { MIN_READ_TOKEN_LENGTH, generateToken, hashToken } from "./token";

describe("canonical mailbox (#169), same rule as apps/app", () => {
  test.each([
    ["Max.Mustermann@Example.DE", "max.mustermann@example.de"],
    ["max+shop@example.de", "max@example.de"],
    ["a.b.c@gmail.com", "abc@gmail.com"],
    ["abc+x@googlemail.com", "abc@gmail.com"],
    ["A.B.C+Tag@GoogleMail.com", "abc@gmail.com"],
    ["+tag@example.de", "+tag@example.de"],
    ["no-at-sign", "no-at-sign"],
  ])("%s -> %s", (input, expected) => {
    expect(canonicalEmail(input)).toBe(expected);
  });
});

describe("password rule (same as apps/app)", () => {
  test("at least 10 characters, letters and digits", () => {
    expect(passwordRuleError("kurz1")).toContain("10 Zeichen");
    expect(passwordRuleError("nurbuchstaben")).toContain("Buchstaben und Zahlen");
    expect(passwordRuleError("1234567890123")).toContain("Buchstaben und Zahlen");
    expect(passwordRuleError("Sup3rGeheim123")).toBeNull();
    expect(passwordRuleError("abcdefghi1")).toBeNull();
    expect(passwordRuleError("abcdefgh1")).not.toBeNull();
  });
});

describe("tokens", () => {
  test("a generated token has 256 bits, the hash is a different 64-character hex string", () => {
    const token = generateToken();
    expect(token.length).toBeGreaterThanOrEqual(MIN_READ_TOKEN_LENGTH);
    expect(hashToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(token)).not.toBe(token);
    expect(generateToken()).not.toBe(token);
  });
});

describe("registration input", () => {
  const id = "11111111-2222-4333-8444-555555555555";
  const valid = { id, email: " Max@Example.de ", password: "Sup3rGeheim123", locale: "en" };

  test("a valid input is normalised", () => {
    expect(parseRegister(valid)).toMatchObject({ id, email: "max@example.de", locale: "en", origin: "registration" });
    expect(isUuid(id)).toBe(true);
    expect(isEmail("a@b.de")).toBe(true);
    expect(isEmail("a b@c.de")).toBe(false);
  });

  test("invalid input is a 400 with the offending fields", () => {
    const fields = (input: Record<string, unknown>) => {
      try {
        parseRegister(input);
      } catch (error) {
        expect(error).toBeInstanceOf(SvcError);
        expect((error as SvcError).status).toBe(400);
        return Object.keys((error as SvcError).extra.fields as object);
      }
      throw new Error("expected a 400");
    };
    expect(fields({ ...valid, id: "nope" })).toEqual(["id"]);
    expect(fields({ ...valid, email: "x" })).toEqual(["email"]);
    expect(fields({ ...valid, password: "kurz1" })).toEqual(["password"]);
    expect(fields({ ...valid, password: undefined })).toEqual(["password"]);
    expect(fields({ ...valid, locale: "fr" })).toEqual(["locale"]);
    expect(fields({ ...valid, origin: "x" })).toEqual(["origin"]);
  });

  test("a waitlist account has no password", () => {
    expect(parseRegister({ id, email: "w@example.de", origin: "waitlist" })).toMatchObject({ origin: "waitlist", password: undefined });
    expect(() => parseRegister({ id, email: "w@example.de", origin: "waitlist", password: "Sup3rGeheim123" })).toThrow();
  });
});
