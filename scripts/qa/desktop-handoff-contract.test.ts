import { describe, expect, test } from "bun:test";
import { desktopHandoffPath as desktopAppHandoffPath } from "../../packages/desktop/src/bun/handoff-path";
import { handoffPathFor as cliHandoffPath } from "../../packages/wiki-cli/src/desktop-handoff";
import { desktopHandoffPath as pluginHandoffPath } from "../../plugins/obsidian/src/desktop-handoff";

describe("desktop handoff path contract", () => {
  test("matches Desktop, CLI and Obsidian across platforms", () => {
    const cases = [
      { platform: "darwin", tmpdir: "/var/folders/x/T/", env: {}, uid: 501, username: "max" },
      { platform: "linux", tmpdir: "/tmp", env: { XDG_RUNTIME_DIR: "/run/user/1000/" }, uid: 1000, username: "max" },
      { platform: "linux", tmpdir: "/tmp/", env: {}, uid: 1000, username: "max" },
      { platform: "linux", tmpdir: "/tmp", env: { XDG_RUNTIME_DIR: "relative" }, uid: 1001, username: "anna" },
      { platform: "win32", tmpdir: "C:\\Users\\Max\\AppData\\Local\\Temp", env: {}, uid: -1, username: "Max" },
      { platform: "win32", tmpdir: "C:\\Temp", env: {}, uid: -1, username: "Zoë" },
      { platform: "linux", tmpdir: "/tmp", env: { BLOOMMD_DESKTOP_HANDOFF_PATH: " /run/x.sock " }, uid: 1000, username: "max" },
    ];
    for (const input of cases) {
      expect(pluginHandoffPath(input)).toBe(desktopAppHandoffPath(input));
      expect(cliHandoffPath(input)).toBe(desktopAppHandoffPath(input));
    }
  });
});
