import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { acquireAgentE2ERunLock } from "./run-lock";

const directories: string[] = [];

async function lockDirectory(): Promise<string> {
  const directory = join(await mkdtemp(join(tmpdir(), "bloommd-agent-e2e-lock-test-")), "lock");
  directories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("acquireAgentE2ERunLock", () => {
  test("reclaims a lock owned by a process that no longer exists", async () => {
    const directory = await lockDirectory();
    await mkdir(directory);
    await writeFile(join(directory, "pid"), "123\n", "utf8");

    const lock = await acquireAgentE2ERunLock({ directory, pid: 456, isProcessRunning: () => false });

    expect(await readFile(join(directory, "pid"), "utf8")).toBe("456\n");
    await lock.release();
  });

  test("does not remove a lock owned by a live process", async () => {
    const directory = await lockDirectory();
    await mkdir(directory);
    await writeFile(join(directory, "pid"), "123\n", "utf8");

    await expect(acquireAgentE2ERunLock({ directory, pid: 456, isProcessRunning: () => true }))
      .rejects.toThrow("already active");
    expect(await readFile(join(directory, "pid"), "utf8")).toBe("123\n");
  });
});
