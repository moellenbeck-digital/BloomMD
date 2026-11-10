import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ptr, read, toArrayBuffer, type Pointer } from "bun:ffi";
import {
  createSecureStorage,
  ERROR_NOT_FOUND,
  LinuxSecretServiceStorage,
  MacKeychainStorage,
  NativeWindowsCredentialApi,
  SecureStorageUnavailableError,
  UnavailableSecureStorage,
  WindowsCredentialStorage,
  type WindowsCredentialApi,
  type WindowsCredentialLibrary,
} from "./secure-storage";
import { loadSettings, migrateLegacyRemote, saveSettings } from "./settings";

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

const TOKEN = "bloom_pat_test_0000";
const KEY = "connection-profile:one";
const SERVICE = "io.moellenbeck-digital.bloommd.connection-profile";
const ERROR_ACCESS_DENIED = 5;

/** In-memory Credential Manager; `failure` makes every call report a Win32 error or throw. */
function fakeWindowsApi() {
  const values = new Map<string, { userName: string; secret: string }>();
  const state: { failure: number | Error | null } = { failure: null };
  const fail = (): number => {
    if (state.failure instanceof Error) throw state.failure;
    return state.failure ?? 0;
  };
  const api: WindowsCredentialApi = {
    write(target, userName, secret) {
      const status = fail();
      if (status !== 0) return status;
      values.set(target, { userName, secret });
      return 0;
    },
    read(target) {
      const status = fail();
      if (status !== 0) return { status };
      const entry = values.get(target);
      return entry ? { status: 0, secret: entry.secret } : { status: ERROR_NOT_FOUND };
    },
    delete(target) {
      const status = fail();
      if (status !== 0) return status;
      return values.delete(target) ? 0 : ERROR_NOT_FOUND;
    },
  };
  return { api, values, state };
}

function readWide(pointer: Pointer): string {
  let text = "";
  for (let offset = 0; ; offset += 2) {
    const unit = read.u16(pointer, offset);
    if (unit === 0) return text;
    text += String.fromCharCode(unit);
  }
}

/** Simulates the advapi32 ABI on real memory, so the CREDENTIALW encoding and decoding is exercised. */
function fakeWindowsLibrary() {
  const entries = new Map<string, { userName: string; persist: number; blob: Buffer }>();
  const live = new Map<number, Buffer[]>();
  const freed: number[] = [];
  const state = { lastError: 0, failWith: 0 };
  const failed = (): boolean => {
    state.lastError = state.failWith;
    return state.failWith !== 0;
  };
  const library: WindowsCredentialLibrary = {
    CredWriteW(credential) {
      if (failed()) return 0;
      const view = Buffer.from(credential.buffer, credential.byteOffset, credential.byteLength);
      expect(view.byteLength).toBe(80);
      expect(view.readUInt32LE(4)).toBe(1); // CRED_TYPE_GENERIC
      const size = view.readUInt32LE(32);
      const pointerAt = (offset: number) => Number(view.readBigUInt64LE(offset)) as Pointer;
      entries.set(readWide(pointerAt(8)), {
        userName: readWide(pointerAt(72)),
        persist: view.readUInt32LE(48),
        blob: Buffer.from(Buffer.from(toArrayBuffer(pointerAt(40), 0, size))),
      });
      return 1;
    },
    CredReadW(targetName, type, _flags, out) {
      if (failed()) return 0;
      expect(type).toBe(1);
      const entry = entries.get(readWide(ptr(targetName)));
      if (!entry) {
        state.lastError = ERROR_NOT_FOUND;
        return 0;
      }
      const blob = Buffer.from(entry.blob);
      const credential = Buffer.alloc(80);
      credential.writeUInt32LE(blob.length, 32);
      credential.writeBigUInt64LE(BigInt(ptr(blob)), 40);
      const pointer = ptr(credential);
      live.set(pointer, [credential, blob]);
      new BigUint64Array(out.buffer, out.byteOffset, 1)[0] = BigInt(pointer);
      return 1;
    },
    CredDeleteW(targetName, type) {
      if (failed()) return 0;
      expect(type).toBe(1);
      if (entries.delete(readWide(ptr(targetName)))) return 1;
      state.lastError = ERROR_NOT_FOUND;
      return 0;
    },
    CredFree(pointer) {
      freed.push(pointer);
      live.delete(pointer);
    },
    GetLastError: () => state.lastError,
  };
  return { library, entries, live, freed, state };
}

