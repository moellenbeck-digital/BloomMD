import { chmod, lstat, mkdir, open, readFile, unlink, type FileHandle } from "node:fs/promises";
import { connect, createServer, type Server } from "node:net";
import { isExternalNodeId } from "./external-file";

interface HandoffMessage {
  type: "open";
  target: string;
  /** Node to select after opening; only well-formed BloomMD node ids are kept. */
  nodeId?: string;
}

interface ProbeMessage {
  type: "probe";
}

export interface DesktopInstanceHandoff {
  readonly isPrimary: boolean;
  forward(target: string, nodeId?: string | null): Promise<boolean>;
  close(): Promise<void>;
}

function parseMessage(raw: string): HandoffMessage | ProbeMessage | null {
  try {
    const value = JSON.parse(raw) as Partial<HandoffMessage | ProbeMessage>;
    if (value.type === "probe") return { type: "probe" };
    if (value.type !== "open" || typeof value.target !== "string" || !value.target) return null;
    const nodeId = (value as Partial<HandoffMessage>).nodeId;
    return isExternalNodeId(nodeId) ? { type: "open", target: value.target, nodeId } : { type: "open", target: value.target };
  } catch {
    return null;
  }
}

async function sendOnce(path: string, message: HandoffMessage | ProbeMessage): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect(path);
    let settled = false;
    const finish = (result: boolean) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };
    socket.once("error", () => finish(false));
    socket.once("connect", () => {
      socket.end(`${JSON.stringify(message)}\n`, () => finish(true));
    });
  });
}

async function send(path: string, message: HandoffMessage | ProbeMessage, retries = 1): Promise<boolean> {
  for (let attempt = 0; attempt < retries; attempt += 1) {
    if (await sendOnce(path, message)) return true;
    if (attempt + 1 < retries) await Bun.sleep(25);
  }
  return false;
}

function lockPathFor(path: string): string | null {
  return process.platform === "win32" ? null : `${path}.lock`;
}

async function acquireLock(lockPath: string): Promise<FileHandle | null> {
  try {
    const lock = await open(lockPath, "wx");
    try {
      await lock.writeFile(`${process.pid}\n`, "utf8");
      return lock;
    } catch (error) {
      await lock.close();
      await unlink(lockPath).catch(() => undefined);
      throw error;
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return null;
    throw error;
  }
}

async function lockOwnerIsAlive(lockPath: string): Promise<boolean> {
  try {
    const rawPid = (await readFile(lockPath, "utf8")).trim();
    const pid = Number.parseInt(rawPid, 10);
    if (!Number.isInteger(pid) || pid <= 0) return false;
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      // EPERM means the pid now belongs to another user: not a BloomMD instance of ours.
      return false;
    }
  } catch (error) {
    // A lock another account owns (unreadable) is not ours either.
    const code = (error as NodeJS.ErrnoException).code;
    return code !== "ENOENT" && code !== "EACCES" && code !== "EPERM";
  }
}

/**
 * Creates the per-user directory that holds the socket when Linux has no `$XDG_RUNTIME_DIR`, and
 * refuses one another account created or opened up first: whoever owns it could read or replace
 * the socket.
 */
export async function ensurePrivateDir(dir: string): Promise<void> {
  await mkdir(dir, { mode: 0o700 }).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "EEXIST") throw error;
  });
  const info = await lstat(dir);
  const uid = typeof process.getuid === "function" ? process.getuid() : null;
  if (!info.isDirectory() || info.isSymbolicLink() || (uid !== null && info.uid !== uid)) {
    throw new Error(`BloomMD instance handoff directory ${dir} is not owned by this user.`);
  }
  if ((info.mode & 0o077) !== 0) await chmod(dir, 0o700);
}

async function releaseLock(lockPath: string, lock: FileHandle): Promise<void> {
  await lock.close();
  await unlink(lockPath).catch(() => undefined);
}

async function listen(server: Server, path: string): Promise<"listening" | "occupied"> {
  return new Promise((resolve, reject) => {
    const onError = (error: NodeJS.ErrnoException) => {
      cleanup();
      if (error.code === "EADDRINUSE") resolve("occupied");
      else reject(error);
    };
    const onListening = () => {
      cleanup();
      resolve("listening");
    };
    const cleanup = () => {
      server.off("error", onError);
      server.off("listening", onListening);
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(path);
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

/**
 * Bridges a deep-link opened in a second Electrobun process to the already-running desktop app.
 * Electrobun currently has no cross-platform single-instance lock, so this user-local socket is
 * deliberately small: it accepts only an absolute target supplied by the app's own URL parser.
 */
export async function createDesktopInstanceHandoff(
  path: string,
  onTarget: (target: string, nodeId: string | null) => void,
  options: { privateDir?: string | null } = {},
): Promise<DesktopInstanceHandoff> {
  if (options.privateDir) await ensurePrivateDir(options.privateDir);
  const lockPath = lockPathFor(path);
  let lock: FileHandle | null = null;
  const server = createServer((socket) => {
    let buffer = "";
    socket.setEncoding("utf8");
    socket.on("data", (chunk: string) => {
      buffer += chunk;
      const newline = buffer.indexOf("\n");
      if (newline === -1) return;
      const message = parseMessage(buffer.slice(0, newline));
      if (message?.type === "open") onTarget(message.target, message.nodeId ?? null);
      socket.end();
    });
  });

  const secondary = (): DesktopInstanceHandoff => ({
    isPrimary: false,
    forward: (target, nodeId) => send(path, nodeId ? { type: "open", target, nodeId } : { type: "open", target }, 40),
    close: async () => undefined,
  });

  if (lockPath) {
    // Bun replaces an existing Unix socket when a second server listens on the same path. The
    // exclusive lock is the actual single-instance gate; the socket remains the message channel.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      lock = await acquireLock(lockPath);
      if (lock) break;
      if (await send(path, { type: "probe" }, 4)) return secondary();
      if (await lockOwnerIsAlive(lockPath)) return secondary();
      await unlink(lockPath).catch(() => undefined);
    }
  }

  try {
    let listening = await listen(server, path);
    if (listening === "occupied") {
      // A reachable owner is the primary instance. If it is a stale Unix socket, remove it once and
      // claim the path instead; Windows named pipes do not exist as filesystem entries.
      if (await send(path, { type: "probe" }, 4)) {
        if (lockPath && lock) await releaseLock(lockPath, lock);
        return secondary();
      }
      if (process.platform !== "win32") await unlink(path).catch(() => undefined);
      listening = await listen(server, path);
    }
    if (listening !== "listening") throw new Error("BloomMD instance handoff could not acquire its local socket.");
  } catch (error) {
    if (lockPath && lock) await releaseLock(lockPath, lock);
    throw error;
  }

  return {
    isPrimary: true,
    forward: async () => false,
    close: async () => {
      await closeServer(server);
      if (process.platform !== "win32") await unlink(path).catch(() => undefined);
      if (lockPath && lock) await releaseLock(lockPath, lock);
    },
  };
}
