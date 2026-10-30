/**
 * `scripts/team-lauf`: the pod-wide lock for heavy runs (#180). Runs the real script against a lock
 * file in a throwaway directory and checks serialisation, exit code pass-through, release after
 * `kill -9`, signal forwarding, nesting, the wait timeout and the call without arguments.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const repository = resolve(import.meta.dir, "..", "..");
const script = join(repository, "scripts", "team-lauf");

let base = "";
let lock = "";
let info = "";
let counter = 0;

type Run = { proc: ReturnType<typeof Bun.spawn>; done: Promise<{ code: number; stderr: string; stdout: string }> };

function start(args: string[], env: Record<string, string> = {}): Run {
  const proc = Bun.spawn([script, ...args], {
    env: { ...process.env, TEAM_LAUF_LOCK: lock, TEAM_LAUF_HELD: "", ...env },
    stdout: "pipe",
    stderr: "pipe",
  });
  const done = (async () => {
    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout as ReadableStream).text(),
      new Response(proc.stderr as ReadableStream).text(),
    ]);
    return { code: await proc.exited, stderr, stdout };
  })();
  return { proc, done };
}

async function until(condition: () => boolean, what: string): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await Bun.sleep(20);
  }
}

/** Waits until the holder wrote its note, i.e. it really holds the lock. */
const holds = () => until(() => existsSync(info), "the lock holder");

beforeAll(() => {
  base = mkdtempSync(join(tmpdir(), "bloommd-team-lauf-"));
});

beforeEach(() => {
  counter += 1;
  lock = join(base, `lock-${counter}`);
  info = `${lock}.info`;
});

afterAll(() => rmSync(base, { recursive: true, force: true }));

describe("team-lauf script", () => {
  test("two parallel runs go one after the other and the second reports its wait", async () => {
    const begin = Date.now();
    const first = start(["sleep", "2"]);
    await holds();
    const second = start(["sh", "-c", "echo zweiter"]);
    const [a, b] = await Promise.all([first.done, second.done]);

    expect(a.code).toBe(0);
    expect(a.stderr).toContain("Sperre erhalten nach 0 s Wartezeit");
    expect(a.stderr).toMatch(/fertig nach \d+ s, Exit 0/);
    expect(b.code).toBe(0);
    expect(b.stdout).toBe("zweiter\n");
    expect(b.stderr).toMatch(/team-lauf: wartet auf Sperre \(belegt von: sleep 2, seit \d{4}-\d\d-\d\d \d\d:\d\d:\d\d\)/);
    expect(b.stderr).toMatch(/Sperre erhalten nach [1-9]\d* s Wartezeit/);
    expect(b.stderr.match(/wartet auf Sperre/g)).toHaveLength(1);
    expect(Date.now() - begin).toBeGreaterThanOrEqual(2000);
  });

  test("passes the exit code of the command through", async () => {
    const run = await start(["sh", "-c", "exit 7"]).done;
    expect(run.code).toBe(7);
    expect(run.stderr).toContain("fertig nach 0 s, Exit 7");
    expect((await start(["sh", "-c", "exit 0"]).done).code).toBe(0);
    expect((await start(["no-such-command-for-team-lauf"]).done).code).toBe(127);
  });

  test("notes the holder and removes the note when the run ends", async () => {
    const run = start(["sleep", "5"]);
    await holds();
    const note = readFileSync(info, "utf8");
    expect(note).toContain(`pid=${run.proc.pid}\n`);
    expect(note).toContain("befehl=sleep 5\n");
    expect(note).toMatch(/seit=\d{4}-\d\d-\d\d \d\d:\d\d:\d\d\n/);
    run.proc.kill("SIGTERM");
    await run.done;
    expect(existsSync(info)).toBe(false);
  });

  test("the lock is free right after kill -9 of the holder", async () => {
    const pidFile = join(base, `command-pid-${counter}`);
    const holder = start(["sh", "-c", `echo $$ > ${pidFile}; exec sleep 20`]);
    await until(() => existsSync(pidFile) && readFileSync(pidFile, "utf8").trim() !== "", "the command");
    const orphan = Number(readFileSync(pidFile, "utf8").trim());
    try {
      holder.proc.kill("SIGKILL");
      // Not `holder.done`: the orphaned command still holds the output pipes.
      await holder.proc.exited;

      const begin = Date.now();
      const next = await start(["true"]).done;
      expect(next.code).toBe(0);
      expect(next.stderr).not.toContain("wartet auf Sperre");
      expect(Date.now() - begin).toBeLessThan(3000);
    } finally {
      process.kill(orphan, "SIGKILL");
    }
  });

  test("forwards SIGTERM and SIGINT to the command and frees the lock", async () => {
    for (const [signal, code] of [
      ["SIGTERM", 143],
      ["SIGINT", 130],
    ] as const) {
      const run = start(["sleep", "30"]);
      await holds();
      run.proc.kill(signal);
      const result = await run.done;
      expect(result.code).toBe(code);
      expect(result.stderr).toContain(`Exit ${code}`);
      expect((await start(["true"]).done).stderr).not.toContain("wartet auf Sperre");
    }
  });

  test("a nested call inside a command does not hang", async () => {
    const run = await start(["sh", "-c", `echo held=$TEAM_LAUF_HELD; ${script} sh -c 'echo innen'`], {
      TEAM_LAUF_TIMEOUT: "5",
    }).done;
    expect(run.code).toBe(0);
    expect(run.stdout).toBe("held=1\ninnen\n");
    expect(run.stderr).not.toContain("wartet auf Sperre");
  });

  test("gives up after TEAM_LAUF_TIMEOUT with exit 75", async () => {
    const holder = start(["sleep", "5"]);
    await holds();
    try {
      const begin = Date.now();
      const waiter = await start(["true"], { TEAM_LAUF_TIMEOUT: "1" }).done;
      expect(waiter.code).toBe(75);
      expect(waiter.stderr).toContain("wartet auf Sperre (belegt von: sleep 5");
      expect(waiter.stderr).toContain("Sperre nach 1 s nicht frei geworden");
      expect(Date.now() - begin).toBeLessThan(4000);
    } finally {
      holder.proc.kill("SIGTERM");
      await holder.done;
    }
  });

  test("rejects a TEAM_LAUF_TIMEOUT that is not a number", async () => {
    const run = await start(["true"], { TEAM_LAUF_TIMEOUT: "bald" }).done;
    expect(run.code).toBe(2);
    expect(run.stderr).toContain("TEAM_LAUF_TIMEOUT");
  });

  test("prints the usage and exits 2 without a command", async () => {
    const run = await start([]).done;
    expect(run.code).toBe(2);
    expect(run.stderr).toContain("Usage: team-lauf <command> [args...]");
    expect(existsSync(lock)).toBe(false);
  });
});