describe("Windows Credential Manager token storage", () => {
  test("round-trips set, get and delete under the profile target", async () => {
    const fake = fakeWindowsApi();
    const storage = new WindowsCredentialStorage(fake.api);

    await storage.set(KEY, TOKEN);
    expect([...fake.values.keys()]).toEqual([`${SERVICE}.${KEY}`]);
    expect(fake.values.get(`${SERVICE}.${KEY}`)?.userName).toBe(process.env.USERNAME || "BloomMD");
    expect(await storage.get(KEY)).toBe(TOKEN);
    expect(await storage.get("connection-profile:two")).toBeNull();

    await storage.delete(KEY);
    expect(fake.values.size).toBe(0);
    expect(await storage.get(KEY)).toBeNull();
  });

  test("keeps entries of different profile keys apart", async () => {
    const fake = fakeWindowsApi();
    const storage = new WindowsCredentialStorage(fake.api);
    await storage.set("connection-profile:one", "bloom_pat_test_0001");
    await storage.set("connection-profile:two", "bloom_pat_test_0002");
    await storage.delete("connection-profile:one");
    expect(await storage.get("connection-profile:two")).toBe("bloom_pat_test_0002");
  });

  test("rejects invalid keys before touching the credential store", async () => {
    const fake = fakeWindowsApi();
    const storage = new WindowsCredentialStorage(fake.api);
    for (const key of ["", "has space", "semi;colon", "a".repeat(201)]) {
      await expect(storage.get(key)).rejects.toThrow("Invalid secure storage key.");
      await expect(storage.set(key, TOKEN)).rejects.toThrow("Invalid secure storage key.");
      await expect(storage.delete(key)).rejects.toThrow("Invalid secure storage key.");
    }
    expect(fake.values.size).toBe(0);
  });

  test("rejects values without the bloom_pat_ prefix or beyond the blob limit", async () => {
    const fake = fakeWindowsApi();
    const storage = new WindowsCredentialStorage(fake.api);
    await expect(storage.set(KEY, "not-a-token")).rejects.toThrow("A personal BloomMD access token is required.");
    await expect(storage.set(KEY, `bloom_pat_${"x".repeat(1280)}`)).rejects.toThrow("too long");
    expect(fake.values.size).toBe(0);
  });

  test("returns null for a missing entry and deletes idempotently", async () => {
    const storage = new WindowsCredentialStorage(fakeWindowsApi().api);
    expect(await storage.get(KEY)).toBeNull();
    await storage.delete(KEY);
    await storage.delete(KEY);
  });

  test("reports backend failures as SecureStorageUnavailableError without the token", async () => {
    const fake = fakeWindowsApi();
    const storage = new WindowsCredentialStorage(fake.api);
    const failures: Array<number | Error> = [
      ERROR_ACCESS_DENIED,
      1312, // ERROR_NO_SUCH_LOGON_SESSION
      new Error(`advapi32 exploded while handling ${TOKEN}`),
    ];
    for (const failure of failures) {
      fake.state.failure = failure;
      const attempts = [storage.get(KEY), storage.set(KEY, TOKEN), storage.delete(KEY)];
      for (const attempt of attempts) {
        const error = await attempt.then(() => null, (reason: unknown) => reason);
        expect(error).toBeInstanceOf(SecureStorageUnavailableError);
        expect((error as SecureStorageUnavailableError).code).toBe("SECURE_STORAGE_UNAVAILABLE");
        expect((error as Error).message).not.toContain(TOKEN);
        expect((error as Error).message).not.toContain("exploded");
      }
    }
    expect(fake.values.size).toBe(0);
  });

  test("native layer encodes CREDENTIALW, persists locally and never spawns a process", async () => {
    const spawn = spyOn(Bun, "spawn");
    try {
      const fake = fakeWindowsLibrary();
      const storage = new WindowsCredentialStorage(new NativeWindowsCredentialApi(() => fake.library));

      await storage.set(KEY, TOKEN);
      const entry = fake.entries.get(`${SERVICE}.${KEY}`);
      expect(entry?.persist).toBe(2); // CRED_PERSIST_LOCAL_MACHINE
      expect(entry?.userName).toBe(process.env.USERNAME || "BloomMD");
      expect(entry?.blob.toString("utf16le")).toBe(TOKEN);

      expect(await storage.get(KEY)).toBe(TOKEN);
      expect(fake.freed).toHaveLength(1);
      expect(fake.live.size).toBe(0);

      await storage.delete(KEY);
      expect(fake.entries.size).toBe(0);
      expect(await storage.get(KEY)).toBeNull();
      await storage.delete(KEY);
      expect(spawn).not.toHaveBeenCalled();
    } finally {
      spawn.mockRestore();
    }
  });

  test("native layer maps Win32 errors to unavailable and ERROR_NOT_FOUND to a missing entry", async () => {
    const fake = fakeWindowsLibrary();
    const storage = new WindowsCredentialStorage(new NativeWindowsCredentialApi(() => fake.library));

    fake.state.failWith = ERROR_ACCESS_DENIED;
    await expect(storage.get(KEY)).rejects.toBeInstanceOf(SecureStorageUnavailableError);
    await expect(storage.set(KEY, TOKEN)).rejects.toBeInstanceOf(SecureStorageUnavailableError);
    await expect(storage.delete(KEY)).rejects.toBeInstanceOf(SecureStorageUnavailableError);
    expect(fake.entries.size).toBe(0);

    fake.state.failWith = 0;
    expect(await storage.get(KEY)).toBeNull();
    await storage.delete(KEY);
  });

  test("a library that cannot be loaded fails closed", async () => {
    const storage = new WindowsCredentialStorage(new NativeWindowsCredentialApi(() => {
      throw new Error("Cannot find advapi32.dll");
    }));
    await expect(storage.get(KEY)).rejects.toBeInstanceOf(SecureStorageUnavailableError);
    await expect(storage.set(KEY, TOKEN)).rejects.toBeInstanceOf(SecureStorageUnavailableError);
    await expect(storage.delete(KEY)).rejects.toBeInstanceOf(SecureStorageUnavailableError);
  });
});

