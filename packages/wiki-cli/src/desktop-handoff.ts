import { connect } from "node:net";
import { tmpdir, userInfo } from "node:os";

const HANDOFF_SOCKET_NAME = "bloommd-desktop-handoff.sock";

export interface HandoffPathInput {
  platform: string;
  env: Record<string, string | undefined>;
  tmpdir: string;
  uid: number;
  username: string;
}

function handoffUserKey(username: string): string {
  let hash = 0x811c9dc5;
  for (const char of username.toLowerCase()) {
    hash ^= char.codePointAt(0)!;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/**
 * Mirrors `packages/desktop/src/bun/handoff-path.ts`: a per-user socket (macOS `$TMPDIR`, Linux
 * `$XDG_RUNTIME_DIR` or `bloommd-<uid>`) or a per-user named pipe on Windows. The contract test in
 * `scripts/qa/desktop-handoff-contract.test.ts` keeps the copies in step.
 */
export function handoffPathFor(input: HandoffPathInput): string {
  const override = input.env.BLOOMMD_DESKTOP_HANDOFF_PATH?.trim();
  if (override) return override;
  const trimSlash = (path: string) => path.replace(/[\\/]+$/, "");
  if (input.platform === "win32") return `\\\\.\\pipe\\bloommd-desktop-handoff-${handoffUserKey(input.username)}`;
  if (input.platform === "darwin") return `${trimSlash(input.tmpdir)}/${HANDOFF_SOCKET_NAME}`;
  const runtime = input.env.XDG_RUNTIME_DIR?.trim();
  if (runtime && runtime.startsWith("/")) return `${trimSlash(runtime)}/${HANDOFF_SOCKET_NAME}`;
  return `${trimSlash(input.tmpdir)}/bloommd-${input.uid}/${HANDOFF_SOCKET_NAME}`;
}

function currentUsername(): string {
  try {
    return userInfo().username;
  } catch {
    return process.env.USERNAME ?? process.env.USER ?? "";
  }
}

export function desktopHandoffPath(): string {
  return handoffPathFor({
    platform: process.platform,
    env: process.env,
    tmpdir: tmpdir(),
    uid: typeof process.getuid === "function" ? process.getuid() : -1,
    username: currentUsername(),
  });
}

/** Returns true only when a running BloomMD desktop process accepted the target. */
export async function forwardToRunningDesktop(target: string): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect(desktopHandoffPath());
    let settled = false;
    const finish = (result: boolean) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };
    socket.once("error", () => finish(false));
    socket.once("connect", () => {
      socket.end(`${JSON.stringify({ type: "open", target })}\n`, () => finish(true));
    });
  });
}
