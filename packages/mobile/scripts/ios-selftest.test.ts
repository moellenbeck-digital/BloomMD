import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const script = resolve(import.meta.dir, "ios-selftest.sh");
const hasTools = Boolean(Bun.which("jq") && Bun.which("perl") && Bun.which("bash"));

// A stand-in for xcrun: just enough of simctl for the script, steered by FAKE_* variables.
const fakeXcrun = `#!/usr/bin/env bash
case "$2" in
  list)
    if [ "$3" = runtimes ]; then
      echo '{"runtimes":[{"identifier":"rt.iOS-26","isAvailable":true,"platform":"iOS","supportedDeviceTypes":[{"name":"iPad Pro 13-inch","identifier":"dt.ipad"}]}]}'
    else
      echo "    bloommd-ci (SIM-1) (Booted)"
    fi ;;
  create) echo SIM-1 ;;
  boot|bootstatus|install|io) [ "$2" = io ] && touch "$5"; exit 0 ;;
  get_app_container) echo "$FAKE_DATA" ;;
  launch)
    if [ -n "\${FAKE_RESULT:-}" ]; then printf '%s' "$FAKE_RESULT" > "$FAKE_DATA/Documents/selftest-result.json"; fi
    if [ -n "\${FAKE_ERRORS:-}" ]; then printf '%s\\n' "$FAKE_ERRORS" > "$FAKE_DATA/Documents/selftest-errors.txt"; fi ;;
  spawn)
    if [ "$4" = launchctl ]; then echo "123 0 UIKitApplication:app.bloommd.mobile[abcd]"; else echo "App: simulator log line"; fi ;;
esac
`;

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function run(env: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), "ios-selftest-"));
  directories.push(root);
  const bin = join(root, "bin");
  const data = join(root, "data");
  mkdirSync(bin);
  mkdirSync(join(data, "Documents"), { recursive: true });
  writeFileSync(join(bin, "xcrun"), fakeXcrun);
  chmodSync(join(bin, "xcrun"), 0o755);
  const diagnostics = join(root, "diagnostics");
  const process = Bun.spawnSync(["bash", script, join(root, "App.app"), join(root, "shot.png"), diagnostics], {
    env: { PATH: `${bin}:${globalThis.process.env.PATH}`, HOME: root, FAKE_DATA: data, GITHUB_ACTIONS: "true", SELFTEST_POLLS: "2", SELFTEST_POLL_SECONDS: "0.1", ...env },
  });
  const read = (file: string) => (existsSync(join(diagnostics, file)) ? readFileSync(join(diagnostics, file), "utf8") : null);
  return { status: process.exitCode, out: process.stdout.toString(), err: process.stderr.toString(), diagnostics, read, data };
}

describe.skipIf(!hasTools)("ios-selftest.sh", () => {
  test("passes when the result says passed, with timings as a notice", () => {
    const result = run({ FAKE_RESULT: '{"passed":true,"checks":[]}' });
    expect(result.status).toBe(0);
    expect(result.out).toContain('"passed":true');
    expect(result.out).toMatch(/title=iOS self-test::passed after \d+s; create=\d+s boot=\d+s bootstatus=\d+s install=\d+s launch=\d+s wait=\d+s/);
    expect(existsSync(result.diagnostics)).toBe(false);
  });

  test("fails on a result that is not passed and keeps it in the diagnostics", () => {
    const failed = '{"passed":false,"checks":[{"name":"x","ok":false,"detail":"boom"}]}';
    const result = run({ FAKE_RESULT: failed });
    expect(result.status).toBe(1);
    expect(result.read("selftest-result.json")).toContain('"detail":"boom"');
    expect(result.out).toContain("::error title=iOS self-test result::");
  });

  test("fails without a result and says why: trigger left, JavaScript errors, simulator log", () => {
    const result = run({ FAKE_ERRORS: "rejection: Error: startup failed" });
    expect(result.status).toBe(1);
    expect(result.err).toContain("No selftest-result.json after");
    const state = result.read("state.txt") ?? "";
    expect(state).toContain("app process: 1 running");
    expect(state).toContain("run-selftest left in Documents: yes");
    expect(result.read("selftest-errors.txt")).toContain("rejection: Error: startup failed");
    expect(result.read("simulator.log")).toContain("simulator log line");
    expect(result.out).toContain("::error title=iOS self-test JavaScript errors::rejection: Error: startup failed");
  });

  test("escapes line breaks and percent signs in annotations", () => {
    const result = run({ FAKE_ERRORS: "100% broken" });
    expect(result.out).toContain("::error title=iOS self-test JavaScript errors::100%25 broken");
    expect(result.out).toMatch(/title=iOS self-test state::exit=1 after \d+s;[^\n]*%0Asimulator:/);
  });
});
