/**
 * Where BloomMD Desktop listens for notes handed over by a second launch, the `bloommd` CLI and the
 * Obsidian plugin. The channel must belong to the current user, so another local account can never
 * squat on it and receive (or inject) file paths:
 *
 * - macOS: `$TMPDIR` is already per user.
 * - Linux: `$XDG_RUNTIME_DIR` (per user, mode 0700); without it a `bloommd-<uid>` directory in the
 *   temp dir that the app creates with mode 0700 and refuses to use when someone else owns it.
 * - Windows: named pipes share one namespace, so the pipe name carries a per-user key.
 *
 * The Obsidian plugin duplicates this in `plugins/obsidian/src/desktop-handoff.ts`;
 * `scripts/qa/desktop-handoff-contract.test.ts` keeps both in step.
 */

export const HANDOFF_SOCKET_NAME = "bloommd-desktop-handoff.sock";

export interface HandoffPathInput {
  platform: string;
  env: Record<string, string | undefined>;
  tmpdir: string;
  uid: number;
  username: string;
}

/** FNV-1a over the lower-cased user name: a stable per-user key without a crypto dependency. */
export function handoffUserKey(username: string): string {
  let hash = 0x811c9dc5;
  for (const char of username.toLowerCase()) {
    hash ^= char.codePointAt(0)!;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

const trimSlash = (path: string) => path.replace(/[\\/]+$/, "");

/** The private directory the app must create (mode 0700) before listening, or null when none is needed. */
export function handoffPrivateDir(input: HandoffPathInput): string | null {
  if (input.env.BLOOMMD_DESKTOP_HANDOFF_PATH?.trim()) return null;
  if (input.platform === "win32" || input.platform === "darwin") return null;
  const runtime = input.env.XDG_RUNTIME_DIR?.trim();
  if (runtime && runtime.startsWith("/")) return null;
  return `${trimSlash(input.tmpdir)}/bloommd-${input.uid}`;
}

export function desktopHandoffPath(input: HandoffPathInput): string {
  const override = input.env.BLOOMMD_DESKTOP_HANDOFF_PATH?.trim();
  if (override) return override;
  if (input.platform === "win32") return `\\\\.\\pipe\\bloommd-desktop-handoff-${handoffUserKey(input.username)}`;
  if (input.platform === "darwin") return `${trimSlash(input.tmpdir)}/${HANDOFF_SOCKET_NAME}`;
  const runtime = input.env.XDG_RUNTIME_DIR?.trim();
  if (runtime && runtime.startsWith("/")) return `${trimSlash(runtime)}/${HANDOFF_SOCKET_NAME}`;
  return `${handoffPrivateDir(input)}/${HANDOFF_SOCKET_NAME}`;
}
