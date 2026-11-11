import { describe, expect, test } from "bun:test";
import { dueTrialReminder, formatTrialEnd, isTrialOver, LEGACY_TRIAL_ENDS_AT, reminderDueAt, trialDaysLeft, trialEndsAt } from "./trial";

const DAY = 24 * 60 * 60 * 1000;
const verified = new Date("2026-11-20T10:30:00.000Z");
const ends = trialEndsAt(verified);
const at = (days: number, offsetMs = 0) => new Date(verified.getTime() + days * DAY + offsetMs);
/** Existing accounts count from 15 Nov 2026 (#364). */
const legacyStart = Date.UTC(2026, 10, 15);
const legacyAt = (days: number, offsetMs = 0) => new Date(legacyStart + days * DAY + offsetMs);

describe("trial period (#274)", () => {
  test("ends 30 days after the confirmation", () => {
    expect(ends.toISOString()).toBe("2026-12-20T10:30:00.000Z");
    expect(() => trialEndsAt("nonsense")).toThrow();
  });

  test("reminders are due 15 and 23 days after the start", () => {
    expect(reminderDueAt(ends, "15").getTime()).toBe(at(15).getTime());
    expect(reminderDueAt(ends, "23").getTime()).toBe(at(23).getTime());
  });

  test("existing accounts: 60 days from 15 Nov, end 14 Jan 2027, reminders 30 Dec and 7 Jan", () => {
    expect(LEGACY_TRIAL_ENDS_AT).toBe("2027-01-14T00:00:00.000Z");
    expect(new Date(LEGACY_TRIAL_ENDS_AT).getTime()).toBe(legacyAt(60).getTime());
    expect(reminderDueAt(LEGACY_TRIAL_ENDS_AT, "15").toISOString()).toBe("2026-12-30T00:00:00.000Z");
    expect(reminderDueAt(LEGACY_TRIAL_ENDS_AT, "23").toISOString()).toBe("2027-01-07T00:00:00.000Z");
    expect(reminderDueAt(LEGACY_TRIAL_ENDS_AT, "15").getTime()).toBe(legacyAt(45).getTime());
    expect(reminderDueAt(LEGACY_TRIAL_ENDS_AT, "23").getTime()).toBe(legacyAt(53).getTime());
  });

  test("new accounts stay at 30 days, whatever the end of the existing accounts is", () => {
    expect(trialEndsAt("2026-11-15T00:00:00.000Z").toISOString()).toBe("2026-12-15T00:00:00.000Z");
    expect(trialEndsAt("2026-11-15T00:00:00.000Z").getTime()).not.toBe(new Date(LEGACY_TRIAL_ENDS_AT).getTime());
  });

  test("existing accounts, boundary day 44/45: nothing before 30 Dec, the 15-day reminder from the exact instant", () => {
    expect(dueTrialReminder(LEGACY_TRIAL_ENDS_AT, legacyAt(44, DAY - 1))).toBeNull();
    expect(dueTrialReminder(LEGACY_TRIAL_ENDS_AT, legacyAt(45, -1))).toBeNull();
    expect(dueTrialReminder(LEGACY_TRIAL_ENDS_AT, legacyAt(45))).toBe("15");
    expect(dueTrialReminder(LEGACY_TRIAL_ENDS_AT, new Date("2026-12-30T00:00:00.000Z"))).toBe("15");
  });

  test("existing accounts, boundary day 52/53: the 23-day reminder from 7 Jan", () => {
    expect(dueTrialReminder(LEGACY_TRIAL_ENDS_AT, legacyAt(53, -1), [])).toBe("15");
    expect(dueTrialReminder(LEGACY_TRIAL_ENDS_AT, legacyAt(53, -1), ["15"])).toBeNull();
    expect(dueTrialReminder(LEGACY_TRIAL_ENDS_AT, legacyAt(53))).toBe("23");
    expect(dueTrialReminder(LEGACY_TRIAL_ENDS_AT, legacyAt(53), ["15"])).toBe("23");
    expect(dueTrialReminder(LEGACY_TRIAL_ENDS_AT, new Date("2027-01-07T00:00:00.000Z"), ["15"])).toBe("23");
  });

  test("existing accounts, boundary day 59/60: still due just before the end, never at or after 14 Jan 2027", () => {
    expect(dueTrialReminder(LEGACY_TRIAL_ENDS_AT, legacyAt(60, -1))).toBe("23");
    expect(dueTrialReminder(LEGACY_TRIAL_ENDS_AT, legacyAt(60))).toBeNull();
    expect(dueTrialReminder(LEGACY_TRIAL_ENDS_AT, legacyAt(61))).toBeNull();
    expect(isTrialOver(LEGACY_TRIAL_ENDS_AT, legacyAt(60, -1))).toBe(false);
    expect(isTrialOver(LEGACY_TRIAL_ENDS_AT, legacyAt(60))).toBe(true);
    // The old end (15 Dec 2026) is no longer the end.
    expect(isTrialOver(LEGACY_TRIAL_ENDS_AT, new Date("2026-12-15T00:00:00.000Z"))).toBe(false);
    expect(trialDaysLeft(LEGACY_TRIAL_ENDS_AT, new Date("2026-12-30T00:00:00.000Z"))).toBe(15);
    expect(trialDaysLeft(LEGACY_TRIAL_ENDS_AT, new Date("2027-01-07T00:00:00.000Z"))).toBe(7);
  });

  test("boundary day 14/15: nothing before, the 15-day reminder from the exact instant", () => {
    expect(dueTrialReminder(ends, at(14, DAY - 1))).toBeNull();
    expect(dueTrialReminder(ends, at(15, -1))).toBeNull();
    expect(dueTrialReminder(ends, at(15))).toBe("15");
  });

  test("boundary day 22/23: the 23-day reminder from the exact instant", () => {
    expect(dueTrialReminder(ends, at(23, -1), [])).toBe("15");
    expect(dueTrialReminder(ends, at(23, -1), ["15"])).toBeNull();
    expect(dueTrialReminder(ends, at(23))).toBe("23");
    expect(dueTrialReminder(ends, at(23), ["15"])).toBe("23");
  });

  test("boundary day 29/30: still due just before the end, never at or after it", () => {
    expect(dueTrialReminder(ends, at(30, -1))).toBe("23");
    expect(dueTrialReminder(ends, at(30))).toBeNull();
    expect(dueTrialReminder(ends, at(31))).toBeNull();
    expect(isTrialOver(ends, at(30, -1))).toBe(false);
    expect(isTrialOver(ends, at(30))).toBe(true);
  });

  test("a late run sends only the latest due reminder and never twice", () => {
    expect(dueTrialReminder(ends, at(25))).toBe("23");
    expect(dueTrialReminder(ends, at(25), ["23"])).toBeNull();
    // The 15-day reminder is never caught up once the 23-day one is due, sent or not.
    expect(dueTrialReminder(ends, at(25), ["15"])).toBe("23");
    expect(dueTrialReminder(ends, at(18), ["15"])).toBeNull();
  });

  test("days left are rounded up and 0 when over", () => {
    expect(trialDaysLeft(ends, at(15))).toBe(15);
    expect(trialDaysLeft(ends, at(23))).toBe(7);
    expect(trialDaysLeft(ends, at(23, 1))).toBe(7);
    expect(trialDaysLeft(ends, at(29, 1))).toBe(1);
    expect(trialDaysLeft(ends, at(30))).toBe(0);
    expect(trialDaysLeft(ends, at(40))).toBe(0);
  });

  test("the end date is shown in UTC as 14.01.2027 / 14 Jan 2027", () => {
    expect(formatTrialEnd(LEGACY_TRIAL_ENDS_AT, "de")).toBe("14.01.2027");
    expect(formatTrialEnd(LEGACY_TRIAL_ENDS_AT, "en")).toBe("14 Jan 2027");
    expect(formatTrialEnd("2026-12-20T23:59:59.000Z", "de")).toBe("20.12.2026");
    expect(formatTrialEnd("2026-12-21T00:00:00.000Z", "de")).toBe("21.12.2026");
  });
});
