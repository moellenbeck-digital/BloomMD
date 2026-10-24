import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

export interface AgentE2ERunLockOptions {
  directory?: string;
  pid?: number;
  isProcessRunning?: (pid: number) => boolean;
}

export interface AgentE2ERunLock {
  directory: string;
  release(): Promise<void>;
}

function systemProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ESRCH") return false;
    // EPERM means a process exists but is not inspectable by this user. Do not steal its lock.
    return true;
  }
}

export async function acquireAgentE2ERunLock(options: AgentE2ERunLockOptions = {}): Promise<AgentE2ERunLock> {
  const directory = options.directory ?? join(tmpdir(), "bloommd-agent-e2e.lock");
  const pid = options.pid ?? process.pid;
  const isProcessRunning = options.isProcessRunning ?? systemProcessRunning;

  while (true) {
    try {
      await mkdir(directory);
      await writeFile(join(directory, "pid"), `${pid}\n`, "utf8");
      return {
        directory,
        release: () => rm(directory, { recursive: true, force: true }),
      };
    } catch (error) {
      if (!(error instanceof Error) || !("code" in error) || error.code !== "EEXIST") throw error;
      const owner = await readFile(join(directory, "pid"), "utf8").catch(() => "");
      const ownerPid = Number(owner.trim());
      if (Number.isSafeInteger(ownerPid) && ownerPid > 0 && !isProcessRunning(ownerPid)) {
        await rm(directory, { recursive: true, force: true });
        continue;
      }
      throw new Error(
        `A BloomMD OpenClaw E2E run is already active (lock: ${directory}, pid: ${owner.trim() || "unbekannt"}). `
        + "Wait for it to finish or remove a stale lock after verifying that no test process is running.",
      );
    }
  }
}
