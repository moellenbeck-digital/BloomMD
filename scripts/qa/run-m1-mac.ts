import { access, mkdir, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { homedir, platform } from "node:os";
import { join, relative, resolve } from "node:path";
import {
  type AutomationMetadata,
  isMacRelevant,
  type MatrixCase,
  type MatrixStatus,
  type PlanGate,
  readM1PlanGates,
  readUiMatrix,
  summarizeMatrix,
} from "./parse-ui-matrix";

type GateStatus = "pass" | "fail" | "skipped";
type CaseResultStatus = "pass" | "partial" | "fail" | "manual" | "gap" | "skipped";
type AutomationDebtSeverity = "P0" | "P1" | "P2";

interface RunnerOptions {
  dryRun: boolean;
  enforceTargets: boolean;
  generateHtml: boolean;
  includeInstall: boolean;
  includeReleaseCheck: boolean;
  keepSettings: boolean;
  only: Set<string> | null;
  reportRoot: string;
  skipNative: boolean;
  targets: QaTargets;
}

interface QaTargets {
  autoMin: number;
  autoMax: number;
  gapMax: number;
  manualMax: number;
  hybridMin: number;
  hybridMax: number;
}

interface AutoGate {
  id: string;
  label: string;
  command: string;
  sourceCommand: string;
  enabledByDefault: boolean;
  macOnly?: boolean;
  skipReason?: string;
}

interface GateResult {
  id: string;
  label: string;
  command: string;
  sourceCommand: string;
  status: GateStatus;
  exitCode: number | null;
  durationMs: number;
  logPath: string;
  reason?: string;
}

interface NativeSmokeResult {
  status: GateStatus;
  durationMs: number;
  checks: GateResult[];
  screenshots: string[];
  reason?: string;
}

interface CaseResult {
  id: string;
  status: CaseResultStatus;
  matrixStatus: MatrixStatus;
  section: string;
  functionName: string;
  macRelevant: boolean;
  automation: AutomationMetadata;
  coverage: string[];
  evidence: string[];
  missingRunnerGates: string[];
  reason: string;
}

interface AutomationDebtItem {
  id: string;
  severity: AutomationDebtSeverity;
  category: string;
  matrixStatus: MatrixStatus;
  resultStatus: CaseResultStatus;
  section: string;
  functionName: string;
  issue: string;
  automationTarget: string;
  testType: string;
  missingRunnerGates: string[];
  manualReason: string;
  reason: string;
}

interface AutomationDebtSummary {
  total: number;
  bySeverity: Record<AutomationDebtSeverity, number>;
  byCategory: Record<string, number>;
  target: {
    autoMin: number;
    autoMax: number;
    gapMax: number;
    manualMax: number;
    hybridMin: number;
    hybridMax: number;
  };
  targetViolations: string[];
  items: AutomationDebtItem[];
}

interface QaReport {
  startedAt: string;
  completedAt: string;
  platform: NodeJS.Platform;
  dryRun: boolean;
  commitSha: string;
  reportDir: string;
  matrix: {
    total: number;
    macRelevant: number;
    byStatus: Record<MatrixStatus, number>;
  };
  planGates: PlanGate[];
  gateResults: GateResult[];
  nativeSmoke: NativeSmokeResult;
  caseResults: CaseResult[];
  automationDebt: AutomationDebtSummary;
}

interface DesktopSettings {
  localDir?: string;
  activeFile?: string;
  mode?: string;
}

interface DesktopE2EState {
  source?: string;
  localDir?: string;
  activeFile?: string | null;
  emptyWorkspace?: boolean;
  documentTitle?: string;
  nodeCount?: number;
  referenceEdgeCount?: number;
  workspaceMode?: boolean;
  mode?: string;
  timestamp?: string;
}

interface ExpectedDesktopE2EState {
  localDir?: string;
  activeFile?: string | null;
  emptyWorkspace?: boolean;
  documentTitle?: string;
  minNodeCount?: number;
  minReferenceEdgeCount?: number;
  workspaceMode?: boolean;
}

const repoRoot = resolve(import.meta.dir, "../..");
const desktopSettingsPath = join(homedir(), ".bloommd-desktop.json");

const defaultQaTargets: QaTargets = {
  autoMin: 75,
  autoMax: 85,
  gapMax: 0,
  manualMax: 12,
  hybridMin: 10,
  hybridMax: 18,
};

const releaseGates: AutoGate[] = [
  {
    id: "install",
    label: "Install dependencies with frozen lockfile",
    command: "bun install --frozen-lockfile",
    sourceCommand: "bun install --frozen-lockfile",
    enabledByDefault: false,
    skipReason: "Opt-in via --with-install, because it can change local install state.",
  },
  {
    id: "typecheck",
    label: "Workspace TypeScript",
    command: "bun run typecheck",
    sourceCommand: "bun run typecheck",
    enabledByDefault: true,
  },
  {
    id: "test",
    label: "Workspace unit and integration tests",
    command: "bun run test",
    sourceCommand: "bun run test",
    enabledByDefault: true,
  },
  {
    id: "build",
    label: "Workspace build",
    command: "bun run build",
    sourceCommand: "bun run build",
    enabledByDefault: true,
  },
  {
    id: "release-artifacts",
    label: "CLI and sync release binaries",
    command: "bun run build:release-artifacts",
    sourceCommand: "bun run build:release-artifacts",
    enabledByDefault: true,
  },
  {
    id: "web-e2e",
    label: "Product app Playwright E2E",
    command: "bun run test:e2e",
    sourceCommand: "bun run test:e2e",
    enabledByDefault: true,
  },
  {
    id: "marketing-e2e",
    label: "Marketing Playwright E2E",
    command: "bun run --cwd apps/marketing test:e2e",
    sourceCommand: "bun run --cwd apps/marketing test:e2e",
    enabledByDefault: true,
  },
  {
    id: "beta-e2e",
    label: "Closed beta gate E2E",
    command: "bun run --cwd apps/app test:e2e:beta",
    sourceCommand: "bun run --cwd apps/app test:e2e:beta",
    enabledByDefault: true,
  },
  {
    id: "wiki-e2e",
    label: "OKF / llm-wiki E2E",
    command: "bun run --cwd apps/app test:e2e:wiki",
    sourceCommand: "bun run --cwd apps/app test:e2e:wiki",
    enabledByDefault: true,
  },
  {
    id: "collaboration-e2e",
    label: "Two-client collaboration E2E",
    command: "bun run --cwd apps/app test:e2e:collaboration",
    sourceCommand: "bun run --cwd apps/app test:e2e:collaboration",
    enabledByDefault: true,
  },
  {
    id: "visual-regression",
    label: "Web visual regression baselines",
    command: "bun run --cwd apps/app test:e2e:visual",
    sourceCommand: "bun run --cwd apps/app test:e2e:visual",
    enabledByDefault: true,
  },
  {
    id: "release-check",
    label: "Hosted beta release config",
    command: "bun run --cwd apps/app release:check && bun run --cwd apps/marketing release:check",
    sourceCommand: "bun run --cwd apps/app release:check && bun run --cwd apps/marketing release:check",
    enabledByDefault: false,
    skipReason: "Opt-in via --with-release-check, because it requires production-like env vars.",
  },
  {
    id: "audit",
    label: "Dependency security audit",
    command: "bun audit",
    sourceCommand: "bun audit",
    enabledByDefault: true,
  },
  {
    id: "desktop-typecheck",
    label: "Desktop TypeScript",
    command: "bun run --cwd packages/desktop typecheck",
    sourceCommand: "bun run --cwd packages/desktop typecheck",
    enabledByDefault: true,
    macOnly: true,
  },
  {
    id: "desktop-test",
    label: "Desktop helper tests",
    command: "bun run --cwd packages/desktop test",
    sourceCommand: "bun run --cwd packages/desktop test",
    enabledByDefault: true,
    macOnly: true,
  },
  {
    id: "desktop-renderer",
    label: "Desktop renderer build",
    command: "bun run --cwd packages/desktop build:renderer",
    sourceCommand: "bun run --cwd packages/desktop build:renderer",
    enabledByDefault: true,
    macOnly: true,
  },
  {
    id: "desktop-build-stable",
    label: "Stable macOS desktop artifact",
    command: "bun run build:desktop-macos",
    sourceCommand: "bun run build:desktop-macos",
    enabledByDefault: true,
    macOnly: true,
  },
  {
    id: "dmg-verify",
    label: "Verify stable macOS DMG",
    command: "bun run verify:desktop-macos:dmg",
    sourceCommand: "bun run verify:desktop-macos:dmg",
    enabledByDefault: true,
    macOnly: true,
  },
  {
    id: "desktop-codesign-verify",
    label: "Verify stable macOS app bundle signature",
    command: "bun run verify:desktop-macos:codesign",
    sourceCommand: "bun run verify:desktop-macos:codesign",
    enabledByDefault: true,
    macOnly: true,
  },
];

const syntheticAutomationGates = new Set(["browser-fs-mock", "desktop-e2e"]);
const futureAutomationGates = new Set(["drag-e2e"]);

function usage(): string {
  return [
    "Usage: bun run qa:m1:mac -- [options]",
    "",
    "Options:",
    "  --dry-run                 Parse docs and write a report without executing gates",
    "  --enforce-targets         Exit non-zero when configured QA target counts are missed",
    "  --html                    Also write report.html for local review",
    "  --skip-native             Skip native macOS app smoke",
    "  --with-install            Include bun install --frozen-lockfile",
    "  --with-release-check      Include hosted release config gate",
    "  --keep-settings           Do not restore ~/.bloommd-desktop.json after native smoke",
    "  --only <ids>              Run comma-separated gate ids, e.g. desktop-test,native-smoke",
    "  --report-root <path>      Override .qa/m1-mac",
    "  --target-auto-min <n>     Default 75",
    "  --target-auto-max <n>     Default 85",
    "  --target-gap-max <n>      Default 0",
    "  --target-manual-max <n>   Default 12",
    "  --target-hybrid-min <n>   Default 10",
    "  --target-hybrid-max <n>   Default 18",
    "  --help                    Show this help",
  ].join("\n");
}

function parseArgs(argv: string[]): RunnerOptions {
  const options: RunnerOptions = {
    dryRun: false,
    enforceTargets: false,
    generateHtml: false,
    includeInstall: false,
    includeReleaseCheck: false,
    keepSettings: false,
    only: null,
    reportRoot: join(repoRoot, ".qa", "m1-mac"),
    skipNative: false,
    targets: { ...defaultQaTargets },
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--enforce-targets") options.enforceTargets = true;
    else if (arg === "--html") options.generateHtml = true;
    else if (arg === "--skip-native" || arg === "--no-native") options.skipNative = true;
    else if (arg === "--with-install") options.includeInstall = true;
    else if (arg === "--with-release-check") options.includeReleaseCheck = true;
    else if (arg === "--keep-settings") options.keepSettings = true;
    else if (arg === "--help" || arg === "-h") {
      console.log(usage());
      process.exit(0);
    } else if (arg === "--only") {
      const value = argv[index + 1];
      if (!value) throw new Error("--only requires a comma-separated value.");
      options.only = new Set(value.split(",").map((item) => item.trim()).filter(Boolean));
      index += 1;
    } else if (arg.startsWith("--only=")) {
      const value = arg.slice("--only=".length);
      options.only = new Set(value.split(",").map((item) => item.trim()).filter(Boolean));
    } else if (arg === "--report-root") {
      const value = argv[index + 1];
      if (!value) throw new Error("--report-root requires a path.");
      options.reportRoot = resolve(repoRoot, value);
      index += 1;
    } else if (arg.startsWith("--report-root=")) {
      options.reportRoot = resolve(repoRoot, arg.slice("--report-root=".length));
    } else if (arg === "--target-auto-min") {
      options.targets.autoMin = readNumericArg(argv, index, arg);
      index += 1;
    } else if (arg === "--target-auto-max") {
      options.targets.autoMax = readNumericArg(argv, index, arg);
      index += 1;
    } else if (arg === "--target-gap-max") {
      options.targets.gapMax = readNumericArg(argv, index, arg);
      index += 1;
    } else if (arg === "--target-manual-max") {
      options.targets.manualMax = readNumericArg(argv, index, arg);
      index += 1;
    } else if (arg === "--target-hybrid-min") {
      options.targets.hybridMin = readNumericArg(argv, index, arg);
      index += 1;
    } else if (arg === "--target-hybrid-max") {
      options.targets.hybridMax = readNumericArg(argv, index, arg);
      index += 1;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

function readNumericArg(argv: string[], index: number, arg: string): number {
  const value = argv[index + 1];
  if (!value) throw new Error(`${arg} requires a numeric value.`);
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error(`${arg} must be a non-negative integer.`);
  return parsed;
}

function timestamp(): string {
  return new Date().toISOString().replaceAll(":", "-").replace(".", "-");
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function relativeArtifact(path: string): string {
  return relative(repoRoot, path);
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function readTextIfExists(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}

function shouldRunGate(gate: AutoGate, options: RunnerOptions): { run: boolean; reason?: string } {
  if (options.only && !options.only.has(gate.id)) return { run: false, reason: "Skipped by --only." };
  if (gate.macOnly && platform() !== "darwin") return { run: false, reason: "macOS-only gate." };
  if (gate.id === "install" && !options.includeInstall) return { run: false, reason: gate.skipReason };
  if (gate.id === "release-check" && !options.includeReleaseCheck) return { run: false, reason: gate.skipReason };
  if (!gate.enabledByDefault && gate.id !== "install" && gate.id !== "release-check") {
    return { run: false, reason: gate.skipReason ?? "Disabled by default." };
  }
  return { run: true };
}

async function runShell(
  gate: Pick<AutoGate, "id" | "label" | "command" | "sourceCommand">,
  logsDir: string,
  options: RunnerOptions,
): Promise<GateResult> {
  const started = Date.now();
  const logPath = join(logsDir, `${gate.id}.log`);

  if (options.dryRun) {
    await writeFile(logPath, `[dry-run] ${gate.command}\n`, "utf8");
    return {
      id: gate.id,
      label: gate.label,
      command: gate.command,
      sourceCommand: gate.sourceCommand,
      status: "skipped",
      exitCode: null,
      durationMs: Date.now() - started,
      logPath,
      reason: "dry-run",
    };
  }

  const proc = Bun.spawn(["/bin/zsh", "-lc", gate.command], {
    cwd: repoRoot,
    env: process.env,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  const log = [
    `$ ${gate.command}`,
    "",
    "## stdout",
    stdout.trimEnd(),
    "",
    "## stderr",
    stderr.trimEnd(),
    "",
    `exitCode=${exitCode}`,
  ].join("\n");
  await writeFile(logPath, log, "utf8");

  return {
    id: gate.id,
    label: gate.label,
    command: gate.command,
    sourceCommand: gate.sourceCommand,
    status: exitCode === 0 ? "pass" : "fail",
    exitCode,
    durationMs: Date.now() - started,
    logPath,
  };
}

function skippedGate(gate: AutoGate, logsDir: string, reason: string): GateResult {
  return {
    id: gate.id,
    label: gate.label,
    command: gate.command,
    sourceCommand: gate.sourceCommand,
    status: "skipped",
    exitCode: null,
    durationMs: 0,
    logPath: join(logsDir, `${gate.id}.log`),
    reason,
  };
}

async function runReleaseGates(
  options: RunnerOptions,
  logsDir: string,
): Promise<GateResult[]> {
  const results: GateResult[] = [];

  for (const gate of releaseGates) {
    const decision = shouldRunGate(gate, options);
    if (!decision.run) {
      const result = skippedGate(gate, logsDir, decision.reason ?? "Skipped.");
      await writeFile(result.logPath, result.reason ?? "Skipped.", "utf8");
      results.push(result);
      continue;
    }
    console.log(`qa:m1:mac ${gate.id}: ${gate.command}`);
    results.push(await runShell(gate, logsDir, options));
  }

  return results;
}

async function createSmokeWorkspace(fixturesDir: string): Promise<{ workspaceDir: string; emptyDir: string; filePath: string }> {
  const workspaceDir = join(fixturesDir, "m1-ui-smoke");
  const emptyDir = join(workspaceDir, "empty-folder");
  const productDir = join(workspaceDir, "product");
  const researchDir = join(workspaceDir, "research");
  const assetsDir = join(workspaceDir, "assets");

  await mkdir(emptyDir, { recursive: true });
  await mkdir(productDir, { recursive: true });
  await mkdir(researchDir, { recursive: true });
  await mkdir(assetsDir, { recursive: true });

  const overview = [
    "---",
    "title: M1 UI Smoke",
    "id: m1-ui-smoke",
    "tags: [m1, qa]",
    "---",
    "",
    "# M1 UI Smoke <!-- bloommd:id=root -->",
    "",
    "Intro mit [Website](https://example.com) und [[product/roadmap.md|Roadmap]].",
    "",
    "## Canvas <!-- bloommd:id=canvas -->",
    "",
    "Node fuer Toolbar, Drag, Focus und Saved Views.",
    "",
    "### Child A <!-- bloommd:id=child-a -->",
    "",
    "Inhalt A.",
    "",
    "### Child B <!-- bloommd:id=child-b -->",
    "",
    "Inhalt B.",
    "",
    "## Editor <!-- bloommd:id=editor -->",
    "",
    "Text fuer Content-Edits.",
    "",
    "## Task <!-- bloommd:id=task -->",
    "",
    "Status-Node fuer Task Toggle.",
    "",
  ].join("\n");
  const roadmap = [
    "---",
    "title: Roadmap",
    "id: roadmap",
    "---",
    "",
    "# Roadmap <!-- bloommd:id=roadmap-root -->",
    "",
    "## M1 <!-- bloommd:id=roadmap-m1 -->",
    "",
    "Refs: [[../overview.md#canvas|Canvas]].",
    "",
  ].join("\n");
  const links = [
    "---",
    "title: Link Tests",
    "id: link-tests",
    "---",
    "",
    "# Link Tests <!-- bloommd:id=links-root -->",
    "",
    "Remote: https://example.com/reference",
    "Broken: [[missing.md|Missing]]",
    "Asset: ![](../assets/diagram.png)",
    "",
  ].join("\n");
  const transparentPixel = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
    "base64",
  );

  await writeFile(join(workspaceDir, "overview.md"), overview, "utf8");
  await writeFile(join(productDir, "roadmap.md"), roadmap, "utf8");
  await writeFile(join(researchDir, "links.md"), links, "utf8");
  await writeFile(join(assetsDir, "diagram.png"), transparentPixel);

  return { workspaceDir, emptyDir, filePath: join(productDir, "roadmap.md") };
}

function parseSettings(raw: string | null): DesktopSettings {
  if (!raw) return {};
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object") return {};
  const record = parsed as Record<string, unknown>;
  return {
    activeFile: typeof record.activeFile === "string" ? record.activeFile : undefined,
    localDir: typeof record.localDir === "string" ? record.localDir : undefined,
    mode: typeof record.mode === "string" ? record.mode : undefined,
  };
}

function parseDesktopE2EState(raw: string | null): DesktopE2EState {
  if (!raw) return {};
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object") return {};
  const record = parsed as Record<string, unknown>;
  return {
    source: typeof record.source === "string" ? record.source : undefined,
    activeFile: typeof record.activeFile === "string" || record.activeFile === null ? record.activeFile : undefined,
    localDir: typeof record.localDir === "string" ? record.localDir : undefined,
    emptyWorkspace: typeof record.emptyWorkspace === "boolean" ? record.emptyWorkspace : undefined,
    documentTitle: typeof record.documentTitle === "string" ? record.documentTitle : undefined,
    nodeCount: typeof record.nodeCount === "number" ? record.nodeCount : undefined,
    referenceEdgeCount: typeof record.referenceEdgeCount === "number" ? record.referenceEdgeCount : undefined,
    workspaceMode: typeof record.workspaceMode === "boolean" ? record.workspaceMode : undefined,
    mode: typeof record.mode === "string" ? record.mode : undefined,
    timestamp: typeof record.timestamp === "string" ? record.timestamp : undefined,
  };
}

async function assertDesktopE2EState(
  id: string,
  label: string,
  statePath: string,
  expected: ExpectedDesktopE2EState,
  logsDir: string,
): Promise<GateResult> {
  const started = Date.now();
  let raw: string | null = null;
  let state: DesktopE2EState = {};
  let failures: string[] = [];

  const evaluate = (currentRaw: string | null, currentState: DesktopE2EState): string[] => {
    const currentFailures: string[] = [];
    if (!currentRaw) currentFailures.push(`Missing E2E state file at ${statePath}.`);
    if (expected.localDir !== undefined && currentState.localDir !== expected.localDir) {
      currentFailures.push(`Expected localDir ${expected.localDir}, got ${currentState.localDir ?? "<unset>"}.`);
    }
    if ("activeFile" in expected && currentState.activeFile !== expected.activeFile) {
      currentFailures.push(`Expected activeFile ${expected.activeFile ?? "<null>"}, got ${currentState.activeFile ?? "<unset>"}.`);
    }
    if (expected.emptyWorkspace !== undefined && currentState.emptyWorkspace !== expected.emptyWorkspace) {
      currentFailures.push(`Expected emptyWorkspace ${expected.emptyWorkspace}, got ${currentState.emptyWorkspace ?? "<unset>"}.`);
    }
    if (expected.documentTitle !== undefined && currentState.documentTitle !== expected.documentTitle) {
      currentFailures.push(`Expected documentTitle ${expected.documentTitle}, got ${currentState.documentTitle ?? "<unset>"}.`);
    }
    if (expected.minNodeCount !== undefined && (currentState.nodeCount ?? 0) < expected.minNodeCount) {
      currentFailures.push(`Expected nodeCount >= ${expected.minNodeCount}, got ${currentState.nodeCount ?? "<unset>"}.`);
    }
    if (expected.minReferenceEdgeCount !== undefined && (currentState.referenceEdgeCount ?? 0) < expected.minReferenceEdgeCount) {
      currentFailures.push(`Expected referenceEdgeCount >= ${expected.minReferenceEdgeCount}, got ${currentState.referenceEdgeCount ?? "<unset>"}.`);
    }
    if (expected.workspaceMode !== undefined && currentState.workspaceMode !== expected.workspaceMode) {
      currentFailures.push(`Expected workspaceMode ${expected.workspaceMode}, got ${currentState.workspaceMode ?? "<unset>"}.`);
    }
    return currentFailures;
  };

  const deadline = Date.now() + 6000;
  do {
    raw = await readTextIfExists(statePath);
    state = parseDesktopE2EState(raw);
    failures = evaluate(raw, state);
    if (failures.length === 0) break;
    await Bun.sleep(300);
  } while (Date.now() < deadline);

  const logPath = join(logsDir, `${id}.log`);
  await writeFile(
    logPath,
    [
      `statePath=${statePath}`,
      "",
      "## expected",
      JSON.stringify(expected, null, 2),
      "",
      "## actual",
      JSON.stringify(state, null, 2),
      "",
      "## failures",
      failures.join("\n"),
    ].join("\n"),
    "utf8",
  );

  return {
    id,
    label,
    command: "read desktop E2E state",
    sourceCommand: "desktop-e2e-state",
    status: failures.length === 0 ? "pass" : "fail",
    exitCode: failures.length === 0 ? 0 : 1,
    durationMs: Date.now() - started,
    logPath,
    reason: failures.length > 0 ? failures.join(" ") : undefined,
  };
}

async function takeScreenshot(path: string, logsDir: string): Promise<GateResult> {
  return await runShell(
    {
      id: `screenshot-${path.split("/").pop()?.replace(/\.png$/, "") ?? "capture"}`,
      label: "macOS screenshot",
      command: `screencapture -x ${shellQuote(path)}`,
      sourceCommand: "screencapture",
    },
    logsDir,
    { ...defaultOptions(), dryRun: false },
  );
}

function defaultOptions(): RunnerOptions {
  return {
    dryRun: false,
    enforceTargets: false,
    generateHtml: false,
    includeInstall: false,
    includeReleaseCheck: false,
    keepSettings: false,
    only: null,
    reportRoot: join(repoRoot, ".qa", "m1-mac"),
    skipNative: false,
    targets: { ...defaultQaTargets },
  };
}

async function runNativeSmoke(
  options: RunnerOptions,
  logsDir: string,
  screenshotsDir: string,
  fixturesDir: string,
): Promise<NativeSmokeResult> {
  const started = Date.now();
  const shouldSkipByOnly = options.only && !options.only.has("native-smoke");
  if (shouldSkipByOnly) {
    return { status: "skipped", durationMs: 0, checks: [], screenshots: [], reason: "Skipped by --only." };
  }
  if (options.skipNative) {
    return { status: "skipped", durationMs: 0, checks: [], screenshots: [], reason: "Skipped by --skip-native." };
  }
  if (platform() !== "darwin") {
    return { status: "skipped", durationMs: 0, checks: [], screenshots: [], reason: "Native smoke requires macOS." };
  }
  if (options.dryRun) {
    return { status: "skipped", durationMs: 0, checks: [], screenshots: [], reason: "dry-run" };
  }

  const appPath = join(repoRoot, "packages/desktop/build/stable-macos-arm64/BloomMD.app");
  const launcherPath = join(appPath, "Contents/MacOS/launcher");
  if (!(await exists(appPath))) {
    return {
      status: "fail",
      durationMs: Date.now() - started,
      checks: [],
      screenshots: [],
      reason: `Desktop app not found at ${relativeArtifact(appPath)}. Run desktop-build-stable first.`,
    };
  }
  if (!(await exists(launcherPath))) {
    return {
      status: "fail",
      durationMs: Date.now() - started,
      checks: [],
      screenshots: [],
      reason: `Desktop launcher not found at ${relativeArtifact(launcherPath)}. Run desktop-build-stable first.`,
    };
  }

  const previousSettings = await readTextIfExists(desktopSettingsPath);
  if (previousSettings !== null) {
    await writeFile(join(logsDir, "desktop-settings-before.json"), previousSettings, "utf8");
  }

  const checks: GateResult[] = [];
  const screenshots: string[] = [];
  const smoke = await createSmokeWorkspace(fixturesDir);
  const e2eStatePath = join(logsDir, "desktop-e2e-state.json");
  const e2eEventLogPath = join(logsDir, "desktop-e2e-events.jsonl");
  const e2eHandoffPath = join(logsDir, "desktop-handoff.sock");
  const cliOpenCommand = (targetPath: string) => {
    return [
      `BLOOMMD_OPEN_APP=${shellQuote(appPath)}`,
      `BLOOMMD_DESKTOP_HANDOFF_PATH=${shellQuote(e2eHandoffPath)}`,
      "bun run --cwd packages/wiki-cli src/cli.ts workspace open",
      shellQuote(targetPath),
    ].join(" ");
  };
  const launchAppCommand = (processLogPath: string, targetPath?: string) => {
    return [
      "open",
      "-n",
      "--env",
      shellQuote("BLOOMMD_E2E=1"),
      "--env",
      shellQuote(`BLOOMMD_E2E_STATE=${e2eStatePath}`),
      "--env",
      shellQuote(`BLOOMMD_E2E_LOG=${e2eEventLogPath}`),
      "--env",
      shellQuote(`BLOOMMD_DESKTOP_HANDOFF_PATH=${e2eHandoffPath}`),
      shellQuote(appPath),
      "--args",
      "--e2e",
      "--e2e-state",
      shellQuote(e2eStatePath),
      "--e2e-log",
      shellQuote(e2eEventLogPath),
      ...(targetPath ? [shellQuote(targetPath)] : []),
      ">",
      shellQuote(processLogPath),
      "2>&1",
    ].join(" ");
  };

  try {
    checks.push(
      await runShell(
        {
          id: "native-preflight-quit-app",
          label: "Quit existing BloomMD before E2E launch",
          command: "osascript -e 'tell application \"BloomMD\" to quit' || true",
          sourceCommand: "quit BloomMD",
        },
        logsDir,
        { ...options, dryRun: false },
      ),
    );
    await Bun.sleep(1000);

    checks.push(
      await runShell(
        {
          id: "native-open-app",
          label: "Open stable macOS app",
          command: launchAppCommand(join(logsDir, "native-app-process.log")),
          sourceCommand: "open -n BloomMD.app --args --e2e",
        },
        logsDir,
        options,
      ),
    );
    await Bun.sleep(1500);
    checks.push(
      await assertDesktopE2EState(
        "native-state-ready",
        "Desktop E2E state is available before CLI handoff",
        e2eStatePath,
        {},
        logsDir,
      ),
    );
    await Bun.sleep(750);

    checks.push(
      await runShell(
        {
          id: "native-cli-open-folder",
          label: "CLI opens smoke workspace",
          command: cliOpenCommand(smoke.workspaceDir),
          sourceCommand: "bloommd open <ordner>",
        },
        logsDir,
        options,
      ),
    );
    await Bun.sleep(2500);
    let folderState = await assertDesktopE2EState(
      "native-state-folder-attempt-1",
      "Desktop E2E state after opening workspace folder",
      e2eStatePath,
      {
        localDir: smoke.workspaceDir,
        activeFile: null,
        emptyWorkspace: false,
        workspaceMode: true,
        minNodeCount: 10,
        minReferenceEdgeCount: 2,
      },
      logsDir,
    );
    if (folderState.status === "fail") {
      checks.push(
        await runShell(
          {
            id: "native-cli-open-folder-retry",
            label: "CLI retries opening smoke workspace",
            command: cliOpenCommand(smoke.workspaceDir),
            sourceCommand: "bloommd open <ordner>",
          },
          logsDir,
          options,
        ),
      );
      await Bun.sleep(2500);
      folderState = await assertDesktopE2EState(
        "native-state-folder",
        "Desktop E2E state after retrying workspace folder",
        e2eStatePath,
        {
          localDir: smoke.workspaceDir,
          activeFile: null,
          emptyWorkspace: false,
          workspaceMode: true,
          minNodeCount: 10,
          minReferenceEdgeCount: 2,
        },
        logsDir,
      );
      if (folderState.status === "fail") {
        folderState.reason = `Initial attempt log: ${relativeArtifact(join(logsDir, "native-state-folder-attempt-1.log"))}. ${folderState.reason ?? ""}`.trim();
      }
    } else {
      folderState = { ...folderState, id: "native-state-folder" };
    }
    checks.push(folderState);
    const folderScreenshot = join(screenshotsDir, "native-folder-open.png");
    checks.push(await takeScreenshot(folderScreenshot, logsDir));
    screenshots.push(folderScreenshot);

    checks.push(
      await runShell(
        {
          id: "native-cli-open-file",
          label: "CLI opens a markdown file",
          command: cliOpenCommand(smoke.filePath),
          sourceCommand: "bloommd open <datei.md>",
        },
        logsDir,
        options,
      ),
    );
    await Bun.sleep(2500);
    checks.push(
      await assertDesktopE2EState(
        "native-state-file",
        "Desktop E2E state after opening markdown file",
        e2eStatePath,
        {
          localDir: join(smoke.workspaceDir, "product"),
          activeFile: "roadmap.md",
          emptyWorkspace: false,
          documentTitle: "Roadmap",
          minNodeCount: 2,
        },
        logsDir,
      ),
    );
    const fileScreenshot = join(screenshotsDir, "native-file-open.png");
    checks.push(await takeScreenshot(fileScreenshot, logsDir));
    screenshots.push(fileScreenshot);

    checks.push(
      await runShell(
        {
          id: "native-cli-open-empty-folder",
          label: "CLI opens an empty folder",
          command: cliOpenCommand(smoke.emptyDir),
          sourceCommand: "bloommd open <leerer-ordner>",
        },
        logsDir,
        options,
      ),
    );
    await Bun.sleep(2500);
    checks.push(
      await assertDesktopE2EState(
        "native-state-empty-folder",
        "Desktop E2E state after opening empty folder",
        e2eStatePath,
        { localDir: smoke.emptyDir, activeFile: null, emptyWorkspace: true },
        logsDir,
      ),
    );
    const emptyScreenshot = join(screenshotsDir, "native-empty-folder.png");
    checks.push(await takeScreenshot(emptyScreenshot, logsDir));
    screenshots.push(emptyScreenshot);

    const settingsAfterRaw = await readTextIfExists(desktopSettingsPath);
    const settingsAfter = parseSettings(settingsAfterRaw);
    await writeFile(
      join(logsDir, "desktop-settings-after-native-smoke.json"),
      JSON.stringify(settingsAfter, null, 2),
      "utf8",
    );
    if (settingsAfter.localDir !== smoke.emptyDir) {
      checks.push({
        id: "native-settings-empty-folder",
        label: "Desktop settings point to empty folder",
        command: "read ~/.bloommd-desktop.json",
        sourceCommand: "settings localDir",
        status: "fail",
        exitCode: 1,
        durationMs: 0,
        logPath: join(logsDir, "desktop-settings-after-native-smoke.json"),
        reason: `Expected localDir ${smoke.emptyDir}, got ${settingsAfter.localDir ?? "<unset>"}.`,
      });
    } else {
      checks.push({
        id: "native-settings-empty-folder",
        label: "Desktop settings point to empty folder",
        command: "read ~/.bloommd-desktop.json",
        sourceCommand: "settings localDir",
        status: "pass",
        exitCode: 0,
        durationMs: 0,
        logPath: join(logsDir, "desktop-settings-after-native-smoke.json"),
      });
    }
  } finally {
    await runShell(
      {
        id: "native-quit-app",
        label: "Quit BloomMD",
        command: "osascript -e 'tell application \"BloomMD\" to quit' || true",
        sourceCommand: "quit BloomMD",
      },
      logsDir,
      { ...options, dryRun: false },
    );
    if (!options.keepSettings) {
      if (previousSettings === null) {
        await unlink(desktopSettingsPath).catch(() => undefined);
      } else {
        await writeFile(desktopSettingsPath, previousSettings, "utf8");
      }
    }
  }

  const failed = checks.some((check) => check.status === "fail");
  const skipped = checks.some((check) => check.status === "skipped");
  return {
    status: failed ? "fail" : skipped ? "skipped" : "pass",
    durationMs: Date.now() - started,
    checks,
    screenshots,
  };
}

async function getCommitSha(logsDir: string, options: RunnerOptions): Promise<string> {
  const result = await runShell(
    {
      id: "git-rev-parse",
      label: "Current commit SHA",
      command: "git rev-parse HEAD",
      sourceCommand: "git rev-parse HEAD",
    },
    logsDir,
    { ...options, dryRun: false },
  );
  const raw = await readFile(result.logPath, "utf8");
  const match = raw.match(/## stdout\n([0-9a-f]{40})/);
  return match?.[1] ?? "unknown";
}

function planGateWarnings(planGates: PlanGate[]): string[] {
  const knownCommands = new Set(planGates.map((gate) => gate.command));
  const warnings: string[] = [];
  for (const gate of releaseGates) {
    if (!knownCommands.has(gate.sourceCommand)) {
      warnings.push(`${gate.id} references "${gate.sourceCommand}", which is not listed in docs/M1-TESTPLAN.md.`);
    }
  }
  return warnings;
}

function successfulGateIds(gateResults: GateResult[], nativeSmoke: NativeSmokeResult): Set<string> {
  const passed = new Set(gateResults.filter((result) => result.status === "pass").map((result) => result.id));
  if (nativeSmoke.status === "pass") passed.add("native-smoke");
  if (passed.has("test") && passed.has("web-e2e")) passed.add("browser-fs-mock");
  if (passed.has("desktop-test") && nativeSmoke.status === "pass") passed.add("desktop-e2e");
  return passed;
}

function failedGateIds(gateResults: GateResult[], nativeSmoke: NativeSmokeResult): Set<string> {
  const failed = new Set(gateResults.filter((result) => result.status === "fail").map((result) => result.id));
  if (nativeSmoke.status === "fail") failed.add("native-smoke");
  if (failed.has("test") || failed.has("web-e2e")) failed.add("browser-fs-mock");
  if (failed.has("desktop-test") || nativeSmoke.status === "fail") failed.add("desktop-e2e");
  return failed;
}

function skippedGateIds(gateResults: GateResult[], nativeSmoke: NativeSmokeResult): Set<string> {
  const skipped = new Set(gateResults.filter((result) => result.status === "skipped").map((result) => result.id));
  if (nativeSmoke.status === "skipped") skipped.add("native-smoke");
  if (skipped.has("test") || skipped.has("web-e2e")) skipped.add("browser-fs-mock");
  if (skipped.has("desktop-test") || nativeSmoke.status === "skipped") skipped.add("desktop-e2e");
  return skipped;
}

function splitMetadataList(value: string): string[] {
  if (!value || value === "n/a") return [];
  return value
    .split(/[;,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function deriveCoverage(testCase: MatrixCase): string[] {
  const coverage = new Set<string>();

  for (const target of splitMetadataList(testCase.automation.automationTarget)) {
    if (target === "native-smoke") coverage.add("native-smoke");
    else if (target === "desktop-unit") coverage.add("desktop-test");
    else if (target === "core-unit" || target === "sync-unit" || target === "unit" || target === "integration") {
      coverage.add("test");
    } else if (target === "web-e2e") coverage.add("web-e2e");
    else if (target === "marketing-e2e") coverage.add("marketing-e2e");
    else if (target === "beta-e2e") coverage.add("beta-e2e");
    else if (target === "wiki-e2e") coverage.add("wiki-e2e");
    else if (target === "collaboration-e2e") coverage.add("collaboration-e2e");
    else if (target === "visual-regression") coverage.add("visual-regression");
    else if (target === "desktop-e2e-state") coverage.add("native-smoke");
    else if (target === "cli-contract" || target === "component" || target === "shared-ui") coverage.add("test");
    else if (syntheticAutomationGates.has(target)) coverage.add(target);
    else if (futureAutomationGates.has(target)) coverage.add(target);
  }

  return [...coverage].sort();
}

function knownRunnerGateIds(): Set<string> {
  return new Set([...releaseGates.map((gate) => gate.id), "native-smoke", ...syntheticAutomationGates]);
}

function caseEvidence(coverage: string[], gateResults: GateResult[], nativeSmoke: NativeSmokeResult): string[] {
  const evidence: string[] = [];
  for (const gateId of coverage) {
    if (gateId === "native-smoke") {
      evidence.push(...nativeSmoke.screenshots.map(relativeArtifact));
      continue;
    }
    if (gateId === "browser-fs-mock") {
      for (const evidenceGateId of ["test", "web-e2e"]) {
        const gate = gateResults.find((result) => result.id === evidenceGateId);
        if (gate) evidence.push(relativeArtifact(gate.logPath));
      }
      continue;
    }
    if (gateId === "desktop-e2e") {
      const desktopGate = gateResults.find((result) => result.id === "desktop-test");
      if (desktopGate) evidence.push(relativeArtifact(desktopGate.logPath));
      evidence.push(...nativeSmoke.screenshots.map(relativeArtifact));
      continue;
    }
    const gate = gateResults.find((result) => result.id === gateId);
    if (gate) evidence.push(relativeArtifact(gate.logPath));
  }
  return evidence;
}

function evaluateCases(
  cases: MatrixCase[],
  gateResults: GateResult[],
  nativeSmoke: NativeSmokeResult,
): CaseResult[] {
  const passed = successfulGateIds(gateResults, nativeSmoke);
  const failed = failedGateIds(gateResults, nativeSmoke);
  const skipped = skippedGateIds(gateResults, nativeSmoke);
  const knownGates = knownRunnerGateIds();

  return cases.map((testCase) => {
    const macRelevant = isMacRelevant(testCase);
    const coverage = deriveCoverage(testCase);
    const evidence = caseEvidence(coverage, gateResults, nativeSmoke);
    const missingRunnerGates = coverage.filter((gateId) => !knownGates.has(gateId));

    if (!macRelevant) {
      return {
        id: testCase.id,
        status: "skipped",
        matrixStatus: testCase.status,
        section: testCase.section,
        functionName: testCase.functionName,
        macRelevant,
        automation: testCase.automation,
        coverage,
        evidence: [],
        missingRunnerGates,
        reason: "Nicht macOS-relevant.",
      };
    }
    if (testCase.status === "Manual") {
      return {
        id: testCase.id,
        status: "manual",
        matrixStatus: testCase.status,
        section: testCase.section,
        functionName: testCase.functionName,
        macRelevant,
        automation: testCase.automation,
        coverage,
        evidence: [],
        missingRunnerGates,
        reason: "Manuelle Evidence laut UI-QA-Matrix erforderlich.",
      };
    }
    if (testCase.status === "Gap") {
      return {
        id: testCase.id,
        status: "gap",
        matrixStatus: testCase.status,
        section: testCase.section,
        functionName: testCase.functionName,
        macRelevant,
        automation: testCase.automation,
        coverage,
        evidence: [],
        missingRunnerGates,
        reason: "Als Gap in der UI-QA-Matrix markiert.",
      };
    }

    if (missingRunnerGates.length > 0) {
      return {
        id: testCase.id,
        status: testCase.status === "Hybrid" ? "partial" : "skipped",
        matrixStatus: testCase.status,
        section: testCase.section,
        functionName: testCase.functionName,
        macRelevant,
        automation: testCase.automation,
        coverage,
        evidence,
        missingRunnerGates,
        reason: `Automation-Ziel noch ohne Runner-Gate: ${missingRunnerGates.join(", ")}.`,
      };
    }

    const failedCoverage = coverage.filter((gateId) => failed.has(gateId));
    if (failedCoverage.length > 0) {
      return {
        id: testCase.id,
        status: "fail",
        matrixStatus: testCase.status,
        section: testCase.section,
        functionName: testCase.functionName,
        macRelevant,
        automation: testCase.automation,
        coverage,
        evidence,
        missingRunnerGates,
        reason: `Abdeckende Gates fehlgeschlagen: ${failedCoverage.join(", ")}.`,
      };
    }

    const skippedCoverage = coverage.filter((gateId) => skipped.has(gateId));
    if (skippedCoverage.length > 0) {
      return {
        id: testCase.id,
        status: "skipped",
        matrixStatus: testCase.status,
        section: testCase.section,
        functionName: testCase.functionName,
        macRelevant,
        automation: testCase.automation,
        coverage,
        evidence,
        missingRunnerGates,
        reason: `Abdeckende Gates nicht ausgefuehrt: ${skippedCoverage.join(", ")}.`,
      };
    }

    const allCovered = coverage.length > 0 && coverage.every((gateId) => passed.has(gateId));
    if (testCase.status === "Hybrid" && allCovered) {
      return {
        id: testCase.id,
        status: "partial",
        matrixStatus: testCase.status,
        section: testCase.section,
        functionName: testCase.functionName,
        macRelevant,
        automation: testCase.automation,
        coverage,
        evidence,
        missingRunnerGates,
        reason: "Automatischer Kern gruen; visueller/nativer Anteil bleibt manuell zu belegen.",
      };
    }

    return {
      id: testCase.id,
      status: allCovered ? "pass" : "skipped",
      matrixStatus: testCase.status,
      section: testCase.section,
      functionName: testCase.functionName,
      macRelevant,
      automation: testCase.automation,
      coverage,
      evidence,
      missingRunnerGates,
      reason: allCovered ? "Automatische Abdeckung gruen." : "Keine eindeutige automatische Abdeckung gefunden.",
    };
  });
}

function buildAutomationDebt(caseResults: CaseResult[], targets: QaTargets): AutomationDebtSummary {
  const items: AutomationDebtItem[] = [];

  for (const result of caseResults) {
    const targets = splitMetadataList(result.automation.automationTarget);
    const acceptedPlatformManual =
      targets.includes("manual-os") || targets.includes("manual-release") || targets.includes("external-e2e");

    if (result.matrixStatus === "Gap") {
      items.push({
        id: result.id,
        severity: "P0",
        category: "gap",
        matrixStatus: result.matrixStatus,
        resultStatus: result.status,
        section: result.section,
        functionName: result.functionName,
        issue: result.automation.issue,
        automationTarget: result.automation.automationTarget,
        testType: result.automation.testType,
        missingRunnerGates: result.missingRunnerGates,
        manualReason: result.automation.manualReason,
        reason: "UI-QA-Matrix markiert diesen Fall noch als Gap.",
      });
      continue;
    }

    if (result.missingRunnerGates.length > 0) {
      items.push({
        id: result.id,
        severity: result.missingRunnerGates.some((gateId) => gateId === "drag-e2e" || gateId === "collaboration-e2e") ? "P0" : "P1",
        category: "missing-runner-gate",
        matrixStatus: result.matrixStatus,
        resultStatus: result.status,
        section: result.section,
        functionName: result.functionName,
        issue: result.automation.issue,
        automationTarget: result.automation.automationTarget,
        testType: result.automation.testType,
        missingRunnerGates: result.missingRunnerGates,
        manualReason: result.automation.manualReason,
        reason: "Metadaten zeigen automatisierbaren Bedarf, aber noch kein Runner-Gate.",
      });
      continue;
    }

    if (result.matrixStatus === "Manual") {
      items.push({
        id: result.id,
        severity: acceptedPlatformManual ? "P2" : "P1",
        category: acceptedPlatformManual ? "accepted-platform-manual" : "manual-automation-candidate",
        matrixStatus: result.matrixStatus,
        resultStatus: result.status,
        section: result.section,
        functionName: result.functionName,
        issue: result.automation.issue,
        automationTarget: result.automation.automationTarget,
        testType: result.automation.testType,
        missingRunnerGates: result.missingRunnerGates,
        manualReason: result.automation.manualReason,
        reason: acceptedPlatformManual ? "Bewusste Plattform-/Release-Grenze." : "Manueller Fall sollte automatisiert oder klar begrenzt werden.",
      });
      continue;
    }

    if (result.status === "partial" && result.automation.manualReason !== "n/a") {
      items.push({
        id: result.id,
        severity: "P1",
        category: "hybrid-residual",
        matrixStatus: result.matrixStatus,
        resultStatus: result.status,
        section: result.section,
        functionName: result.functionName,
        issue: result.automation.issue,
        automationTarget: result.automation.automationTarget,
        testType: result.automation.testType,
        missingRunnerGates: result.missingRunnerGates,
        manualReason: result.automation.manualReason,
        reason: "Automatischer Kern vorhanden, aber Rest-Evidence bleibt offen.",
      });
    }
  }

  const bySeverity: Record<AutomationDebtSeverity, number> = { P0: 0, P1: 0, P2: 0 };
  const byCategory: Record<string, number> = {};
  for (const item of items) {
    bySeverity[item.severity] += 1;
    byCategory[item.category] = (byCategory[item.category] ?? 0) + 1;
  }

  return {
    total: items.length,
    bySeverity,
    byCategory,
    target: {
      autoMin: targets.autoMin,
      autoMax: targets.autoMax,
      gapMax: targets.gapMax,
      manualMax: targets.manualMax,
      hybridMin: targets.hybridMin,
      hybridMax: targets.hybridMax,
    },
    targetViolations: qaTargetViolations(caseResults, targets),
    items,
  };
}

function qaTargetViolations(caseResults: CaseResult[], targets: QaTargets): string[] {
  const matrixCounts = countByStatus(caseResults.map((result) => result.matrixStatus));
  const violations: string[] = [];
  const autoCount = matrixCounts.Auto ?? 0;
  const gapCount = matrixCounts.Gap ?? 0;
  const manualCount = matrixCounts.Manual ?? 0;
  const hybridCount = matrixCounts.Hybrid ?? 0;

  if (autoCount < targets.autoMin) violations.push(`Auto ${autoCount} < target ${targets.autoMin}`);
  if (autoCount > targets.autoMax) violations.push(`Auto ${autoCount} > target ${targets.autoMax}`);
  if (gapCount > targets.gapMax) violations.push(`Gap ${gapCount} > target ${targets.gapMax}`);
  if (manualCount > targets.manualMax) violations.push(`Manual ${manualCount} > target ${targets.manualMax}`);
  if (hybridCount < targets.hybridMin) violations.push(`Hybrid ${hybridCount} < target ${targets.hybridMin}`);
  if (hybridCount > targets.hybridMax) violations.push(`Hybrid ${hybridCount} > target ${targets.hybridMax}`);

  return violations;
}

function countByStatus<T extends string>(items: T[]): Record<T, number> {
  const counts = {} as Record<T, number>;
  for (const item of items) counts[item] = (counts[item] ?? 0) + 1;
  return counts;
}

function markdownTable(rows: string[][]): string {
  if (rows.length === 0) return "";
  const [header, ...body] = rows;
  return [
    `| ${header.join(" | ")} |`,
    `| ${header.map(() => "---").join(" | ")} |`,
    ...body.map((row) => `| ${row.join(" | ")} |`),
  ].join("\n");
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function escapeCell(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", "<br>");
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function htmlStatusClass(status: string): string {
  if (status === "pass") return "status-pass";
  if (status === "fail") return "status-fail";
  if (status === "partial") return "status-partial";
  if (status === "manual") return "status-manual";
  if (status === "gap") return "status-gap";
  return "status-skipped";
}

function relativeReportPath(reportDir: string, path: string): string {
  return relative(reportDir, path).replaceAll("\\", "/");
}

function htmlLink(reportDir: string, path: string, label?: string): string {
  const href = relativeReportPath(reportDir, path);
  return `<a href="${escapeHtml(href)}">${escapeHtml(label ?? href)}</a>`;
}

function htmlTable(headers: string[], rows: string[][]): string {
  const head = headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("");
  const body = rows
    .map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`)
    .join("\n");
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function renderMarkdownReport(report: QaReport, warnings: string[]): string {
  const caseCounts = countByStatus(report.caseResults.map((result) => result.status));
  const debtRows = report.automationDebt.items
    .slice()
    .sort((left, right) => left.severity.localeCompare(right.severity) || left.id.localeCompare(right.id))
    .map((item) => [
      item.id,
      item.severity,
      item.category,
      item.matrixStatus,
      item.issue,
      item.missingRunnerGates.join(", "),
      escapeCell(item.reason),
    ]);
  const gateRows = report.gateResults.map((result) => [
    result.id,
    result.status,
    formatDuration(result.durationMs),
    result.exitCode === null ? "" : String(result.exitCode),
    relativeArtifact(result.logPath),
    escapeCell(result.reason ?? ""),
  ]);
  const nativeRows = [
    ["native-smoke", report.nativeSmoke.status, formatDuration(report.nativeSmoke.durationMs), report.nativeSmoke.reason ?? ""],
    ...report.nativeSmoke.checks.map((check) => [
      check.id,
      check.status,
      formatDuration(check.durationMs),
      check.reason ?? relativeArtifact(check.logPath),
    ]),
  ];
  const unresolvedRows = report.caseResults
    .filter((result) => result.status !== "pass")
    .map((result) => [
      result.id,
      result.matrixStatus,
      result.status,
      result.coverage.join(", "),
      escapeCell(result.reason),
    ]);

  return [
    "# BloomMD M1 macOS QA Report",
    "",
    `Started: ${report.startedAt}`,
    `Completed: ${report.completedAt}`,
    `Commit: ${report.commitSha}`,
    `Platform: ${report.platform}`,
    `Dry run: ${report.dryRun ? "yes" : "no"}`,
    "",
    "## Matrix",
    "",
    `Total cases: ${report.matrix.total}`,
    `macOS relevant: ${report.matrix.macRelevant}`,
    `Status counts: Auto ${report.matrix.byStatus.Auto}, Hybrid ${report.matrix.byStatus.Hybrid}, Manual ${report.matrix.byStatus.Manual}, Gap ${report.matrix.byStatus.Gap}`,
    "",
    "## Case Result Summary",
    "",
    markdownTable(
      Object.entries(caseCounts)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([status, count]) => [status, String(count)])
        .toSpliced(0, 0, ["Result", "Count"]),
    ),
    "",
    "## Automation Debt",
    "",
    `Target: Auto ${report.automationDebt.target.autoMin}-${report.automationDebt.target.autoMax} / 108, Gap <= ${report.automationDebt.target.gapMax}, Manual <= ${report.automationDebt.target.manualMax}, Hybrid ${report.automationDebt.target.hybridMin}-${report.automationDebt.target.hybridMax} / 108`,
    `Debt counts: P0 ${report.automationDebt.bySeverity.P0}, P1 ${report.automationDebt.bySeverity.P1}, P2 ${report.automationDebt.bySeverity.P2}`,
    report.automationDebt.targetViolations.length > 0
      ? `Target violations: ${report.automationDebt.targetViolations.join("; ")}`
      : "Target violations: none",
    "",
    markdownTable([["ID", "Severity", "Category", "Matrix", "Issue", "Missing Gates", "Reason"], ...debtRows]),
    "",
    "## Gate Results",
    "",
    markdownTable([["Gate", "Status", "Duration", "Exit", "Log", "Reason"], ...gateRows]),
    "",
    "## Native Smoke",
    "",
    markdownTable([["Check", "Status", "Duration", "Evidence"], ...nativeRows]),
    "",
    "Screenshots:",
    "",
    ...report.nativeSmoke.screenshots.map((path) => `- ${relativeArtifact(path)}`),
    "",
    warnings.length > 0 ? "## Plan Warnings" : "",
    "",
    ...warnings.map((warning) => `- ${warning}`),
    "",
    "## Non-Pass Cases",
    "",
    markdownTable([["ID", "Matrix", "Result", "Coverage", "Reason"], ...unresolvedRows]),
    "",
  ].join("\n");
}

function renderHtmlReport(report: QaReport, warnings: string[], reportDir: string): string {
  const caseCounts = countByStatus(report.caseResults.map((result) => result.status));
  const debtRows = report.automationDebt.items
    .slice()
    .sort((left, right) => left.severity.localeCompare(right.severity) || left.id.localeCompare(right.id))
    .map((item) => [
      `<code>${escapeHtml(item.id)}</code>`,
      `<span class="pill ${item.severity === "P0" ? "status-fail" : item.severity === "P1" ? "status-partial" : "status-manual"}">${escapeHtml(item.severity)}</span>`,
      escapeHtml(item.category),
      escapeHtml(item.matrixStatus),
      escapeHtml(item.issue),
      escapeHtml(item.missingRunnerGates.join(", ")),
      escapeHtml(item.reason),
    ]);
  const gateRows = report.gateResults.map((result) => [
    `<code>${escapeHtml(result.id)}</code>`,
    `<span class="pill ${htmlStatusClass(result.status)}">${escapeHtml(result.status)}</span>`,
    escapeHtml(formatDuration(result.durationMs)),
    escapeHtml(result.exitCode === null ? "" : String(result.exitCode)),
    htmlLink(reportDir, result.logPath, "log"),
    escapeHtml(result.reason ?? ""),
  ]);
  const nativeRows = [
    [
      "<code>native-smoke</code>",
      `<span class="pill ${htmlStatusClass(report.nativeSmoke.status)}">${escapeHtml(report.nativeSmoke.status)}</span>`,
      escapeHtml(formatDuration(report.nativeSmoke.durationMs)),
      escapeHtml(report.nativeSmoke.reason ?? ""),
    ],
    ...report.nativeSmoke.checks.map((check) => [
      `<code>${escapeHtml(check.id)}</code>`,
      `<span class="pill ${htmlStatusClass(check.status)}">${escapeHtml(check.status)}</span>`,
      escapeHtml(formatDuration(check.durationMs)),
      check.reason ? escapeHtml(check.reason) : htmlLink(reportDir, check.logPath, "evidence"),
    ]),
  ];
  const nonPassRows = report.caseResults
    .filter((result) => result.status !== "pass")
    .map((result) => [
      `<code>${escapeHtml(result.id)}</code>`,
      escapeHtml(result.matrixStatus),
      `<span class="pill ${htmlStatusClass(result.status)}">${escapeHtml(result.status)}</span>`,
      escapeHtml(result.coverage.join(", ")),
      escapeHtml(result.reason),
    ]);
  const screenshots = report.nativeSmoke.screenshots
    .map((screenshot) => {
      const src = relativeReportPath(reportDir, screenshot);
      return [
        "<figure>",
        `<a href="${escapeHtml(src)}"><img src="${escapeHtml(src)}" alt="${escapeHtml(src)}"></a>`,
        `<figcaption>${escapeHtml(src)}</figcaption>`,
        "</figure>",
      ].join("");
    })
    .join("\n");

  return [
    "<!doctype html>",
    '<html lang="de">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    "<title>BloomMD M1 macOS QA Report</title>",
    "<style>",
    ":root{color-scheme:light dark;--bg:#f7f7f4;--panel:#fff;--ink:#1a1a1a;--muted:#666;--line:#dedbd2;--accent:#ff6b35}",
    "@media(prefers-color-scheme:dark){:root{--bg:#151515;--panel:#202020;--ink:#f4f1eb;--muted:#b8b3aa;--line:#3a3833}}",
    "body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.45 system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}",
    "main{max-width:1180px;margin:0 auto;padding:32px 24px 48px}",
    "h1{font-size:30px;line-height:1.1;margin:0 0 10px}h2{margin:30px 0 12px;font-size:18px}",
    ".meta,.cards{display:grid;gap:10px}.meta{grid-template-columns:repeat(auto-fit,minmax(220px,1fr));margin:18px 0 22px}",
    ".card{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:14px}.label{color:var(--muted);font-size:12px}.value{font-weight:650;margin-top:3px}",
    "table{width:100%;border-collapse:collapse;background:var(--panel);border:1px solid var(--line);border-radius:8px;overflow:hidden;margin:0 0 20px}",
    "th,td{padding:8px 10px;border-bottom:1px solid var(--line);vertical-align:top;text-align:left}th{font-size:12px;color:var(--muted);font-weight:650}tr:last-child td{border-bottom:0}",
    "code{font-family:'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px}.pill{display:inline-block;border-radius:999px;padding:2px 8px;font-size:12px;font-weight:700}",
    ".status-pass{background:#d9f5df;color:#145c24}.status-fail{background:#ffd8d4;color:#8a1f13}.status-partial{background:#fff0c2;color:#6a4a00}.status-manual{background:#e4edff;color:#214f9a}.status-gap{background:#f2d9ff;color:#673084}.status-skipped{background:#ececea;color:#555}",
    "a{color:var(--accent);text-decoration:none}a:hover{text-decoration:underline}.screens{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px}",
    "figure{margin:0;background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:10px}img{width:100%;height:auto;border-radius:6px;border:1px solid var(--line)}figcaption{color:var(--muted);font-size:12px;margin-top:6px;word-break:break-all}",
    "</style>",
    "</head>",
    "<body><main>",
    "<h1>BloomMD M1 macOS QA Report</h1>",
    `<p>${escapeHtml(report.completedAt)} · Commit <code>${escapeHtml(report.commitSha)}</code></p>`,
    '<section class="meta">',
    `<div class="card"><div class="label">Platform</div><div class="value">${escapeHtml(report.platform)}</div></div>`,
    `<div class="card"><div class="label">Dry run</div><div class="value">${report.dryRun ? "yes" : "no"}</div></div>`,
    `<div class="card"><div class="label">Cases</div><div class="value">${report.matrix.total} total · ${report.matrix.macRelevant} macOS</div></div>`,
    `<div class="card"><div class="label">Matrix</div><div class="value">Auto ${report.matrix.byStatus.Auto} · Hybrid ${report.matrix.byStatus.Hybrid} · Manual ${report.matrix.byStatus.Manual} · Gap ${report.matrix.byStatus.Gap}</div></div>`,
    `<div class="card"><div class="label">Automation Debt</div><div class="value">P0 ${report.automationDebt.bySeverity.P0} · P1 ${report.automationDebt.bySeverity.P1} · P2 ${report.automationDebt.bySeverity.P2}</div></div>`,
    "</section>",
    "<h2>Case Result Summary</h2>",
    htmlTable(
      ["Result", "Count"],
      Object.entries(caseCounts)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([status, count]) => [
          `<span class="pill ${htmlStatusClass(status)}">${escapeHtml(status)}</span>`,
          escapeHtml(String(count)),
        ]),
    ),
    "<h2>Automation Debt</h2>",
    `<p>Target: Auto ${report.automationDebt.target.autoMin}-${report.automationDebt.target.autoMax} / 108, Gap &le; ${report.automationDebt.target.gapMax}, Manual &le; ${report.automationDebt.target.manualMax}, Hybrid ${report.automationDebt.target.hybridMin}-${report.automationDebt.target.hybridMax} / 108</p>`,
    report.automationDebt.targetViolations.length > 0
      ? `<p><strong>Target violations:</strong> ${escapeHtml(report.automationDebt.targetViolations.join("; "))}</p>`
      : "<p><strong>Target violations:</strong> none</p>",
    htmlTable(["ID", "Severity", "Category", "Matrix", "Issue", "Missing Gates", "Reason"], debtRows),
    "<h2>Gate Results</h2>",
    htmlTable(["Gate", "Status", "Duration", "Exit", "Log", "Reason"], gateRows),
    "<h2>Native Smoke</h2>",
    htmlTable(["Check", "Status", "Duration", "Evidence"], nativeRows),
    report.nativeSmoke.screenshots.length > 0 ? '<h2>Screenshots</h2><section class="screens">' : "",
    screenshots,
    report.nativeSmoke.screenshots.length > 0 ? "</section>" : "",
    warnings.length > 0 ? "<h2>Plan Warnings</h2>" : "",
    warnings.length > 0 ? `<ul>${warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("")}</ul>` : "",
    "<h2>Non-Pass Cases</h2>",
    htmlTable(["ID", "Matrix", "Result", "Coverage", "Reason"], nonPassRows),
    "</main></body></html>",
  ].join("\n");
}

async function writeReport(report: QaReport, warnings: string[], reportDir: string, options: RunnerOptions): Promise<void> {
  const jsonPath = join(reportDir, "report.json");
  const markdownPath = join(reportDir, "report.md");
  await writeFile(jsonPath, JSON.stringify(report, null, 2), "utf8");
  await writeFile(markdownPath, renderMarkdownReport(report, warnings), "utf8");
  if (options.generateHtml) {
    await writeFile(join(reportDir, "report.html"), renderHtmlReport(report, warnings, reportDir), "utf8");
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const startedAt = new Date().toISOString();
  const reportDir = join(options.reportRoot, timestamp());
  const logsDir = join(reportDir, "logs");
  const screenshotsDir = join(reportDir, "screenshots");
  const fixturesDir = join(reportDir, "fixtures");

  await rm(reportDir, { recursive: true, force: true });
  await mkdir(logsDir, { recursive: true });
  await mkdir(screenshotsDir, { recursive: true });
  await mkdir(fixturesDir, { recursive: true });

  const [matrixCases, planGates] = await Promise.all([readUiMatrix(), readM1PlanGates()]);
  const matrixSummary = summarizeMatrix(matrixCases);
  const commitSha = await getCommitSha(logsDir, options);
  const gateResults = await runReleaseGates(options, logsDir);
  const nativeSmoke = await runNativeSmoke(options, logsDir, screenshotsDir, fixturesDir);
  const caseResults = evaluateCases(matrixCases, gateResults, nativeSmoke);
  const automationDebt = buildAutomationDebt(caseResults, options.targets);
  const warnings = planGateWarnings(planGates);

  const report: QaReport = {
    startedAt,
    completedAt: new Date().toISOString(),
    platform: platform(),
    dryRun: options.dryRun,
    commitSha,
    reportDir,
    matrix: {
      total: matrixSummary.total,
      macRelevant: matrixCases.filter(isMacRelevant).length,
      byStatus: matrixSummary.byStatus,
    },
    planGates,
    gateResults,
    nativeSmoke,
    caseResults,
    automationDebt,
  };

  await writeReport(report, warnings, reportDir, options);

  const failedGates = gateResults.filter((result) => result.status === "fail");
  const failedCases = caseResults.filter((result) => result.status === "fail");
  const failedTargets = options.enforceTargets ? report.automationDebt.targetViolations : [];
  console.log(`qa:m1:mac report: ${relativeArtifact(join(reportDir, "report.md"))}`);
  if (options.generateHtml) console.log(`qa:m1:mac html: ${relativeArtifact(join(reportDir, "report.html"))}`);
  console.log(`qa:m1:mac cases: ${matrixSummary.total} total, ${report.matrix.macRelevant} macOS-relevant`);
  console.log(`qa:m1:mac failures: ${failedGates.length} gates, ${failedCases.length} cases`);
  if (failedTargets.length > 0) console.log(`qa:m1:mac target failures: ${failedTargets.join("; ")}`);

  if (failedGates.length > 0 || failedCases.length > 0 || failedTargets.length > 0) {
    process.exitCode = 1;
  }
}

await main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
