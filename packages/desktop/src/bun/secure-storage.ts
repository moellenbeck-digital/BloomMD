import { platform } from "node:os";

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

/** Unsupported platforms fail closed instead of storing a plaintext fallback. */
export class UnavailableSecureStorage implements SecureStorage {
  async get(_key: string): Promise<string | null> { return null; }
  async set(_key: string, _value: string): Promise<void> {
    throw new SecureStorageUnavailableError("Secure token storage is not available on this platform.");
  }
  async delete(_key: string): Promise<void> { return; }
}

export function createSecureStorage(): SecureStorage {
  if (platform() === "darwin") return new MacKeychainStorage();
  if (platform() === "linux") return new LinuxSecretServiceStorage();
  return new UnavailableSecureStorage();
}
