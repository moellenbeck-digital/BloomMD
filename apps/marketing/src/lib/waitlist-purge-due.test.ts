import { describe, expect, test } from "bun:test";
import { WaitlistPurgeRefusedError, evaluateWaitlistPurge, type WaitlistPurgeStatus } from "./waitlist-db";
import { runWaitlistPurgeDue, type WaitlistPurgeDueDeps } from "./waitlist-purge-due";

const day = 24 * 60 * 60 * 1000;
const now = new Date("2026-12-01T12:00:00.000Z");
const daysAgo = (days: number) => new Date(now.getTime() - days * day).toISOString();

/** Real guard (`evaluateWaitlistPurge`), fake table: counts how often a delete was attempted. */
function fakeDeps(status: WaitlistPurgeStatus, options: { purge?: () => Promise<number> } = {}) {
  const purgeCalls: Date[] = [];
  const deps: WaitlistPurgeDueDeps = {
    status: async () => status,
    evaluate: evaluateWaitlistPurge,
    purge: async (at) => {
      purgeCalls.push(at);
      return options.purge ? options.purge() : status.total;
    },
  };
  return { deps, purgeCalls };
}

describe("waitlist purge-due", () => {
  test("retention running: deletes nothing even with apply, names the end of the period", async () => {
    const { deps, purgeCalls } = fakeDeps({ total: 5, invitable: 5, notInvited: 0, lastInvitedAt: daysAgo(10) });
    const result = await runWaitlistPurgeDue({ apply: true, now }, deps);

    expect(purgeCalls).toHaveLength(0);
    expect(result).toEqual({
      mode: "apply",
      total: 5,
      notInvited: 0,
      allowed: false,
      reason: "retention-running",
      allowedFrom: new Date(new Date(daysAgo(10)).getTime() + 90 * day).toISOString(),
      deleted: 0,
    });
  });

  test("an invitation is still open: deletes nothing, reason invitation-pending", async () => {
    const { deps, purgeCalls } = fakeDeps({ total: 5, invitable: 4, notInvited: 2, lastInvitedAt: daysAgo(200) });
    const result = await runWaitlistPurgeDue({ apply: true, now }, deps);

    expect(purgeCalls).toHaveLength(0);
    expect(result).toMatchObject({ allowed: false, reason: "invitation-pending", allowedFrom: null, notInvited: 2, deleted: 0 });
  });

  test("no invitation sent yet: deletes nothing, reason no-invitation-sent", async () => {
    const { deps, purgeCalls } = fakeDeps({ total: 5, invitable: 0, notInvited: 0, lastInvitedAt: null });
    const result = await runWaitlistPurgeDue({ apply: true, now }, deps);

    expect(purgeCalls).toHaveLength(0);
    expect(result).toMatchObject({ allowed: false, reason: "no-invitation-sent", allowedFrom: null, deleted: 0 });
  });

  test("period over, without apply: only reports, deletes nothing", async () => {
    const { deps, purgeCalls } = fakeDeps({ total: 5, invitable: 5, notInvited: 0, lastInvitedAt: daysAgo(91) });
    const result = await runWaitlistPurgeDue({ now }, deps);

    expect(purgeCalls).toHaveLength(0);
    expect(result).toEqual({
      mode: "dry-run",
      total: 5,
      notInvited: 0,
      allowed: true,
      reason: "retention-over",
      allowedFrom: null,
      deleted: 0,
    });
  });

  test("period over, with apply: deletes everything and reports the count", async () => {
    const { deps, purgeCalls } = fakeDeps({ total: 5, invitable: 5, notInvited: 0, lastInvitedAt: daysAgo(91) });
    const result = await runWaitlistPurgeDue({ apply: true, now }, deps);

    expect(purgeCalls).toEqual([now]);
    expect(result).toMatchObject({ mode: "apply", allowed: true, reason: "retention-over", deleted: 5 });
  });

  test("empty list: allowed, nothing to delete, no delete call", async () => {
    const { deps, purgeCalls } = fakeDeps({ total: 0, invitable: 0, notInvited: 0, lastInvitedAt: null });
    const result = await runWaitlistPurgeDue({ apply: true, now }, deps);

    expect(purgeCalls).toHaveLength(0);
    expect(result).toEqual({
      mode: "apply",
      total: 0,
      notInvited: 0,
      allowed: true,
      reason: "empty-list",
      allowedFrom: null,
      deleted: 0,
    });
  });

  test("the table changed between check and delete: the refusal is a result, not an error", async () => {
    const { deps } = fakeDeps(
      { total: 5, invitable: 5, notInvited: 0, lastInvitedAt: daysAgo(91) },
      {
        purge: async () => {
          throw new WaitlistPurgeRefusedError({ allowed: false, reason: "invitation-pending", allowedFrom: null });
        },
      },
    );
    const result = await runWaitlistPurgeDue({ apply: true, now }, deps);

    expect(result).toMatchObject({ allowed: false, reason: "invitation-pending", deleted: 0 });
  });

  test("real failures (database not reachable) are not swallowed", async () => {
    const deps: WaitlistPurgeDueDeps = {
      status: async () => {
        throw new Error("connect ECONNREFUSED");
      },
      evaluate: evaluateWaitlistPurge,
      purge: async () => 0,
    };
    await expect(runWaitlistPurgeDue({ apply: true, now }, deps)).rejects.toThrow("ECONNREFUSED");

    const failingDelete = fakeDeps(
      { total: 5, invitable: 5, notInvited: 0, lastInvitedAt: daysAgo(91) },
      {
        purge: async () => {
          throw new Error("connection terminated");
        },
      },
    );
    await expect(runWaitlistPurgeDue({ apply: true, now }, failingDelete.deps)).rejects.toThrow("connection terminated");
  });

  test("the result carries only counters and dates — no address", async () => {
    const cases: WaitlistPurgeStatus[] = [
      { total: 5, invitable: 5, notInvited: 0, lastInvitedAt: daysAgo(10) },
      { total: 5, invitable: 5, notInvited: 0, lastInvitedAt: daysAgo(91) },
      { total: 0, invitable: 0, notInvited: 0, lastInvitedAt: null },
    ];
    for (const status of cases) {
      const result = await runWaitlistPurgeDue({ apply: true, now }, fakeDeps(status).deps);
      expect(Object.keys(result).sort()).toEqual(["allowed", "allowedFrom", "deleted", "mode", "notInvited", "reason", "total"]);
      expect(JSON.stringify(result)).not.toContain("@");
    }
  });
});

describe("waitlist CLI purge-due", () => {
  const script = new URL("../../scripts/waitlist.ts", import.meta.url).pathname;

  async function run(args: string[]) {
    const env = { ...process.env };
    delete env.BLOOMMD_WAITLIST_DATABASE_URL;
    const child = Bun.spawn(["bun", script, ...args], { env, stdout: "pipe", stderr: "pipe" });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    return { stdout, stderr, exitCode };
  }

  test("without the database variable it fails with a clear message", async () => {
    const result = await run(["purge-due", "--apply"]);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("BLOOMMD_WAITLIST_DATABASE_URL fehlt");
    expect(result.stdout).toBe("");
  });
});
