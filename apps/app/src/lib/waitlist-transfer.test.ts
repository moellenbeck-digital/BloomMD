import { describe, expect, spyOn, test } from "bun:test";
import { MailBudgetError } from "./mail-budget";
import {
  checkWaitlistTransferBalance,
  parseWaitlistExportCsv,
  runWaitlistTransfer,
  waitlistTransferLocale,
  type WaitlistTransferDeps,
} from "./waitlist-transfer";
import type { WaitlistLocale, WaitlistTransferState } from "./db";

const CSV = [
  "email,status,zeitpunkt,quelle",
  "ada@example.test,bestätigt,2026-09-01T10:00:00.000Z,landing",
  "bob@example.test,offen,2026-09-02T10:00:00.000Z,landing",
  "cleo@example.test,bestätigt,2026-09-03T10:00:00.000Z,landing-en",
  "dan@example.test,abgemeldet,2026-09-04T10:00:00.000Z,\"quelle, mit Komma\"",
  "",
].join("\n");

describe("reading the waitlist export", () => {
  test("keeps only the confirmed rows and counts all rows", () => {
    expect(parseWaitlistExportCsv(CSV)).toEqual({
      rows: 4,
      confirmed: [
        { email: "ada@example.test", source: "landing" },
        { email: "cleo@example.test", source: "landing-en" },
      ],
      trailer: null,
    });
  });

  test("reads the closing line when the file carries it and compares it with the rows", () => {
    expect(parseWaitlistExportCsv(`${CSV}4 Einträge, davon bestätigt 2\n`).trailer).toEqual({ total: 4, confirmed: 2 });
    expect(() => parseWaitlistExportCsv(`${CSV}5 Einträge, davon bestätigt 2\n`)).toThrow("does not match");
    expect(() => parseWaitlistExportCsv(`${CSV}4 Einträge, davon bestätigt 3\n`)).toThrow("does not match");
  });

  test("handles quotes, CRLF and a byte order mark", () => {
    const text = "\uFEFFemail,status,zeitpunkt,quelle\r\n\"a@example.test\",bestätigt,2026-09-01,\"he said \"\"hi\"\"\"\r\n";
    expect(parseWaitlistExportCsv(text).confirmed).toEqual([{ email: "a@example.test", source: "he said \"hi\"" }]);
  });

  test("refuses a file that is not a waitlist export", () => {
    expect(() => parseWaitlistExportCsv("a,b,c\n1,2,3\n")).toThrow("not a waitlist export");
    expect(() => parseWaitlistExportCsv("email,status,zeitpunkt,quelle\na@example.test,bestätigt\n")).toThrow("cells");
    expect(() => parseWaitlistExportCsv("email,status,zeitpunkt,quelle\na@example.test,aktiv,2026-09-01,x\n")).toThrow("unknown status");
    expect(() => parseWaitlistExportCsv("email,status,zeitpunkt,quelle\n\"a@example.test,bestätigt,2026-09-01,x\n")).toThrow("cut off");
  });

  test("an empty export is valid and has nothing to do", () => {
    expect(parseWaitlistExportCsv("email,status,zeitpunkt,quelle\n")).toEqual({ rows: 0, confirmed: [], trailer: null });
  });
});

describe("mail language", () => {
  test("the English landing page gets the English mail, everything else the German one", () => {
    expect(waitlistTransferLocale("landing-en")).toBe("en");
    expect(waitlistTransferLocale("landing")).toBe("de");
    expect(waitlistTransferLocale(null)).toBe("de");
  });
});

interface FakeAccount {
  id: string;
  email: string;
  hasPassword: boolean;
  emailVerified: boolean;
  transfer: { locale: WaitlistLocale; invitedAt: string | null } | null;
}

/** In-memory stand-in for the database and the mail provider, with the same claim semantics. */
function fakeWorld(options: { budget?: number } = {}) {
  const accounts = new Map<string, FakeAccount>();
  const mails: Array<{ to: string; locale: WaitlistLocale }> = [];
  const failing = new Set<string>();
  const events: string[] = [];
  let budget = options.budget ?? Number.POSITIVE_INFINITY;
  let counter = 0;
  const byId = (id: string) => [...accounts.values()].find((account) => account.id === id)!;

  const deps: WaitlistTransferDeps = {
    find: async (email) => {
      const account = accounts.get(email);
      if (!account) return null;
      return {
        userId: account.id,
        hasPassword: account.hasPassword,
        emailVerified: account.emailVerified,
        transfer: account.transfer ? { invitedAt: account.transfer.invitedAt } : null,
      } satisfies WaitlistTransferState;
    },
    create: async (email, locale) => {
      if (accounts.has(email)) return null;
      counter += 1;
      accounts.set(email, { id: `user-${counter}`, email, hasPassword: false, emailVerified: false, transfer: { locale, invitedAt: null } });
      events.push("create");
      return `user-${counter}`;
    },
    claim: async (userId) => {
      const account = byId(userId);
      if (!account.transfer || account.transfer.invitedAt || account.emailVerified) return null;
      account.transfer.invitedAt = "now";
      events.push("claim");
      return account.transfer.locale;
    },
    release: async (userId) => {
      byId(userId).transfer!.invitedAt = null;
      events.push("release");
    },
    budget: async () => {
      if (budget <= 0) throw new MailBudgetError("hour", 60);
      budget -= 1;
    },
    send: async (user, locale) => {
      events.push("send");
      if (failing.has(user.email)) return { sent: false };
      mails.push({ to: user.email, locale });
      return { sent: true };
    },
  };
  return { accounts, mails, failing, events, deps, setBudget: (value: number) => { budget = value; } };
}

