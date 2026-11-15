import { describe, expect, test } from "bun:test";
import {
  MAX_TRIAL_AHEAD_DAYS,
  parseAccountId,
  parseAddress,
  parseDays,
  parseInstant,
  parseOperator,
  planTrialEnd,
  reminderKindsToReset,
  TrialAdminError,
  trialExceptionKey,
} from "./trial-admin";

const DAY = 24 * 60 * 60 * 1000;
const now = new Date("2026-12-01T10:00:00.000Z");
const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (error) {
    return error instanceof TrialAdminError ? error.code : "other";
  }
  return null;
};

describe("operator command arguments (#277)", () => {
  test("the operator is a handle, never an address", () => {
    expect(parseOperator("max.m")).toBe("max.m");
    expect(code(() => parseOperator("max@example.test"))).toBe("operator-invalid");
    expect(code(() => parseOperator(""))).toBe("operator-invalid");
    expect(code(() => parseOperator(undefined))).toBe("operator-invalid");
    expect(code(() => parseOperator("a"))).toBe("operator-invalid");
  });

  test("the account is a UUID, the address an e-mail address in lowercase", () => {
    expect(parseAccountId("11111111-1111-4111-8111-111111111111")).toBe("11111111-1111-4111-8111-111111111111");
    expect(code(() => parseAccountId("someone@example.test"))).toBe("account-invalid");
    expect(code(() => parseAccountId("1"))).toBe("account-invalid");
    expect(parseAddress("  Person+B@Example.TEST ")).toBe("person+b@example.test");
    expect(code(() => parseAddress("no-address"))).toBe("address-invalid");
  });

  test("days are whole numbers within the limit; an instant needs a zone", () => {
    expect(parseDays("30", 366, "--um")).toBe(30);
    for (const bad of ["0", "-1", "1.5", "abc", "367", undefined]) expect(code(() => parseDays(bad, 366, "--um"))).toBe("days-invalid");
    expect(parseInstant("2027-02-01T00:00:00Z").toISOString()).toBe("2027-02-01T00:00:00.000Z");
    expect(parseInstant("2027-02-01T01:00:00+01:00").toISOString()).toBe("2027-02-01T00:00:00.000Z");
    for (const bad of ["2027-02-01", "2027-02-01T00:00:00", "tomorrow", "2027-13-45T00:00:00Z"]) expect(code(() => parseInstant(bad))).toBe("end-invalid");
  });
});

describe("planTrialEnd", () => {
  const oldEnd = new Date(now.getTime() + 5 * DAY);

  test("an absolute end must lie after the old end and in the future", () => {
    const next = new Date(now.getTime() + 20 * DAY);
    expect(planTrialEnd({ oldEnd, now, endsAt: next })).toEqual(next);
    expect(code(() => planTrialEnd({ oldEnd, now, endsAt: oldEnd }))).toBe("end-not-later");
    expect(code(() => planTrialEnd({ oldEnd, now, endsAt: new Date(now.getTime() + DAY) }))).toBe("end-not-later");
    expect(code(() => planTrialEnd({ oldEnd: null, now, endsAt: new Date(now.getTime() - DAY) }))).toBe("end-in-past");
  });

  test("days count from the later of the old end and now", () => {
    expect(planTrialEnd({ oldEnd, now, extendDays: 10 })).toEqual(new Date(oldEnd.getTime() + 10 * DAY));
    const expired = new Date(now.getTime() - 3 * DAY);
    expect(planTrialEnd({ oldEnd: expired, now, extendDays: 10 })).toEqual(new Date(now.getTime() + 10 * DAY));
    expect(planTrialEnd({ oldEnd: null, now, extendDays: 10 })).toEqual(new Date(now.getTime() + 10 * DAY));
  });

  test("the end may not lie further ahead than the limit", () => {
    const limit = new Date(now.getTime() + MAX_TRIAL_AHEAD_DAYS * DAY);
    expect(planTrialEnd({ oldEnd, now, endsAt: limit })).toEqual(limit);
    expect(code(() => planTrialEnd({ oldEnd, now, endsAt: new Date(limit.getTime() + 1) }))).toBe("end-too-far");
    expect(code(() => planTrialEnd({ oldEnd: limit, now, extendDays: 30 }))).toBe("end-too-far");
  });

  test("without an end or days it refuses", () => {
    expect(code(() => planTrialEnd({ oldEnd, now }))).toBe("end-invalid");
  });
});

describe("reminders after an extension", () => {
  test("a reminder that is not due yet at the new end is given back; one that is due now stays claimed", () => {
    // 30-day trial: reminder "15" is due 15 days before the end, "23" 7 days before.
    expect(reminderKindsToReset(new Date(now.getTime() + 40 * DAY), now)).toEqual(["15", "23"]);
    expect(reminderKindsToReset(new Date(now.getTime() + 20 * DAY), now)).toEqual(["15", "23"]);
    expect(reminderKindsToReset(new Date(now.getTime() + 10 * DAY), now)).toEqual(["23"]);
    expect(reminderKindsToReset(new Date(now.getTime() + 7 * DAY), now)).toEqual([]);
    expect(reminderKindsToReset(new Date(now.getTime() + 15 * DAY), now)).toEqual(["23"]);
  });
});

describe("exception key", () => {
  test("is the SHA-256 of the lowercase address, so the table holds no address", () => {
    expect(trialExceptionKey("a@b.test")).toBe("d98fb7ed563d6a2727d2de61d3ec97dbdf76dbc88916a54cefb32e3f54d531fa");
    expect(trialExceptionKey("  A@B.test ")).toBe(trialExceptionKey("a@b.test"));
    expect(trialExceptionKey("a@b.test")).toMatch(/^[0-9a-f]{64}$/);
  });
});
