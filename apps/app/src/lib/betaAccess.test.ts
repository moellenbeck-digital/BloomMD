import { describe, expect, test } from "bun:test";
import {
  assertBetaSignupAllowed,
  BetaAccessError,
  isBetaGateEnabled,
  isEmailInvited,
  isInviteCodeValid,
} from "./betaAccess";

const env = (values: Record<string, string>): NodeJS.ProcessEnv => values as unknown as NodeJS.ProcessEnv;
const gate = (extra: Record<string, string> = {}): NodeJS.ProcessEnv =>
  env({ BLOOMMD_BETA_ACCESS: "1", ...extra });

describe("beta gate switch", () => {
  test("is off unless explicitly enabled", () => {
    expect(isBetaGateEnabled(env({}))).toBe(false);
    expect(isBetaGateEnabled(env({ BLOOMMD_BETA_ACCESS: "0" }))).toBe(false);
    expect(isBetaGateEnabled(env({ BLOOMMD_BETA_ACCESS: "true" }))).toBe(false);
    expect(isBetaGateEnabled(gate())).toBe(true);
  });

  test("lets every signup through while it is off", () => {
    expect(() => assertBetaSignupAllowed({ email: "anyone@example.com" }, env({}))).not.toThrow();
  });
});

describe("invited emails", () => {
  const invited = gate({ BLOOMMD_BETA_ALLOWED_EMAILS: "Tester@Example.com, second@example.org, @partner.de" });

  test("matches case-insensitively and ignores surrounding spaces", () => {
    expect(isEmailInvited("tester@example.com", invited)).toBe(true);
    expect(isEmailInvited("  TESTER@EXAMPLE.COM  ", invited)).toBe(true);
  });

  test("invites a whole domain when the entry starts with @", () => {
    expect(isEmailInvited("anyone@partner.de", invited)).toBe(true);
    expect(isEmailInvited("anyone@notpartner.de", invited)).toBe(false);
  });

  test("rejects an address that is not on the list", () => {
    expect(isEmailInvited("stranger@example.com", invited)).toBe(false);
  });

  test("invites nobody when the list is empty", () => {
    expect(isEmailInvited("tester@example.com", gate())).toBe(false);
  });

  test("does not match a suffix by accident", () => {
    // "evil-tester@example.com" must not pass because it ends with an invited address' local part.
    expect(isEmailInvited("evil-tester@example.com", invited)).toBe(false);
  });
});

describe("invite codes", () => {
  const codes = gate({ BLOOMMD_BETA_INVITE_CODES: "bloom-alpha-1, bloom-alpha-2" });

  test("accepts a configured code", () => {
    expect(isInviteCodeValid("bloom-alpha-1", codes)).toBe(true);
    expect(isInviteCodeValid("  bloom-alpha-2  ", codes)).toBe(true);
  });

  test("rejects an unknown, empty or partial code", () => {
    expect(isInviteCodeValid("bloom-alpha-3", codes)).toBe(false);
    expect(isInviteCodeValid("", codes)).toBe(false);
    expect(isInviteCodeValid(null, codes)).toBe(false);
    expect(isInviteCodeValid("bloom-alpha", codes)).toBe(false);
  });

  test("rejects everything when no code is configured", () => {
    expect(isInviteCodeValid("anything", gate())).toBe(false);
  });
});

describe("signup gate", () => {
  test("admits an invited address without a code", () => {
    const env = gate({ BLOOMMD_BETA_ALLOWED_EMAILS: "tester@example.com" });
    expect(() => assertBetaSignupAllowed({ email: "tester@example.com" }, env)).not.toThrow();
  });

  test("admits any address that presents a valid code", () => {
    const env = gate({ BLOOMMD_BETA_INVITE_CODES: "bloom-alpha-1" });
    expect(() => assertBetaSignupAllowed({ email: "stranger@example.com", inviteCode: "bloom-alpha-1" }, env)).not.toThrow();
  });

  test("refuses an uninvited address with no code", () => {
    const env = gate({ BLOOMMD_BETA_ALLOWED_EMAILS: "tester@example.com" });
    expect(() => assertBetaSignupAllowed({ email: "stranger@example.com" }, env)).toThrow(BetaAccessError);
    expect(() => assertBetaSignupAllowed({ email: "stranger@example.com" }, env)).toThrow("Diese E-Mail ist noch nicht für die Beta freigeschaltet.");
  });

  test("refuses a wrong code", () => {
    const env = gate({ BLOOMMD_BETA_INVITE_CODES: "bloom-alpha-1" });
    expect(() => assertBetaSignupAllowed({ email: "stranger@example.com", inviteCode: "guess" }, env)).toThrow(BetaAccessError);
    expect(() => assertBetaSignupAllowed({ email: "stranger@example.com", inviteCode: "guess" }, env)).toThrow("Der Einladungscode ist ungültig.");
  });

  test("closes the door completely when the gate is on but nothing is configured", () => {
    // Fail closed: a half-configured deployment must not become an open signup form.
    expect(() => assertBetaSignupAllowed({ email: "anyone@example.com" }, gate())).toThrow(BetaAccessError);
  });
});