const entries = [
  { email: "ada@example.test", source: "landing" },
  { email: "cleo@example.test", source: "landing-en" },
  { email: "eve@example.test", source: null },
];

describe("transfer to prepared accounts", () => {
  test("a dry run counts and writes nothing", async () => {
    const world = fakeWorld();
    world.accounts.set("eve@example.test", { id: "u-eve", email: "eve@example.test", hasPassword: true, emailVerified: true, transfer: null });

    const result = await runWaitlistTransfer(entries, { rows: 5 }, world.deps);

    expect(result).toEqual({
      dryRun: true, rows: 5, notConfirmed: 2, confirmed: 3, created: 2, retried: 0,
      alreadyRegistered: 1, alreadyInvited: 0, deferred: 0, duplicates: 0, invalid: 0, mailSent: 0, mailFailed: 0,
    });
    expect(world.events).toEqual([]);
    expect(world.mails).toEqual([]);
    expect(world.accounts.size).toBe(1);
  });

  test("creates each account without password and confirmation, mails once in the right language", async () => {
    const world = fakeWorld();

    const result = await runWaitlistTransfer(entries, { apply: true, rows: 5 }, world.deps);

    expect(result).toMatchObject({ dryRun: false, confirmed: 3, created: 3, mailSent: 3, mailFailed: 0, alreadyRegistered: 0 });
    expect(world.mails).toEqual([
      { to: "ada@example.test", locale: "de" },
      { to: "cleo@example.test", locale: "en" },
      { to: "eve@example.test", locale: "de" },
    ]);
    for (const account of world.accounts.values()) expect(account).toMatchObject({ hasPassword: false, emailVerified: false });
    // The mail is claimed before it is sent, never after.
    expect(world.events.slice(0, 3)).toEqual(["create", "claim", "send"]);
    expect(checkWaitlistTransferBalance(result, 3)).toEqual({ balanced: true, matchesExport: true });
  });

  test("an existing account, also one from the registration, is not created, changed or mailed", async () => {
    const world = fakeWorld();
    world.accounts.set("ada@example.test", { id: "u-ada", email: "ada@example.test", hasPassword: true, emailVerified: false, transfer: null });
    world.accounts.set("cleo@example.test", { id: "u-cleo", email: "cleo@example.test", hasPassword: true, emailVerified: true, transfer: null });

    const result = await runWaitlistTransfer(entries, { apply: true, rows: 3 }, world.deps);

    expect(result).toMatchObject({ created: 1, alreadyRegistered: 2, mailSent: 1 });
    expect(world.mails.map((mail) => mail.to)).toEqual(["eve@example.test"]);
    expect(world.accounts.get("ada@example.test")).toMatchObject({ hasPassword: true, emailVerified: false, transfer: null });
    expect(checkWaitlistTransferBalance(result, 3).balanced).toBe(true);
  });

  test("a second run writes to nobody again", async () => {
    const world = fakeWorld();
    await runWaitlistTransfer(entries, { apply: true, rows: 3 }, world.deps);

    const again = await runWaitlistTransfer(entries, { apply: true, rows: 3 }, world.deps);

    expect(again).toMatchObject({ created: 0, retried: 0, alreadyInvited: 3, mailSent: 0, mailFailed: 0 });
    expect(world.mails).toHaveLength(3);
    expect(checkWaitlistTransferBalance(again, 3).balanced).toBe(true);
  });

  test("a crash halfway does not mail anybody twice and the rest follows in the next run", async () => {
    const world = fakeWorld();
    const crashing: WaitlistTransferDeps = {
      ...world.deps,
      send: async (user, locale) => {
        if (user.email === "cleo@example.test") throw new Error("process killed");
        return world.deps.send(user, locale);
      },
    };
    const log = spyOn(console, "error").mockImplementation(() => undefined);
    try {
      // The thrown error stands for anything unexpected between claim and send.
      const first = await runWaitlistTransfer(entries, { apply: true, rows: 3 }, crashing);
      expect(first).toMatchObject({ created: 3, mailSent: 2, mailFailed: 1 });
    } finally {
      log.mockRestore();
    }
    const second = await runWaitlistTransfer(entries, { apply: true, rows: 3 }, world.deps);
    expect(second).toMatchObject({ created: 0, retried: 1, alreadyInvited: 2, mailSent: 1 });
    expect(world.mails.map((mail) => mail.to).sort()).toEqual(["ada@example.test", "cleo@example.test", "eve@example.test"]);
  });

  test("a failed mail gives the claim back and only this address is repeated", async () => {
    const world = fakeWorld();
    world.failing.add("cleo@example.test");

    const first = await runWaitlistTransfer(entries, { apply: true, rows: 3 }, world.deps);
    expect(first).toMatchObject({ created: 3, mailSent: 2, mailFailed: 1 });
    expect(world.events).toContain("release");
    expect(world.accounts.get("cleo@example.test")!.transfer!.invitedAt).toBeNull();
    expect(checkWaitlistTransferBalance(first, 3).balanced).toBe(true);

    world.failing.clear();
    const second = await runWaitlistTransfer(entries, { apply: true, rows: 3 }, world.deps);
    expect(second).toMatchObject({ created: 0, retried: 1, alreadyInvited: 2, mailSent: 1, mailFailed: 0 });
    expect(world.mails.filter((mail) => mail.to === "cleo@example.test")).toEqual([{ to: "cleo@example.test", locale: "en" }]);
  });

  test("an account the person took over in the meantime is not mailed", async () => {
    const world = fakeWorld();
    world.failing.add("ada@example.test");
    await runWaitlistTransfer(entries, { apply: true, rows: 3 }, world.deps);
    // Ada signs up on her own before the next run: password set, address still unconfirmed.
    world.accounts.get("ada@example.test")!.hasPassword = true;

    const second = await runWaitlistTransfer(entries, { apply: true, rows: 3 }, world.deps);

    expect(second).toMatchObject({ retried: 0, alreadyRegistered: 1, alreadyInvited: 2, mailSent: 0 });
    expect(world.mails.map((mail) => mail.to)).not.toContain("ada@example.test");
  });

  test("the global mail budget stops the run; the rest is deferred and a later run finishes it", async () => {
    const world = fakeWorld({ budget: 2 });

    const first = await runWaitlistTransfer(entries, { apply: true, rows: 3 }, world.deps);
    expect(first).toMatchObject({ created: 2, mailSent: 2, deferred: 1 });
    expect(world.accounts.has("eve@example.test")).toBe(false);
    expect(checkWaitlistTransferBalance(first, 3).balanced).toBe(true);

    world.setBudget(10);
    const second = await runWaitlistTransfer(entries, { apply: true, rows: 3 }, world.deps);
    expect(second).toMatchObject({ created: 1, alreadyInvited: 2, mailSent: 1, deferred: 0 });
    expect(world.mails).toHaveLength(3);
  });

  test("--limit caps the mails of one run", async () => {
    const world = fakeWorld();

    const result = await runWaitlistTransfer(entries, { apply: true, rows: 3, limit: 1 }, world.deps);

    expect(result).toMatchObject({ created: 1, mailSent: 1, deferred: 2 });
  });

  test("counts duplicates and invalid addresses so the numbers add up", async () => {
    const world = fakeWorld();
    const messy = [...entries, { email: "ADA@example.test", source: "landing" }, { email: "kein-mail", source: null }];

    const result = await runWaitlistTransfer(messy, { apply: true, rows: 7 }, world.deps);

    expect(result).toMatchObject({ confirmed: 5, created: 3, duplicates: 1, invalid: 1, notConfirmed: 2 });
    expect(checkWaitlistTransferBalance(result, 5)).toEqual({ balanced: true, matchesExport: true });
    expect(checkWaitlistTransferBalance(result, 4).matchesExport).toBe(false);
    expect(checkWaitlistTransferBalance(result, null).matchesExport).toBeNull();
  });

  test("the result holds numbers only, no address", async () => {
    const world = fakeWorld();
    const result = await runWaitlistTransfer(entries, { apply: true, rows: 3 }, world.deps);
    for (const value of Object.values(result)) expect(["number", "boolean"]).toContain(typeof value);
    expect(JSON.stringify(result)).not.toContain("@");
  });

  test("an error other than the mail budget is not swallowed", async () => {
    const world = fakeWorld();
    const broken: WaitlistTransferDeps = { ...world.deps, find: async () => { throw new Error("database down"); } };
    await expect(runWaitlistTransfer(entries, { apply: true, rows: 3 }, broken)).rejects.toThrow("database down");
  });
});
