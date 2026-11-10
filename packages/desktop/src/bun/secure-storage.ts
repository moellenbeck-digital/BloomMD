import { platform } from "node:os";
import { dlopen, ptr, toArrayBuffer, type Pointer } from "bun:ffi";

export interface SecureStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

type CommandRunner = (command: string[], input?: string) => Promise<CommandResult>;

export const SECURE_STORAGE_UNAVAILABLE = "SECURE_STORAGE_UNAVAILABLE" as const;

/** Raised when the platform's secure credential service cannot be reached. */
export class SecureStorageUnavailableError extends Error {
  readonly code = SECURE_STORAGE_UNAVAILABLE;

  constructor(message = "The platform secure credential service is unavailable or locked.") {
    super(message);
    this.name = "SecureStorageUnavailableError";
  }
}

function utf8Hex(value: string): string {
  return Array.from(new TextEncoder().encode(value), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function runCommand(command: string[], input?: string): Promise<CommandResult> {
  const child = Bun.spawn(command, { stdin: "pipe", stdout: "pipe", stderr: "pipe" });
  if (input !== undefined) {
    child.stdin.write(`${input}\n`);
    child.stdin.end();
  } else {
    child.stdin.end();
  }
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { exitCode, stdout, stderr };
}

function assertKey(value: string): void {
  if (!/^[A-Za-z0-9:._-]{1,200}$/.test(value)) throw new Error("Invalid secure storage key.");
}

/** macOS Keychain-backed storage. Values are never written to a file or included in logs. */
export class MacKeychainStorage implements SecureStorage {
  private readonly service = "io.moellenbeck-digital.bloommd.connection-profile";
  private readonly account = process.env.USER || "BloomMD";
  private readonly run: CommandRunner;

  constructor(run: CommandRunner = runCommand) {
    this.run = run;
  }

  async get(key: string): Promise<string | null> {
    assertKey(key);
    const result = await this.run([
      "/usr/bin/security", "find-generic-password", "-a", this.account,
      "-s", `${this.service}.${key}`, "-w",
    ]);
    if (result.exitCode !== 0) return null;
    return result.stdout.trim() || null;
  }

  async set(key: string, value: string): Promise<void> {
    assertKey(key);
    if (!value.startsWith("bloom_pat_")) throw new Error("A personal BloomMD access token is required.");
    // `security -w` prompts on a TTY and does not consume a piped value reliably. `-X` accepts
    // password data as hex, so the token never appears in plaintext in process arguments/logs.
    const result = await this.run([
      "/usr/bin/security", "add-generic-password", "-a", this.account,
      "-s", `${this.service}.${key}`, "-U", "-X", utf8Hex(value),
    ]);
    if (result.exitCode !== 0) throw new Error("The macOS Keychain could not store the access token.");
  }

  async delete(key: string): Promise<void> {
    assertKey(key);
    const result = await this.run([
      "/usr/bin/security", "delete-generic-password", "-a", this.account,
      "-s", `${this.service}.${key}`,
    ]);
    if (result.exitCode !== 0 && !result.stderr.includes("SecKeychainItemNotFound")) {
      throw new Error("The macOS Keychain could not remove the access token.");
    }
  }
}

function secretServiceDiagnostic(result: CommandResult): string {
  return `${result.stderr}\n${result.stdout}`.trim().toLowerCase();
}

function isSecretServiceUnavailable(result: CommandResult): boolean {
  const diagnostic = secretServiceDiagnostic(result);
  return [
    "cannot autolaunch dbus",
    "org.freedesktop.secrets",
    "secret service",
    "couldn't communicate",
    "could not connect",
    "connection refused",
    "serviceunknown",
    "no such file or directory",
    "collection is locked",
    "the collection is locked",
    "locked collection",
    "user interaction is not allowed",
  ].some((marker) => diagnostic.includes(marker));
}

function isMissingSecret(result: CommandResult): boolean {
  const diagnostic = secretServiceDiagnostic(result);
  return diagnostic.length === 0 || [
    "no secret found",
    "no such secret",
    "secret not found",
    "no such item",
    "item not found",
    "no matching items",
  ].some((marker) => diagnostic.includes(marker));
}

/** Linux Secret Service-backed storage via the standard libsecret CLI. */
export class LinuxSecretServiceStorage implements SecureStorage {
  private readonly service = "io.moellenbeck-digital.bloommd.connection-profile";
  private readonly account = process.env.USER || "BloomMD";
  private readonly secretTool = process.env.BLOOMMD_SECRET_TOOL_PATH || "/usr/bin/secret-tool";
  private readonly run: CommandRunner;

  constructor(run: CommandRunner = runCommand) {
    this.run = run;
  }

  private attributes(key: string): string[] {
    assertKey(key);
    return ["service", this.service, "account", this.account, "profile", key];
  }

  private unavailable(): never {
    throw new SecureStorageUnavailableError(
      "The Linux Secret Service is unavailable or locked. Start or unlock a Secret Service provider and try again.",
    );
  }

  async get(key: string): Promise<string | null> {
    const result = await this.run([this.secretTool, "lookup", ...this.attributes(key)]).catch(() => this.unavailable());
    if (result.exitCode === 0) return result.stdout.trim() || null;
    if (isSecretServiceUnavailable(result)) return this.unavailable();
    if (isMissingSecret(result)) return null;
    return this.unavailable();
  }

  async set(key: string, value: string): Promise<void> {
    assertKey(key);
    if (!value.startsWith("bloom_pat_")) throw new Error("A personal BloomMD access token is required.");
    const result = await this.run([
      this.secretTool,
      "store",
      "--label=BloomMD connection profile",
      ...this.attributes(key),
    ], value).catch(() => this.unavailable());
    if (result.exitCode !== 0) return this.unavailable();
  }

  async delete(key: string): Promise<void> {
    const result = await this.run([this.secretTool, "clear", ...this.attributes(key)]).catch(() => this.unavailable());
    if (result.exitCode === 0) return;
    if (isSecretServiceUnavailable(result)) return this.unavailable();
    if (isMissingSecret(result)) return;
    return this.unavailable();
  }
}

// Win32 constants (wincred.h / winerror.h).
const CRED_TYPE_GENERIC = 1;
const CRED_PERSIST_LOCAL_MACHINE = 2;
const CRED_MAX_CREDENTIAL_BLOB_SIZE = 5 * 512;
const ERROR_GEN_FAILURE = 31;
/** `CredReadW`/`CredDeleteW` report a missing entry with this code. */
export const ERROR_NOT_FOUND = 1168;

/**
 * Byte layout of CREDENTIALW with 8-byte pointers (x64 and arm64 Windows):
 * Flags@0 Type@4 TargetName@8 Comment@16 LastWritten@24 CredentialBlobSize@32
 * CredentialBlob@40 Persist@48 AttributeCount@52 Attributes@56 TargetAlias@64 UserName@72.
 */
const CREDENTIALW_SIZE = 80;

/** The advapi32/kernel32 calls the Credential Manager backend needs, with their native signatures. */
export interface WindowsCredentialLibrary {
  CredWriteW(credential: Uint8Array, flags: number): number;
  CredReadW(targetName: Uint8Array, type: number, flags: number, credential: BigUint64Array): number;
  CredDeleteW(targetName: Uint8Array, type: number, flags: number): number;
  CredFree(buffer: Pointer): void;
  GetLastError(): number;
}

/** Credential Manager operations. A status of 0 means success, anything else is the Win32 error code. */
export interface WindowsCredentialApi {
  write(target: string, userName: string, secret: string): number;
  read(target: string): { status: number; secret?: string };
  delete(target: string): number;
}

function wideString(value: string): Buffer {
  return Buffer.from(`${value}\0`, "utf16le");
}

function loadWindowsCredentialLibrary(): WindowsCredentialLibrary {
  if (process.arch !== "x64" && process.arch !== "arm64") {
    throw new Error("The Windows Credential Manager backend requires a 64-bit process.");
  }
  const advapi = dlopen("advapi32.dll", {
    CredWriteW: { args: ["ptr", "u32"], returns: "i32" },
    CredReadW: { args: ["ptr", "u32", "u32", "ptr"], returns: "i32" },
    CredDeleteW: { args: ["ptr", "u32", "u32"], returns: "i32" },
    CredFree: { args: ["ptr"], returns: "void" },
  });
  const kernel = dlopen("kernel32.dll", { GetLastError: { args: [], returns: "u32" } });
  return {
    CredWriteW: (credential, flags) => advapi.symbols.CredWriteW(credential, flags),
    CredReadW: (targetName, type, flags, credential) => advapi.symbols.CredReadW(targetName, type, flags, credential),
    CredDeleteW: (targetName, type, flags) => advapi.symbols.CredDeleteW(targetName, type, flags),
    CredFree: (buffer) => { advapi.symbols.CredFree(buffer); },
    GetLastError: () => kernel.symbols.GetLastError(),
  };
}

/**
 * Credential Manager access through in-process FFI: the token only lives in this process's memory
 * and is handed to advapi32 as a CREDENTIALW blob, so it never appears in argv, environment or a file.
 * Why this over DPAPI: DPAPI would need our own blob file (a location to protect and migrate) or a
 * PowerShell child process, and the Credential Manager is the platform counterpart of Keychain and
 * Secret Service. `bun:ffi` ships with the Bun runtime Electrobun embeds, so no native addon is needed.
 * `GetLastError` is read right after the failing call; if the runtime clobbered it in between, the
 * worst case is a missing entry reported as unavailable (fails closed) or the reverse for `get`.
 * The blob is UTF-16LE, the encoding Windows tools (cmdkey, the Credential Manager UI) use for secrets.
 */
export class NativeWindowsCredentialApi implements WindowsCredentialApi {
  private library?: WindowsCredentialLibrary;
  private readonly load: () => WindowsCredentialLibrary;

  constructor(load: () => WindowsCredentialLibrary = loadWindowsCredentialLibrary) {
    this.load = load;
  }

  private native(): WindowsCredentialLibrary {
    this.library ??= this.load();
    return this.library;
  }

  write(target: string, userName: string, secret: string): number {
    const library = this.native();
    const blob = Buffer.from(secret, "utf16le");
    try {
      const targetName = wideString(target);
      const user = wideString(userName);
      const credential = Buffer.alloc(CREDENTIALW_SIZE);
      credential.writeUInt32LE(CRED_TYPE_GENERIC, 4);
      credential.writeBigUInt64LE(BigInt(ptr(targetName)), 8);
      credential.writeUInt32LE(blob.length, 32);
      credential.writeBigUInt64LE(BigInt(ptr(blob)), 40);
      credential.writeUInt32LE(CRED_PERSIST_LOCAL_MACHINE, 48);
      credential.writeBigUInt64LE(BigInt(ptr(user)), 72);
      if (library.CredWriteW(credential, 0) !== 0) return 0;
      return library.GetLastError() || ERROR_GEN_FAILURE;
    } finally {
      blob.fill(0);
    }
  }

  read(target: string): { status: number; secret?: string } {
    const library = this.native();
    const out = new BigUint64Array(1);
    if (library.CredReadW(wideString(target), CRED_TYPE_GENERIC, 0, out) === 0) {
      return { status: library.GetLastError() || ERROR_GEN_FAILURE };
    }
    const credential = Number(out[0]) as Pointer;
    try {
      const header = new DataView(toArrayBuffer(credential, 0, CREDENTIALW_SIZE));
      const size = header.getUint32(32, true);
      const blobPointer = Number(header.getBigUint64(40, true)) as Pointer;
      if (size === 0 || blobPointer === 0) return { status: 0, secret: "" };
      return { status: 0, secret: Buffer.from(toArrayBuffer(blobPointer, 0, size)).toString("utf16le") };
    } finally {
      library.CredFree(credential);
    }
  }

  delete(target: string): number {
    const library = this.native();
    if (library.CredDeleteW(wideString(target), CRED_TYPE_GENERIC, 0) !== 0) return 0;
    return library.GetLastError() || ERROR_GEN_FAILURE;
  }
}

/**
 * Windows Credential Manager-backed storage (the counterpart of Keychain and Secret Service).
 * Entries are generic credentials in the signed-in user's own vault (`CRED_PERSIST_LOCAL_MACHINE`
 * persists across logons on this machine only), so they are separate per Windows user and per profile key.
 */
export class WindowsCredentialStorage implements SecureStorage {
  private readonly service = "io.moellenbeck-digital.bloommd.connection-profile";
  private readonly account = process.env.USERNAME || "BloomMD";
  private readonly api: WindowsCredentialApi;

  constructor(api: WindowsCredentialApi = new NativeWindowsCredentialApi()) {
    this.api = api;
  }

  private target(key: string): string {
    assertKey(key);
    return `${this.service}.${key}`;
  }

  /** Fixed message on purpose: neither the token nor the native error text is ever included. */
  private unavailable(status?: number): never {
    const code = status ? ` (Win32 error ${status})` : "";
    throw new SecureStorageUnavailableError(
      `The Windows Credential Manager is unavailable or denied access${code}. Sign in to Windows normally and try again.`,
    );
  }

  private call<T>(operation: () => T): T {
    try {
      return operation();
    } catch {
      return this.unavailable();
    }
  }

  async get(key: string): Promise<string | null> {
    const target = this.target(key);
    const result = this.call(() => this.api.read(target));
    if (result.status === 0) return result.secret || null;
    if (result.status === ERROR_NOT_FOUND) return null;
    return this.unavailable(result.status);
  }

  async set(key: string, value: string): Promise<void> {
    const target = this.target(key);
    if (!value.startsWith("bloom_pat_")) throw new Error("A personal BloomMD access token is required.");
    if (value.length * 2 > CRED_MAX_CREDENTIAL_BLOB_SIZE) {
      throw new Error("The access token is too long for the Windows Credential Manager.");
    }
    const status = this.call(() => this.api.write(target, this.account, value));
    if (status !== 0) this.unavailable(status);
  }

  async delete(key: string): Promise<void> {
    const target = this.target(key);
    const status = this.call(() => this.api.delete(target));
    if (status !== 0 && status !== ERROR_NOT_FOUND) this.unavailable(status);
  }
}

/** Unsupported platforms fail closed instead of storing a plaintext fallback. */
export class UnavailableSecureStorage implements SecureStorage {
  async get(_key: string): Promise<string | null> { return null; }
  async set(_key: string, _value: string): Promise<void> {
    throw new SecureStorageUnavailableError("Secure token storage is not available on this platform.");
  }
  async delete(_key: string): Promise<void> { return; }
}

export function createSecureStorage(
  options: { platform?: string; windowsApi?: WindowsCredentialApi } = {},
): SecureStorage {
  const current = options.platform ?? platform();
  if (current === "darwin") return new MacKeychainStorage();
  if (current === "linux") return new LinuxSecretServiceStorage();
  if (current === "win32") return new WindowsCredentialStorage(options.windowsApi);
  return new UnavailableSecureStorage();
}
