import { describe, expect, spyOn, test } from "bun:test";
import type { TrialReminderCandidate } from "./db";
import { MailBudgetError } from "./mail-budget";
import { runTrialReminders, type TrialReminderDeps } from "./trial-reminders";
import { LEGACY_TRIAL_ENDS_AT, trialEndsAt, type TrialReminderKind } from "./trial";

const DAY = 24 * 60 * 60 * 1000;
const verified = new Date("2026-11-20T10:30:00.000Z");
const at = (days: number, offsetMs = 0) => new Date(verified.getTime() + days * DAY + offsetMs);

function candidate(name: string, overrides: Partial<TrialReminderCandidate> = {}): TrialReminderCandidate {
  return { userId: name, email: `${name}@example.test`, locale: "de", trialEndsAt: trialEndsAt(verified).toISOString(), existingAccount: false, claimed: [], ...overrides };
}

/** In-memory stand-ins that keep the rules the SQL enforces: one claim per (user, kind), release only before sending. */
function fakes(candidates: TrialReminderCandidate[], options: { sendFails?: string[]; budgetAfter?: number } = {}) {
  const claims = new Map<string, { sent: boolean }>();
  for (const entry of candidates) for (const kind of entry.claimed) claims.set(`${entry.userId}:${kind}`, { sent: true });
  const mails: Array<{ to: string; locale: string; daysLeft: number }> = [];
  let budgetCalls = 0;
  const deps: TrialReminderDeps = {
    list: async () => candidates,
    budget: async () => {
      budgetCalls += 1;
      if (options.budgetAfter != null && budgetCalls > options.budgetAfter) throw new MailBudgetError("day", 60);
    },
    claim: async (userId, kind) => {
      if (claims.has(`${userId}:${kind}`)) return false;
      claims.set(`${userId}:${kind}`, { sent: false });
      return true;
    },
    markSent: async (userId, kind) => {
      claims.get(`${userId}:${kind}`)!.sent = true;
    },
    release: async (userId, kind) => {
      if (!claims.get(`${userId}:${kind}`)?.sent) claims.delete(`${userId}:${kind}`);
    },
    send: async (entry, daysLeft) => {
      if (options.sendFails?.includes(entry.userId)) return { sent: false };
      mails.push({ to: entry.email, locale: entry.locale, daysLeft });
      return { sent: true };
    },
  };
  return { deps, claims, mails };
}

