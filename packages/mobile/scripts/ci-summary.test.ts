import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { artifactLine, EMULATION_SENTENCE, NOT_CHECKED, notCheckedLines, stepTable } from "./ci-summary-text.mjs";

const CLI = resolve(import.meta.dir, "ci-summary.mjs");

describe("stepTable", () => {
  test("reports each outcome as it is and never calls a step that did not run passed", () => {
    const table = stepTable({ build: { outcome: "success" }, selftest: { outcome: "failure" } }, [
      ["build", "Build"],
      ["selftest", "Self-test"],
      ["upload", "Upload"],
    ]).join("\n");
    expect(table).toContain("| Build | ✅ passed |");
    expect(table).toContain("| Self-test | ❌ failed |");
    expect(table).toContain("| Upload | ⏭️ not run");
  });

  test("an unreadable steps context turns every step into not run", () => {
    expect(stepTable(undefined, [["build", "Build"]]).join("\n")).toContain("not run");
  });
});

describe("artifactLine", () => {
  test("uploaded, built but not uploaded, and missing with the reason", () => {
    expect(artifactLine({ name: "a", fileExists: true, sizeBytes: 2 * 1024 * 1024, uploadOutcome: "success", reason: "x" })).toContain("uploaded (2.0 MB)");
    expect(artifactLine({ name: "a", fileExists: true, sizeBytes: 1, uploadOutcome: "failure", reason: "x" })).toContain("upload ended as failure");
    expect(artifactLine({ name: "a", fileExists: false, sizeBytes: 0, uploadOutcome: "success", reason: "the build failed." })).toContain("none – the build failed.");
  });
});

describe("notCheckedLines", () => {
  test("lists the shared items, the extras and the emulation sentence", () => {
    const text = notCheckedLines(["the phone form factor"]).join("\n");
    expect(text).toContain("- the phone form factor");
    for (const item of NOT_CHECKED) expect(text).toContain(`- ${item}`);
    expect(text).toContain(EMULATION_SENTENCE);
  });
});

describe("ci-summary CLI", () => {
  test("names a failed step and the reason for a missing artifact", () => {
    const dir = mkdtempSync(join(tmpdir(), "ci-summary-"));
    try {
      const result = spawnSync(process.execPath, [
        CLI, "--title", "iOS: test", "--step", "build=Simulator build", "--step", "selftest=Self-test",
        "--artifact-name", "ios-simulator-app", "--artifact-file", join(dir, "missing.zip"), "--artifact-step", "upload",
        "--artifact-missing", "the simulator build did not produce an App.app.",
      ], { encoding: "utf8", env: { ...process.env, STEPS_JSON: JSON.stringify({ build: { outcome: "failure" } }) } });
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("## iOS: test");
      expect(result.stdout).toContain("| Simulator build | ❌ failed |");
      expect(result.stdout).toContain("| Self-test | ⏭️ not run");
      expect(result.stdout).toContain("**Artifact `ios-simulator-app`:** none – the simulator build did not produce an App.app.");
      expect(result.stdout).toContain("Not checked here");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("a file that exists and an upload that succeeded count as uploaded", () => {
    const dir = mkdtempSync(join(tmpdir(), "ci-summary-"));
    try {
      const file = join(dir, "app.zip");
      writeFileSync(file, "x".repeat(10));
      const result = spawnSync(process.execPath, [CLI, "--step", "build=Build", "--artifact-name", "a", "--artifact-file", file, "--artifact-step", "upload"], {
        encoding: "utf8",
        env: { ...process.env, STEPS_JSON: JSON.stringify({ build: { outcome: "success" }, upload: { outcome: "success" } }) },
      });
      expect(result.stdout).toContain("| Build | ✅ passed |");
      expect(result.stdout).toContain("**Artifact `a`:** uploaded");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
