import { describe, expect, test } from "bun:test";
import { desktopHandoffPath, handoffPrivateDir, handoffUserKey } from "./handoff-path";

const base = { tmpdir: "/tmp", uid: 1000, username: "max", env: {} as Record<string, string | undefined> };

describe("desktopHandoffPath", () => {
  test("keeps the per-user macOS temp dir", () => {
    expect(desktopHandoffPath({ ...base, platform: "darwin", tmpdir: "/var/folders/x/T/" })).toBe("/var/folders/x/T/bloommd-desktop-handoff.sock");
    expect(handoffPrivateDir({ ...base, platform: "darwin" })).toBeNull();
  });

  test("uses XDG_RUNTIME_DIR on Linux, else a private uid directory, never the shared /tmp", () => {
    expect(desktopHandoffPath({ ...base, platform: "linux", env: { XDG_RUNTIME_DIR: "/run/user/1000" } })).toBe("/run/user/1000/bloommd-desktop-handoff.sock");
    expect(handoffPrivateDir({ ...base, platform: "linux", env: { XDG_RUNTIME_DIR: "/run/user/1000" } })).toBeNull();
    expect(desktopHandoffPath({ ...base, platform: "linux" })).toBe("/tmp/bloommd-1000/bloommd-desktop-handoff.sock");
    expect(handoffPrivateDir({ ...base, platform: "linux" })).toBe("/tmp/bloommd-1000");
  });

  test("gives every Windows user an own pipe", () => {
    const max = desktopHandoffPath({ ...base, platform: "win32", username: "Max" });
    expect(max).toBe(`\\\\.\\pipe\\bloommd-desktop-handoff-${handoffUserKey("max")}`);
    expect(desktopHandoffPath({ ...base, platform: "win32", username: "anna" })).not.toBe(max);
  });

  test("an explicit path wins everywhere", () => {
    expect(desktopHandoffPath({ ...base, platform: "linux", env: { BLOOMMD_DESKTOP_HANDOFF_PATH: "/x.sock" } })).toBe("/x.sock");
    expect(handoffPrivateDir({ ...base, platform: "linux", env: { BLOOMMD_DESKTOP_HANDOFF_PATH: "/x.sock" } })).toBeNull();
  });
});
