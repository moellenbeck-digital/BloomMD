import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const root = process.cwd();
const syncScript = join(root, "scripts", "sync-obsidian-repo.sh");

/**
 * These tests cover the mirror attestation, not mobile verification: a plugin version with mobile
 * support may be ahead of its manual touch matrix, so the sync opts in like CI beta builds do.
 */
const betaEnv = { ...process.env, BLOOMMD_ALLOW_UNVERIFIED_MOBILE: "1" };

function run(command: string[], cwd: string, env: Record<string, string | undefined> = betaEnv): { exitCode: number; output: string } {
  const result = Bun.spawnSync(command, { cwd, stdout: "pipe", stderr: "pipe", env });
  const decoder = new TextDecoder();
  return {
    exitCode: result.exitCode,
    output: `${decoder.decode(result.stdout)}${decoder.decode(result.stderr)}`,
  };
}

// Each case syncs, installs and builds a complete standalone mirror; that takes longer than the
// default 5 s on CI runners.
const MIRROR_TIMEOUT_MS = 120_000;

describe("Obsidian public mirror release contract", () => {
  test("rejects a release snapshot attestation that no longer matches the generated mirror", async () => {
    const mirror = await mkdtemp(join(tmpdir(), "bloommd-obsidian-mirror-"));
    try {
      const initialized = run(["git", "init", "--quiet", mirror], root);
      expect(initialized.exitCode).toBe(0);

      const synchronized = run([syncScript, mirror], root);
      expect(synchronized.exitCode).toBe(0);

      const mirrorPath = join(mirror, "MIRROR.json");
      const attestation = JSON.parse(await readFile(mirrorPath, "utf8")) as { releaseSnapshotSha256: string };
      // Flip the first hex digit so the tampered value always differs, even when the real hash starts with "0".
      const firstDigit = attestation.releaseSnapshotSha256.charAt(0) === "0" ? "1" : "0";
      attestation.releaseSnapshotSha256 = `${firstDigit}${attestation.releaseSnapshotSha256.slice(1)}`;
      await writeFile(mirrorPath, `${JSON.stringify(attestation, null, 2)}\n`);

      const verified = run([process.execPath, "run", "release:verify"], mirror);
      expect(verified.exitCode).toBe(1);
      expect(verified.output).toContain("does not attest to the exact public release snapshot");
    } finally {
      await rm(mirror, { recursive: true, force: true });
    }
  }, MIRROR_TIMEOUT_MS);

  test("refuses a public mobile release until the touch matrix verified that exact version", async () => {
    const mirror = await mkdtemp(join(tmpdir(), "bloommd-obsidian-mirror-"));
    try {
      expect(run(["git", "init", "--quiet", mirror], root).exitCode).toBe(0);
      expect(run([syncScript, mirror], root).exitCode).toBe(0);
      const manifest = JSON.parse(await readFile(join(mirror, "manifest.json"), "utf8")) as { isDesktopOnly: boolean; version: string };
      if (manifest.isDesktopOnly) return;

      const matrixPath = join(mirror, "MOBILE-MATRIX.md");
      const matrix = await readFile(matrixPath, "utf8");
      await writeFile(matrixPath, matrix.split("\n").filter((line) => !line.startsWith("Verified plugin version:")).join("\n"));

      const { BLOOMMD_ALLOW_UNVERIFIED_MOBILE: _optIn, ...publicEnv } = process.env;
      const verified = run([process.execPath, "run", "release:verify"], mirror, publicEnv);
      expect(verified.exitCode).toBe(1);
      expect(verified.output).toContain(`MOBILE-MATRIX.md with "Verified plugin version: ${manifest.version}"`);
    } finally {
      await rm(mirror, { recursive: true, force: true });
    }
  }, MIRROR_TIMEOUT_MS);
});
