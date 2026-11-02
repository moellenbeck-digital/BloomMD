/**
 * `scripts/ci-retry-network.sh`: bounded retry for network and package-source failures in CI (#141).
 * Runs the real script against small fake commands that count their own attempts.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const script = join(resolve(import.meta.dir, "..", ".."), "scripts", "ci-retry-network.sh");

let base = "";

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), "bloommd-ci-retry-"));
});

afterEach(() => rmSync(base, { recursive: true, force: true }));

/**
 * A fake command. `plan` has one entry per attempt: `ok`, `hang` or a line to print before
 * exiting with code 1. The attempt counter lives in a file so every attempt sees its number.
 */
function fakeCommand(plan: string[]): string {
  const counter = join(base, "counter");
  const planFile = join(base, "plan");
  const command = join(base, "fake.sh");
  writeFileSync(counter, "0");
  writeFileSync(planFile, plan.join("\n") + "\n");
  writeFileSync(
    command,
    `#!/usr/bin/env bash
n=$(( $(cat "${counter}") + 1 ))
echo "$n" > "${counter}"
step=$(sed -n "\${n}p" "${planFile}")
case "$step" in
  ok) echo "fake: ok"; exit 0 ;;
  hang) sleep 30 ;;
  *) echo "$step"; exit 1 ;;
esac
`,
  );
  chmodSync(command, 0o755);
  return command;
}

function attemptsMade(): number {
  return Number(readFileSync(join(base, "counter"), "utf8"));
}

function run(command: string, options: string[] = []): { code: number; output: string } {
  const proc = Bun.spawnSync(["bash", script, "--label", "Fake", "--pause", "0", ...options, "--", command], {
    stdout: "pipe",
    stderr: "pipe",
  });
  return { code: proc.exitCode, output: proc.stdout.toString() + proc.stderr.toString() };
}

describe("ci-retry-network", () => {
  test("runs a succeeding command once without any warning", () => {
    const result = run(fakeCommand(["ok"]));
    expect(result.code).toBe(0);
    expect(attemptsMade()).toBe(1);
    expect(result.output).not.toContain("::warning");
  });

  test("retries a network error, shows the failed attempt as a warning and then succeeds", () => {
    const result = run(fakeCommand(["Err:1 http://archive.ubuntu.com noble InRelease Temporary failure resolving 'archive.ubuntu.com'", "ok"]));
    expect(result.code).toBe(0);
    expect(attemptsMade()).toBe(2);
    expect(result.output).toContain("::warning title=Fake::attempt 1/3 failed");
    expect(result.output).toContain("::warning title=Fake::succeeded only on attempt 2/3");
  });

  test("fails hard with the command's exit code after the last attempt", () => {
    const result = run(fakeCommand(["E: Failed to fetch http://x", "Connection timed out", "ECONNRESET"]));
    expect(result.code).toBe(1);
    expect(attemptsMade()).toBe(3);
    expect(result.output).toContain("::warning title=Fake::attempt 1/3 failed");
    expect(result.output).toContain("::warning title=Fake::attempt 2/3 failed");
    expect(result.output).toContain("::error title=Fake::attempt 3/3 failed");
  });

  test("does not retry an error that is not a network or package-source problem", () => {
    const result = run(fakeCommand(["E: Unable to locate package libdoesnotexist", "ok"]));
    expect(result.code).toBe(1);
    expect(attemptsMade()).toBe(1);
    expect(result.output).toContain("::error title=Fake::failed with exit code 1; not a network or package-source error, not retried");
    expect(result.output).not.toContain("::warning");
  });

  test("cuts off a hung attempt with its own timeout and retries it", () => {
    const result = run(fakeCommand(["hang", "ok"]), ["--timeout", "1"]);
    expect(result.code).toBe(0);
    expect(attemptsMade()).toBe(2);
    expect(result.output).toContain("::warning title=Fake::attempt 1/3 failed (no result within 1s");
  });

  test("a command that hangs every time ends with exit code 124", () => {
    const result = run(fakeCommand(["hang", "hang"]), ["--timeout", "1", "--attempts", "2"]);
    expect(result.code).toBe(124);
    expect(attemptsMade()).toBe(2);
    expect(result.output).toContain("::error title=Fake::attempt 2/2 failed");
  });

  test("rejects a missing command and bad numbers", () => {
    expect(Bun.spawnSync(["bash", script], { stdout: "pipe", stderr: "pipe" }).exitCode).toBe(2);
    expect(Bun.spawnSync(["bash", script, "--attempts", "x", "--", "true"], { stdout: "pipe", stderr: "pipe" }).exitCode).toBe(2);
    expect(Bun.spawnSync(["bash", script, "--attempts", "0", "--", "true"], { stdout: "pipe", stderr: "pipe" }).exitCode).toBe(2);
  });
});
