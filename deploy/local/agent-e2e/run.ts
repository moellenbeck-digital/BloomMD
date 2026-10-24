import { randomBytes } from "node:crypto";
import { acquireAgentE2ERunLock } from "./run-lock";
import { agentE2ETimeoutMilliseconds, waitForAgentE2EProcess } from "./wait-for-process";

const root = new URL("../../..", import.meta.url).pathname;
const composeFiles = ["-f", "deploy/local/docker-compose.yml", "-f", "deploy/local/docker-compose.agent-e2e.yml"];
const projectArgs = [...composeFiles, "--profile", "full", "--profile", "agent-e2e"];
const keepContainers = process.env.BLOOMMD_E2E_KEEP_CONTAINERS === "1";
const agentE2ETimeoutMs = agentE2ETimeoutMilliseconds(process.env.BLOOMMD_AGENT_E2E_TIMEOUT_SECONDS);
const environment = {
  ...process.env,
  BLOOMMD_SYNC_SECRET: process.env.BLOOMMD_SYNC_SECRET ?? `sync-e2e-${randomBytes(32).toString("hex")}`,
  BLOOMMD_AUTH_SECRET: process.env.BLOOMMD_AUTH_SECRET ?? `auth-e2e-${randomBytes(32).toString("hex")}`,
  // Host ports are irrelevant to the test and use an uncommon range to avoid a local dev server.
  WEB_PORT: process.env.WEB_PORT ?? "33000",
  SYNC_PORT: process.env.SYNC_PORT ?? "34100",
};

function run(args: string[], allowFailure = false) {
  const result = Bun.spawnSync({ cmd: ["docker", "compose", ...args], cwd: root, env: environment, stdout: "inherit", stderr: "inherit" });
  if (!allowFailure && result.exitCode !== 0) throw new Error(`docker compose ${args.join(" ")} failed with ${result.exitCode}.`);
  return result.exitCode;
}

function printDiagnostics() {
  run(
    [
      ...projectArgs,
      "ps",
      "--all",
    ],
    true,
  );
  run(
    [
      ...projectArgs,
      "logs",
      "--no-log-prefix",
      "agent-e2e",
      "openclaw-agent-a",
      "openclaw-agent-b",
      "model-stub",
      "web",
    ],
    true,
  );
}

let runLock: Awaited<ReturnType<typeof acquireAgentE2ERunLock>> | null = null;
try {
  runLock = await acquireAgentE2ERunLock();
  run([...projectArgs, "down", "-v", "--remove-orphans"], true);
  run([...projectArgs, "up", "--build", "-d"]);
  const e2eProcess = Bun.spawn({
    cmd: ["docker", "compose", ...projectArgs, "wait", "agent-e2e"],
    cwd: root,
    env: environment,
    stdout: "inherit",
    stderr: "inherit",
  });
  const e2eResult = await waitForAgentE2EProcess({
    wait: e2eProcess.exited,
    timeoutMs: agentE2ETimeoutMs,
    cancel: () => e2eProcess.kill(),
  });
  if (e2eResult.timedOut) {
    printDiagnostics();
    throw new Error(`OpenClaw workspace-agent E2E exceeded ${agentE2ETimeoutMs / 1_000} seconds.`);
  }
  if (e2eResult.exitCode !== 0) {
    // `docker compose wait` only reports an exit code. Print every relevant service before
    // teardown so a failed CI run contains the orchestrator, plugin and model diagnostics.
    printDiagnostics();
    throw new Error(`OpenClaw workspace-agent E2E failed with exit code ${e2eResult.exitCode}.`);
  }
  // The plugin CLI must no longer be able to use the revoked token. This is executed inside the
  // actual plugin container, after the server-side revocation performed by the orchestrator.
  const revokedStatus = run([
    ...projectArgs,
    "exec",
    "-T",
    "openclaw-agent-a",
    "node",
    "/app/openclaw.mjs",
    "bloommd",
    "status",
    "--bloommd-profile",
    "agent-a",
  ], true);
  if (revokedStatus === 0) throw new Error("Revoked OpenClaw plugin profile was still accepted by BloomMD.");
  run([...projectArgs, "logs", "--no-log-prefix", "agent-e2e"]);
} finally {
  if (runLock && !keepContainers) run([...projectArgs, "down", "-v", "--remove-orphans"], true);
  if (runLock) await runLock.release();
}
