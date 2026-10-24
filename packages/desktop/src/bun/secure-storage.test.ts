import { describe, expect, test } from "bun:test";
import { LinuxSecretServiceStorage, MacKeychainStorage, SecureStorageUnavailableError } from "./secure-storage";

describe("macOS secure token storage", () => {
  test("uses security CLI hex data for writes without plaintext token arguments", async () => {
    const calls: Array<{ command: string[]; input?: string }> = [];
    const storage = new MacKeychainStorage(async (command, input) => {
      calls.push({ command, input });
      return { exitCode: 0, stdout: "bloom_pat_test\n", stderr: "" };
    });

    await storage.set("connection-profile:one", "bloom_pat_test");
    expect(calls[0]?.command).toEqual([
      "/usr/bin/security", "add-generic-password", "-a", process.env.USER || "BloomMD",
      "-s", "io.moellenbeck-digital.bloommd.connection-profile.connection-profile:one", "-U", "-X",
      "626c6f6f6d5f7061745f74657374",
    ]);
    expect(calls[0]?.command).not.toContain("bloom_pat_test");
    expect(calls[0]?.input).toBeUndefined();
    expect(calls[0]?.command.join(" ")).not.toContain("bloom_pat_test");
  });

  test("reads and deletes by profile key without exposing secrets", async () => {
    const commands: string[][] = [];
    const storage = new MacKeychainStorage(async (command) => {
      commands.push(command);
      return { exitCode: 0, stdout: "bloom_pat_test\n", stderr: "" };
    });
    expect(await storage.get("connection-profile:one")).toBe("bloom_pat_test");
    await storage.delete("connection-profile:one");
    expect(commands[0]?.at(-1)).toBe("-w");
    expect(commands[1]?.slice(1, 3)).toEqual(["delete-generic-password", "-a"]);
  });
});

describe("Linux Secret Service token storage", () => {
  test("stores the token through stdin without plaintext token arguments", async () => {
    const calls: Array<{ command: string[]; input?: string }> = [];
    const storage = new LinuxSecretServiceStorage(async (command, input) => {
      calls.push({ command, input });
      return { exitCode: 0, stdout: "", stderr: "" };
    });

    await storage.set("connection-profile:one", "bloom_pat_test");
    expect(calls[0]?.command).toEqual([
      "/usr/bin/secret-tool", "store", "--label=BloomMD connection profile",
      "service", "io.moellenbeck-digital.bloommd.connection-profile",
      "account", process.env.USER || "BloomMD", "profile", "connection-profile:one",
    ]);
    expect(calls[0]?.command.join(" ")).not.toContain("bloom_pat_test");
    expect(calls[0]?.input).toBe("bloom_pat_test");
  });

  test("reads and deletes values by profile key", async () => {
    const commands: string[][] = [];
    const storage = new LinuxSecretServiceStorage(async (command) => {
      commands.push(command);
      return command[1] === "lookup"
        ? { exitCode: 0, stdout: "bloom_pat_test\n", stderr: "" }
        : { exitCode: 0, stdout: "", stderr: "" };
    });

    expect(await storage.get("connection-profile:one")).toBe("bloom_pat_test");
    await storage.delete("connection-profile:one");
    expect(commands[0]?.slice(0, 2)).toEqual(["/usr/bin/secret-tool", "lookup"]);
    expect(commands[1]?.slice(0, 2)).toEqual(["/usr/bin/secret-tool", "clear"]);
  });

  test("treats an empty lookup result as a missing value", async () => {
    const storage = new LinuxSecretServiceStorage(async () => ({ exitCode: 1, stdout: "", stderr: "" }));
    expect(await storage.get("connection-profile:missing")).toBeNull();
  });

  test("treats an explicit missing-secret response as a missing value", async () => {
    const storage = new LinuxSecretServiceStorage(async () => ({ exitCode: 1, stdout: "", stderr: "No such secret" }));
    expect(await storage.get("connection-profile:missing")).toBeNull();
  });

  test("reports an unavailable or locked Secret Service explicitly", async () => {
    const storage = new LinuxSecretServiceStorage(async () => ({
      exitCode: 1,
      stdout: "",
      stderr: "The name org.freedesktop.secrets was not provided by any .service files",
    }));
    await expect(storage.get("connection-profile:one")).rejects.toBeInstanceOf(SecureStorageUnavailableError);
    await expect(storage.set("connection-profile:one", "bloom_pat_test")).rejects.toBeInstanceOf(SecureStorageUnavailableError);
  });
});
