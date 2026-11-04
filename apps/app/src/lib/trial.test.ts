import { describe, expect, test } from "bun:test";
import { dueTrialReminder, isTrialOver, LEGACY_TRIAL_ENDS_AT, reminderDueAt, trialDaysLeft, trialEndsAt } from "./trial";

const DAY = 24 * 60 * 60 * 1000;
const verified = new Date("2026-11-20T10:30:00.000Z");
const ends = trialEndsAt(verified);
const at = (days: number, offsetMs = 0) => new Date(verified.getTime() + days * DAY + offsetMs);

describe("trial period (#274)", () => {
  test("ends 30 days after the confirmation", () => {
    expect(ends.toISOString()).toBe("2026-12-20T10:30:00.000Z");
    expect(() => trialEndsAt("nonsense")).toThrow();
  });

  test("reminders are due 15 and 23 days after the start", () => {
    expect(reminderDueAt(ends, "15").getTime()).toBe(at(15).getTime());
    expect(reminderDueAt(ends, "23").getTime()).toBe(at(23).getTime());
  });

  test("existing accounts: end 15 Dec, reminders 30 Nov and 8 Dec", () => {
    expect(reminderDueAt(LEGACY_TRIAL_ENDS_AT, "15").toISOString()).toBe("2026-11-30T00:00:00.000Z");
    expect(reminderDueAt(LEGACY_TRIAL_ENDS_AT, "23").toISOString()).toBe("2026-12-08T00:00:00.000Z");
    expect(trialEndsAt("2026-11-15T00:00:00.000Z").toISOString()).toBe(LEGACY_TRIAL_ENDS_AT);
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
});