describe("createSecureStorage platform choice", () => {
  test("picks the Credential Manager backend on win32 and keeps the other choices", () => {
    expect(createSecureStorage({ platform: "win32", windowsApi: fakeWindowsApi().api })).toBeInstanceOf(WindowsCredentialStorage);
    expect(createSecureStorage({ platform: "darwin" })).toBeInstanceOf(MacKeychainStorage);
    expect(createSecureStorage({ platform: "linux" })).toBeInstanceOf(LinuxSecretServiceStorage);
    expect(createSecureStorage({ platform: "freebsd" })).toBeInstanceOf(UnavailableSecureStorage);
  });

  test("uses the injected Windows API for the created backend", async () => {
    const fake = fakeWindowsApi();
    const storage = createSecureStorage({ platform: "win32", windowsApi: fake.api });
    await storage.set(KEY, TOKEN);
    expect(await storage.get(KEY)).toBe(TOKEN);
  });
});

describe("legacy token migration with the Windows backend", () => {
  const directories: string[] = [];
  afterEach(async () => {
    await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
  });

  async function legacySettingsFile(): Promise<string> {
    const directory = await mkdtemp(join(tmpdir(), "bloommd-secure-storage-"));
    directories.push(directory);
    const path = join(directory, "settings.json");
    await writeFile(path, JSON.stringify({ localDir: "/tmp/maps", remote: { url: "https://bloommd.app", accessToken: TOKEN } }));
    return path;
  }

  test("moves the token into the store and drops it from the settings file", async () => {
    const path = await legacySettingsFile();
    const fake = fakeWindowsApi();
    const storage = new WindowsCredentialStorage(fake.api);

    const migrated = await migrateLegacyRemote(await loadSettings(path), storage);
    await saveSettings(migrated.settings, path);

    const profile = migrated.settings.profiles?.[0];
    expect(migrated.migrated).toBe(true);
    expect(profile && await storage.get(profile.tokenRef)).toBe(TOKEN);
    expect(await readFile(path, "utf-8")).not.toContain(TOKEN);
  });

  test("leaves the legacy file untouched when the store is unavailable", async () => {
    const path = await legacySettingsFile();
    const before = await readFile(path, "utf-8");
    const fake = fakeWindowsApi();
    fake.state.failure = ERROR_ACCESS_DENIED;

    await expect(migrateLegacyRemote(await loadSettings(path), new WindowsCredentialStorage(fake.api)))
      .rejects.toBeInstanceOf(SecureStorageUnavailableError);
    expect(await readFile(path, "utf-8")).toBe(before);
  });
});
