import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export interface DesktopE2EOptions {
  enabled: boolean;
  localDir?: string;
  logPath?: string;
  statePath?: string;
}

export interface DesktopArgs {
  cliTargetArg?: string;
  e2e: DesktopE2EOptions;
}

export interface DesktopE2EState {
  source: string;
  selectedNodeId?: string | null;
  selectedNodeVisible?: boolean;
  localDir?: string;
  activeFile?: string | null;
  emptyWorkspace?: boolean;
  documentTitle?: string;
  nodeCount?: number;
  referenceEdgeCount?: number;
  workspaceMode?: boolean;
  mode?: "local" | "remote";
  timestamp?: string;
}

const optionValueFlags = new Set(["--e2e-dir", "--e2e-log", "--e2e-state"]);

function resolveOptionalPath(value: string | undefined, cwd: string): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? resolve(cwd, trimmed) : undefined;
}

function envEnabled(value: string | undefined): boolean {
  return value === "1" || value?.toLowerCase() === "true";
}

export function parseDesktopArgs(argv: string[], env: Record<string, string | undefined>, cwd: string): DesktopArgs {
  // BLOOMMD_OPEN_TARGET is how Obsidian starts the app with a note: Electrobun's macOS launcher does
  // not forward command line arguments, but the environment reaches the app.
  let cliTargetArg = env.BLOOMMD_OPEN_TARGET?.trim() || env.BLOOMMD_E2E_TARGET?.trim() || undefined;
  let e2eEnabled = envEnabled(env.BLOOMMD_E2E);
  let localDir = resolveOptionalPath(env.BLOOMMD_E2E_DIR, cwd);
  let logPath = resolveOptionalPath(env.BLOOMMD_E2E_LOG, cwd);
  let statePath = resolveOptionalPath(env.BLOOMMD_E2E_STATE, cwd);

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg) continue;

    if (arg === "--e2e") {
      e2eEnabled = true;
      continue;
    }

    if (optionValueFlags.has(arg)) {
      const value = argv[index + 1];
      index += 1;
      if (arg === "--e2e-dir") localDir = resolveOptionalPath(value, cwd);
      if (arg === "--e2e-log") logPath = resolveOptionalPath(value, cwd);
      if (arg === "--e2e-state") statePath = resolveOptionalPath(value, cwd);
      continue;
    }

    if (arg.startsWith("--e2e-dir=")) {
      localDir = resolveOptionalPath(arg.slice("--e2e-dir=".length), cwd);
      continue;
    }
    if (arg.startsWith("--e2e-log=")) {
      logPath = resolveOptionalPath(arg.slice("--e2e-log=".length), cwd);
      continue;
    }
    if (arg.startsWith("--e2e-state=")) {
      statePath = resolveOptionalPath(arg.slice("--e2e-state=".length), cwd);
      continue;
    }

    if (arg.startsWith("-")) continue;
    cliTargetArg ??= arg;
  }

  const e2e = {
    enabled: e2eEnabled || Boolean(localDir || logPath || statePath),
    localDir,
    logPath,
    statePath,
  };

  return { cliTargetArg, e2e };
}

export async function appendDesktopE2EEvent(
  options: DesktopE2EOptions,
  event: string,
  payload: Record<string, unknown> = {},
): Promise<void> {
  if (!options.enabled || !options.logPath) return;
  const line = JSON.stringify({ timestamp: new Date().toISOString(), event, ...payload });
  await mkdir(dirname(options.logPath), { recursive: true });
  await appendFile(options.logPath, `${line}\n`, "utf8");
}

export async function writeDesktopE2EState(options: DesktopE2EOptions, state: DesktopE2EState): Promise<void> {
  if (!options.enabled || !options.statePath) return;
  await mkdir(dirname(options.statePath), { recursive: true });
  await writeFile(
    options.statePath,
    JSON.stringify({ ...state, timestamp: new Date().toISOString() }, null, 2),
    "utf8",
  );
}
