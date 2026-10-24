import { expect, test } from "bun:test";
import { chmodSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test.skipIf(process.platform !== "darwin")("native guard preserves arguments and exit status in paths with spaces", () => {
  const directory = mkdtempSync(join(tmpdir(), "bloommd launcher "));
  const bin = join(directory, "BloomMD.app/Contents/MacOS");
  mkdirSync(bin, { recursive: true });
  try {
    const launcher = join(bin, "launcher");
    const compiled = Bun.spawnSync(["xcrun", "clang", "-Wall", "-Wextra", "-Werror", "-mmacosx-version-min=11.0", join(import.meta.dir, "macos-launcher.c"), "-o", launcher]);
    expect(compiled.exitCode).toBe(0);
    const original = join(bin, "launcher-electrobun");
    writeFileSync(original, '#!/bin/sh\nprintf "%s\\n" "$@"\nexit 23\n');
    chmodSync(original, 0o755);
    const result = Bun.spawnSync([launcher, "a path/with spaces.md", "--flag"]);
    expect(result.stdout.toString()).toBe("a path/with spaces.md\n--flag\n");
    expect(result.exitCode).toBe(23);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
