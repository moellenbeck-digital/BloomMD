import { describe, expect, test } from "bun:test";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

function hasSupportedSystemNode(): boolean {
  const result = Bun.spawnSync(["node", "--version"], { stdout: "pipe", stderr: "pipe" });
  const output = new TextDecoder().decode(result.stdout).trim();
  const match = /^v(\d+)\.(\d+)\./.exec(output);
  if (!match) return false;

  const major = Number(match[1]);
  const minor = Number(match[2]);
  return (major === 24 && minor >= 16) || major >= 26;
}

function openClawCompatibility(): { compatible: boolean; reason?: string } {
  if (!Bun.which("openclaw")) return { compatible: false, reason: "OpenClaw ist nicht installiert." };
  if (!hasSupportedSystemNode()) return { compatible: false, reason: "OpenClaw benötigt für diesen Archive-Test Node 24.16 oder neuer." };

  const result = Bun.spawnSync(["openclaw", "--version"], { stdout: "pipe", stderr: "pipe" });
  const output = new TextDecoder().decode(result.stdout).trim();
  const match = /(?:OpenClaw\s+)?(\d+)\.(\d+)\.(\d+)/u.exec(output);
  if (result.exitCode !== 0 || !match) return { compatible: false, reason: `Die installierte OpenClaw-Version konnte nicht gelesen werden: ${output || "keine Ausgabe"}.` };

  const version = [Number(match[1]), Number(match[2]), Number(match[3])] as const;
  const minimum = [2026, 9, 3] as const;
  const isSupported = version[0] > minimum[0]
    || (version[0] === minimum[0] && (version[1] > minimum[1]
      || (version[1] === minimum[1] && version[2] >= minimum[2])));
  return isSupported
    ? { compatible: true }
    : { compatible: false, reason: `OpenClaw ${version.join(".")} ist älter als die erforderliche Host-Version 2026.9.3.` };
}

async function openClaw(stateDirectory: string, args: string[]): Promise<CommandResult> {
  const child = Bun.spawn(["openclaw", ...args], {
    env: { ...process.env, OPENCLAW_STATE_DIR: stateDirectory },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { exitCode, stdout, stderr };
}

async function installPlugin(stateDirectory: string, pluginRoot: string, archivePath: string): Promise<CommandResult> {
  const child = Bun.spawn(["sh", resolve(pluginRoot, "scripts", "install-plugin.sh"), archivePath, "--force"], {
    env: { ...process.env, OPENCLAW_STATE_DIR: stateDirectory },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { exitCode, stdout, stderr };
}

describe("BloomMD OpenClaw plugin", () => {
  // Archive installs invoke the host package manager. The container smoke test still covers
  // the supported runtime in CI; a developer machine with an older host is skipped explicitly.
  const compatibility = openClawCompatibility();
  if (!compatibility.compatible) console.warn(`[BloomMD] Archive-Installtest übersprungen: ${compatibility.reason}`);
  const openClawTest = compatibility.compatible ? test : test.skip;
  // Build, npm pack and a real OpenClaw install take ~10 s locally; bun's 5 s default is too short.
  const INSTALL_TIMEOUT_MS = 120_000;

  openClawTest("installs the packaged plugin in isolated OpenClaw state and contributes its pairing CLI", async () => {
    const stateDirectory = await mkdtemp(resolve(tmpdir(), "bloommd-openclaw-plugin-test-"));
    const packageDirectory = await mkdtemp(resolve(tmpdir(), "bloommd-openclaw-plugin-package-"));
    try {
      const pluginRoot = resolve(import.meta.dir, "..");
      const build = Bun.spawn([process.execPath, "run", "build"], {
        cwd: pluginRoot,
        stdout: "pipe",
        stderr: "pipe",
      });
      expect(await build.exited).toBe(0);

      const packed = Bun.spawn(["npm", "pack", "--pack-destination", packageDirectory], {
        cwd: pluginRoot,
        stdout: "pipe",
        stderr: "pipe",
      });
      expect(await packed.exited).toBe(0);

      const archive = (await readdir(packageDirectory)).find((entry) => entry.endsWith(".tgz"));
      expect(archive).toBeDefined();
      const installed = await installPlugin(stateDirectory, pluginRoot, resolve(packageDirectory, archive ?? "missing-plugin-archive.tgz"));
      if (installed.exitCode !== 0) {
        throw new Error(`OpenClaw plugin installation failed:\n${installed.stdout}\n${installed.stderr}`);
      }
      expect(installed.exitCode).toBe(0);
      expect(`${installed.stdout}\n${installed.stderr}`).toContain("bloommd-workspace-agent");

      const help = await openClaw(stateDirectory, ["bloommd", "--help"]);
      expect(help.exitCode).toBe(0);
      expect(help.stdout).toContain("openclaw bloommd");
      expect(help.stdout).toContain("pair");
      expect(help.stdout).toContain("status");
    } finally {
      await rm(stateDirectory, { recursive: true, force: true });
      await rm(packageDirectory, { recursive: true, force: true });
    }
  }, INSTALL_TIMEOUT_MS);
});
