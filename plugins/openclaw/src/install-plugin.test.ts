import { afterEach, describe, expect, test } from "bun:test";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function createOpenClawStub(supportsCapabilityFlag: boolean): Promise<{ command: string; logPath: string }> {
  const directory = await mkdtemp(resolve(tmpdir(), "bloommd-openclaw-install-test-"));
  temporaryDirectories.push(directory);
  const command = resolve(directory, "openclaw");
  const logPath = resolve(directory, "arguments.txt");
  const help = supportsCapabilityFlag ? "  --accept-capabilities  Accept capabilities\n" : "  --force  Confirm install\n";
  await writeFile(command, `#!/bin/sh\nif [ "$1" = "plugins" ] && [ "$2" = "install" ] && [ "$3" = "--help" ]; then\n  printf '${help}'\n  exit 0\nfi\nprintf '%s\\n' "$@" > "$BLOOMMD_TEST_ARGUMENT_LOG"\n`);
  await chmod(command, 0o755);
  return { command, logPath };
}

async function runInstaller(command: string, logPath: string): Promise<string[]> {
  const installer = resolve(import.meta.dir, "..", "scripts", "install-plugin.sh");
  const child = Bun.spawn(["sh", installer, "/tmp/bloommd-plugin.tgz", "--force"], {
    env: { ...process.env, OPENCLAW_BIN: command, BLOOMMD_TEST_ARGUMENT_LOG: logPath },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()]);
  expect(exitCode).toBe(0);
  expect(stderr).toBe("");
  return (await readFile(logPath, "utf8")).trim().split("\n");
}

describe("OpenClaw plugin installer", () => {
  test("passes capability consent only when the installed host advertises the flag", async () => {
    const { command, logPath } = await createOpenClawStub(true);

    expect(await runInstaller(command, logPath)).toEqual([
      "plugins",
      "install",
      "/tmp/bloommd-plugin.tgz",
      "--force",
      "--accept-capabilities",
    ]);
  });

  test("uses the host default flow when capability consent is not a supported option", async () => {
    const { command, logPath } = await createOpenClawStub(false);

    expect(await runInstaller(command, logPath)).toEqual([
      "plugins",
      "install",
      "/tmp/bloommd-plugin.tgz",
      "--force",
    ]);
  });
});