describe("trial reminder run (#274)", () => {
  test("a dry run counts what is due and writes and sends nothing", async () => {
    const { deps, claims, mails } = fakes([candidate("a"), candidate("b")]);
    const result = await runTrialReminders({ now: at(15) }, deps);
    expect(result).toMatchObject({ dryRun: true, due: 2, dueByKind: { "15": 2, "23": 0 }, mailSent: 0, deferred: 0 });
    expect(claims.size).toBe(0);
    expect(mails).toHaveLength(0);
  });

  test("sends the reminder in the language of the account with the days left", async () => {
    const { deps, mails } = fakes([candidate("de"), candidate("en", { locale: "en" })]);
    const result = await runTrialReminders({ apply: true, now: at(15) }, deps);
    expect(result).toMatchObject({ dryRun: false, due: 2, mailSent: 2, mailFailed: 0 });
    expect(mails).toEqual([
      { to: "de@example.test", locale: "de", daysLeft: 15 },
      { to: "en@example.test", locale: "en", daysLeft: 15 },
    ]);
  });

  test("nothing goes out before day 15 or at the end of the trial", async () => {
    for (const now of [at(15, -1), at(30), at(45)]) {
      const { deps, mails } = fakes([candidate("a")]);
      const result = await runTrialReminders({ apply: true, now }, deps);
      expect(result.due).toBe(0);
      expect(mails).toHaveLength(0);
    }
  });

  test("a second run sends nothing again; each reminder goes out at most once", async () => {
    const entry = candidate("a");
    const { deps, mails, claims } = fakes([entry]);
    await runTrialReminders({ apply: true, now: at(16) }, deps);
    entry.claimed = [...claims.keys()].map((key) => key.split(":")[1] as TrialReminderKind);
    const again = await runTrialReminders({ apply: true, now: at(17) }, deps);
    expect(again.due).toBe(0);
    expect(mails).toHaveLength(1);
    // Day 23: the second reminder, once.
    await runTrialReminders({ apply: true, now: at(23) }, deps);
    entry.claimed = [...claims.keys()].map((key) => key.split(":")[1] as TrialReminderKind);
    await runTrialReminders({ apply: true, now: at(24) }, deps);
    expect(mails.map((mail) => mail.daysLeft)).toEqual([14, 7]);
  });

  test("two runs at once claim a reminder only once", async () => {
    const { deps, mails } = fakes([candidate("a")]);
    const [first, second] = await Promise.all([runTrialReminders({ apply: true, now: at(15) }, deps), runTrialReminders({ apply: true, now: at(15) }, deps)]);
    expect(first.mailSent + second.mailSent).toBe(1);
    expect(first.notClaimed + second.notClaimed).toBe(1);
    expect(mails).toHaveLength(1);
  });

  test("a late run sends only the latest due reminder", async () => {
    const { deps, mails } = fakes([candidate("a")]);
    const result = await runTrialReminders({ apply: true, now: at(26) }, deps);
    expect(result).toMatchObject({ due: 1, dueByKind: { "15": 0, "23": 1 }, mailSent: 1 });
    expect(mails).toEqual([{ to: "a@example.test", locale: "de", daysLeft: 4 }]);
  });

  test("a failed send gives the claim back, so the next run repeats exactly that reminder", async () => {
    const entry = candidate("a");
    const failing = fakes([entry], { sendFails: ["a"] });
    const error = spyOn(console, "error").mockImplementation(() => {});
    const first = await runTrialReminders({ apply: true, now: at(15) }, failing.deps);
    error.mockRestore();
    expect(first).toMatchObject({ mailSent: 0, mailFailed: 1 });
    expect(failing.claims.size).toBe(0);

    const retry = fakes([entry]);
    const second = await runTrialReminders({ apply: true, now: at(15, DAY) }, retry.deps);
    expect(second).toMatchObject({ mailSent: 1, mailFailed: 0 });
  });

  test("a send that throws counts as failed and gives the claim back", async () => {
    const { deps, claims } = fakes([candidate("a")]);
    deps.send = async () => {
      throw new Error("network down with a@example.test");
    };
    const error = spyOn(console, "error").mockImplementation(() => {});
    const result = await runTrialReminders({ apply: true, now: at(15) }, deps);
    expect(result).toMatchObject({ mailSent: 0, mailFailed: 1 });
    expect(claims.size).toBe(0);
    // No address in the log.
    expect(JSON.stringify(error.mock.calls)).not.toContain("example.test");
    error.mockRestore();
  });

  test("existing accounts are held back until their own switch is on", async () => {
    const entry = candidate("old", { existingAccount: true, trialEndsAt: LEGACY_TRIAL_ENDS_AT });
    const now = new Date("2026-11-30T06:00:00.000Z");

    const held = fakes([entry, candidate("new", { trialEndsAt: trialEndsAt(new Date("2026-11-14T12:00:00.000Z")).toISOString() })]);
    const heldResult = await runTrialReminders({ apply: true, now }, held.deps);
    expect(heldResult).toMatchObject({ includeExisting: false, due: 2, heldBackExisting: 1, mailSent: 1 });
    expect(held.mails.map((mail) => mail.to)).toEqual(["new@example.test"]);

    const open = fakes([entry]);
    const openResult = await runTrialReminders({ apply: true, includeExisting: true, now }, open.deps);
    expect(openResult).toMatchObject({ includeExisting: true, heldBackExisting: 0, mailSent: 1 });
    expect(open.mails).toEqual([{ to: "old@example.test", locale: "de", daysLeft: 15 }]);
  });

  test("existing accounts: the second reminder on 8 Dec, nothing from 15 Dec on", async () => {
    const entry = candidate("old", { existingAccount: true, trialEndsAt: LEGACY_TRIAL_ENDS_AT });
    const eighth = fakes([entry]);
    expect(await runTrialReminders({ apply: true, includeExisting: true, now: new Date("2026-12-08T00:00:00.000Z") }, eighth.deps)).toMatchObject({ dueByKind: { "15": 0, "23": 1 }, mailSent: 1 });
    expect(eighth.mails[0]?.daysLeft).toBe(7);
    const after = fakes([entry]);
    expect((await runTrialReminders({ apply: true, includeExisting: true, now: new Date("2026-12-15T00:00:00.000Z") }, after.deps)).due).toBe(0);
  });

  test("the mail budget stops the run; the rest is deferred and untouched", async () => {
    const { deps, mails, claims } = fakes([candidate("a"), candidate("b"), candidate("c")], { budgetAfter: 1 });
    const result = await runTrialReminders({ apply: true, now: at(15) }, deps);
    expect(result).toMatchObject({ due: 3, mailSent: 1, deferred: 2 });
    expect(mails).toHaveLength(1);
    expect(claims.size).toBe(1);
  });

  test("--limit caps the mails of one run", async () => {
    const { deps, mails } = fakes([candidate("a"), candidate("b"), candidate("c")]);
    const result = await runTrialReminders({ apply: true, limit: 2, now: at(15) }, deps);
    expect(result).toMatchObject({ mailSent: 2, deferred: 1 });
    expect(mails).toHaveLength(2);
  });

  test("a reminder that cannot be claimed (account gone or trial over meanwhile) is not sent", async () => {
    const { deps, mails } = fakes([candidate("a")]);
    deps.claim = async () => false;
    const result = await runTrialReminders({ apply: true, now: at(15) }, deps);
    expect(result).toMatchObject({ notClaimed: 1, mailSent: 0 });
    expect(mails).toHaveLength(0);
  });
});
