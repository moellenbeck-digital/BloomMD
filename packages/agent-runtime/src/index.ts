import { spawn } from "node:child_process";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

const AGENT_CONFIG_VERSION = 1;
const TOKEN_SERVICE = "io.bloommd.workspace-agent";
const REQUEST_TIMEOUT_MS = 15_000;

interface AgentProfile {
  version: number;
  profile: string;
  serverUrl: string;
  tokenAccount: string;
}

interface PairingResponse {
  token: string;
  agent: { id: string; displayName: string; workspaceId: string };
}

interface AgentResultInput {
  summary: string;
  proposal?: {
    markdown?: string;
    nodeContent?: string;
    childNodes?: Array<{ title: string; content: string; kind: "task" | "decision" }>;
    rationale: string;
  };
}

interface ClaimedWorkspaceAgentTask {
  id: string;
  workspace: { id: string; name: string };
  command: string;
  context: {
    filename: string;
    markdown: string;
    version: number;
    node?: { id: string; title: string; path: string; content: string };
  };
}

export interface AgentRunnerOptions {
  profile: string;
  openClawBin: string;
  openClawAgentId?: string;
  workingDirectory: string;
  timeoutSeconds: number;
  reportResult?: boolean;
}

interface CronOptions {
  profile: string;
  openClawBin: string;
  workingDirectory: string;
  intervalSeconds: number;
  bloommdBin: string[];
}

interface OpenClawCronJob {
  id: string;
  declarationKey?: string;
  enabled?: boolean;
  schedule?: { kind?: string; everyMs?: number };
  state?: {
    nextRunAtMs?: number;
    lastRunAtMs?: number;
    lastRunStatus?: string;
    lastError?: string;
  };
}

export class AgentUsageError extends Error {}

function profileName(value: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(value)) {
    throw new AgentUsageError(
      "Profil muss mit Buchstabe oder Zahl beginnen und darf nur Buchstaben, Zahlen, _ und - enthalten.",
    );
  }
  return value;
}

function normalizeServerUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new AgentUsageError("Server-URL ist ungültig.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new AgentUsageError(
      "Server-URL muss mit https:// oder http:// beginnen.",
    );
  }
  if (url.pathname !== "/" || url.search || url.hash) {
    throw new AgentUsageError(
      "Server-URL darf keinen Pfad, Query-String oder Fragment enthalten.",
    );
  }
  return url.origin;
}

function configDir(): string {
  return (
    process.env.BLOOMMD_AGENT_CONFIG_DIR ??
    join(homedir(), ".config", "bloommd", "agents")
  );
}

function profilePath(profile: string): string {
  return join(configDir(), `${profile}.json`);
}

function tokenAccount(profile: string, serverUrl: string): string {
  return `${profile}@${new URL(serverUrl).host}`;
}

async function writePrivateFile(path: string, content: string): Promise<void> {
  await mkdir(configDir(), { recursive: true, mode: 0o700 });
  await writeFile(path, content, { encoding: "utf8", mode: 0o600 });
  await chmod(path, 0o600);
}

async function runCommand(
  command: string[],
  input?: string,
  cwd?: string,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const executable = command[0];
  if (!executable) throw new Error("Kein ausfuehrbares Kommando angegeben.");
  const child = spawn(executable, command.slice(1), {
    cwd,
    stdio: ["pipe", "pipe", "pipe"],
  });
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
  child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
  if (input === undefined) child.stdin.end();
  else child.stdin.end(input, "utf8");

  return await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (exitCode) => {
      resolve({
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
        exitCode: exitCode ?? 1,
      });
    });
  });
}

function testTokenPath(profile: string): string {
  return join(configDir(), `${profile}.token`);
}

async function storeToken(profile: AgentProfile, token: string): Promise<void> {
  if (process.env.BLOOMMD_AGENT_SECRET_BACKEND === "file") {
    await writePrivateFile(testTokenPath(profile.profile), `${token}\n`);
    return;
  }
  if (process.platform === "darwin") {
    const result = await runCommand([
      "security",
      "add-generic-password",
      "-U",
      "-s",
      TOKEN_SERVICE,
      "-a",
      profile.tokenAccount,
      "-w",
      token,
    ]);
    if (result.exitCode !== 0)
      throw new Error(
        `macOS-Schlüsselbund konnte das Agent-Token nicht speichern: ${result.stderr.trim() || result.stdout.trim()}`,
      );
    return;
  }
  if (process.platform === "linux") {
    const result = await runCommand(
      [
        "secret-tool",
        "store",
        "--label=BloomMD Workspace Agent",
        "service",
        TOKEN_SERVICE,
        "account",
        profile.tokenAccount,
      ],
      token,
    );
    if (result.exitCode !== 0)
      throw new Error(
        `Secret Service konnte das Agent-Token nicht speichern: ${result.stderr.trim() || result.stdout.trim()}`,
      );
    return;
  }
  throw new Error(
    "Sicherer Token-Speicher wird auf diesem Betriebssystem noch nicht unterstützt.",
  );
}

async function readToken(profile: AgentProfile): Promise<string> {
  if (process.env.BLOOMMD_AGENT_SECRET_BACKEND === "file") {
    return (await readFile(testTokenPath(profile.profile), "utf8")).trim();
  }
  const command =
    process.platform === "darwin"
      ? [
          "security",
          "find-generic-password",
          "-s",
          TOKEN_SERVICE,
          "-a",
          profile.tokenAccount,
          "-w",
        ]
      : process.platform === "linux"
        ? [
            "secret-tool",
            "lookup",
            "service",
            TOKEN_SERVICE,
            "account",
            profile.tokenAccount,
          ]
        : null;
  if (!command)
    throw new Error(
      "Sicherer Token-Speicher wird auf diesem Betriebssystem noch nicht unterstützt.",
    );
  const result = await runCommand(command);
  const token = result.stdout.trim();
  if (result.exitCode !== 0 || !token)
    throw new Error(
      `Kein Agent-Token für Profil ${profile.profile} im sicheren Speicher gefunden.`,
    );
  return token;
}

async function removeToken(profile: AgentProfile): Promise<void> {
  if (process.env.BLOOMMD_AGENT_SECRET_BACKEND === "file") {
    await rm(testTokenPath(profile.profile), { force: true });
    return;
  }
  const command =
    process.platform === "darwin"
      ? [
          "security",
          "delete-generic-password",
          "-s",
          TOKEN_SERVICE,
          "-a",
          profile.tokenAccount,
        ]
      : process.platform === "linux"
        ? [
            "secret-tool",
            "clear",
            "service",
            TOKEN_SERVICE,
            "account",
            profile.tokenAccount,
          ]
        : null;
  if (!command)
    throw new Error(
      "Sicherer Token-Speicher wird auf diesem Betriebssystem noch nicht unterstützt.",
    );
  const result = await runCommand(command);
  if (result.exitCode !== 0)
    throw new Error(
      `Agent-Token für Profil ${profile.profile} konnte nicht entfernt werden.`,
    );
}

async function loadProfile(profileNameValue: string): Promise<AgentProfile> {
  const profile = profileName(profileNameValue);
  let data: unknown;
  try {
    data = JSON.parse(await readFile(profilePath(profile), "utf8"));
  } catch {
    throw new AgentUsageError(
      `Profil ${profile} wurde nicht gefunden. Zuerst: bloommd-agent pair ...`,
    );
  }
  if (
    !data ||
    typeof data !== "object" ||
    (data as Partial<AgentProfile>).version !== AGENT_CONFIG_VERSION ||
    (data as Partial<AgentProfile>).profile !== profile ||
    typeof (data as Partial<AgentProfile>).serverUrl !== "string" ||
    typeof (data as Partial<AgentProfile>).tokenAccount !== "string"
  ) {
    throw new Error(`Profil ${profile} ist ungültig.`);
  }
  return data as AgentProfile;
}

async function api<T>(
  profile: AgentProfile,
  path: string,
  init: RequestInit = {},
): Promise<{ status: number; body: T | null }> {
  const token = await readToken(profile);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${profile.serverUrl}${path}`, {
      ...init,
      headers: { authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
      signal: controller.signal,
    });
    const body =
      response.status === 204 ? null : ((await response.json()) as T);
    if (!response.ok) {
      const message =
        body &&
        typeof body === "object" &&
        "error" in body &&
        typeof (body as { error?: unknown }).error === "string"
          ? (body as { error: string }).error
          : `HTTP ${response.status}`;
      throw new Error(`BloomMD-Aufruf fehlgeschlagen: ${message}`);
    }
    return { status: response.status, body };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Keeps one outgoing SSE connection to BloomMD. It carries no task content; a normal authenticated
 * claim is still required before a model turn can start. Callers reconnect on failure and retain a
 * low-frequency polling fallback for networks that do not permit streaming responses.
 */
export async function listenForWorkspaceAgentTasks(options: {
  profile: string;
  signal: AbortSignal;
  onTaskAvailable: () => void;
  /** Called once the authenticated SSE stream is established. */
  onConnected?: () => void;
}): Promise<void> {
  const profile = await loadProfile(options.profile);
  const token = await readToken(profile);
  const response = await fetch(`${profile.serverUrl}/api/agent/v1/events`, {
    headers: { authorization: `Bearer ${token}`, accept: "text/event-stream" },
    signal: options.signal,
  });
  if (!response.ok || !response.body)
    throw new Error(
      `BloomMD-Echtzeitverbindung fehlgeschlagen: HTTP ${response.status}`,
    );
  options.onConnected?.();
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffered = "";
  try {
    while (!options.signal.aborted) {
      const chunk = await reader.read();
      if (chunk.done) return;
      buffered += decoder.decode(chunk.value, { stream: true });
      const frames = buffered.split("\n\n");
      buffered = frames.pop() ?? "";
      for (const frame of frames) {
        if (frame.split("\n").some((line) => line === "event: task-available"))
          options.onTaskAvailable();
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function openClawSessionId(taskId: string): string {
  return `bloommd-workspace-task-${taskId}`;
}

function positiveInteger(value: string, flag: string, maximum: number): number {
  if (!/^\d+$/.test(value))
    throw new AgentUsageError(`${flag} muss eine ganze Zahl sein.`);
  const parsed = Number(value);
  if (parsed < 1 || parsed > maximum)
    throw new AgentUsageError(`${flag} muss zwischen 1 und ${maximum} liegen.`);
  return parsed;
}

function runnerPrompt(task: ClaimedWorkspaceAgentTask): string {
  return `You are a local BloomMD workspace agent. A BloomMD runner has already claimed exactly one task for you.

The following task JSON is the complete authorized scope. Do not call \`agent next\`, do not inspect other files or workspaces, and do not write Markdown files directly.

${JSON.stringify(task, null, 2)}

Prepare a reviewable proposal. For a node-scoped task, use \`proposal.nodeContent\` to change the selected node and optionally \`proposal.childNodes\` to add concrete task or decision child nodes. Do not return document markdown for a node-scoped task. Reply with only this JSON object, without Markdown fences or explanation:
{
  "summary": "Short description of the prepared proposal.",
  "proposal": {
    "nodeContent": "Proposed content for the selected node only.",
    "childNodes": [{ "title": "Concrete next step", "content": "Reviewable details.", "kind": "task" }],
    "rationale": "Why this proposal helps."
  }
}

Do not submit the result yourself. Do not reveal credentials, pairing codes, or unrelated local files in your response.`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asAgentResultInput(value: unknown): AgentResultInput | null {
  if (!isRecord(value) || typeof value.summary !== "string") return null;
  if (value.proposal === undefined) return { summary: value.summary };
  if (!isRecord(value.proposal) || typeof value.proposal.rationale !== "string")
    return null;
  const { markdown, nodeContent, childNodes, rationale } = value.proposal;
  if (markdown !== undefined && typeof markdown !== "string") return null;
  if (nodeContent !== undefined && typeof nodeContent !== "string") return null;
  if (!Array.isArray(childNodes) && childNodes !== undefined) return null;
  if (childNodes?.some((child) => !isRecord(child) || typeof child.title !== "string" || typeof child.content !== "string" || (child.kind !== "task" && child.kind !== "decision"))) return null;
  return { summary: value.summary, proposal: { markdown, nodeContent, childNodes: childNodes as Array<{ title: string; content: string; kind: "task" | "decision" }> | undefined, rationale } };
}

function parseOpenClawResult(stdout: string): AgentResultInput {
  const outer: unknown = JSON.parse(stdout);
  if (isRecord(outer) && isRecord(outer.result) && Array.isArray(outer.result.payloads)) {
    const text = outer.result.payloads
      .map((payload) => (isRecord(payload) && typeof payload.text === "string" ? payload.text : null))
      .find((payload): payload is string => payload !== null);
    if (!text) throw new Error("OpenClaw hat keinen Vorschlagstext geliefert.");
    const result = asAgentResultInput(JSON.parse(text));
    if (!result) throw new Error("OpenClaw hat keinen gültigen Vorschlag geliefert.");
    return result;
  }
  const direct = asAgentResultInput(outer);
  if (direct) return direct;
  throw new Error("OpenClaw hat keine lesbare Agentenantwort geliefert.");
}

function scopeAgentResultToTask(
  task: ClaimedWorkspaceAgentTask,
  input: AgentResultInput,
): AgentResultInput {
  if (!task.context.node || !input.proposal) return input;
  const nodeContent = input.proposal.nodeContent?.trim() || input.proposal.markdown?.trim();
  if (!nodeContent) return input;
  return {
    summary: input.summary,
    proposal: {
      nodeContent,
      childNodes: input.proposal.childNodes,
      rationale: input.proposal.rationale,
    },
  };
}

async function claimNextTask(
  profile: AgentProfile,
): Promise<ClaimedWorkspaceAgentTask | null> {
  const result = await api<{ task?: ClaimedWorkspaceAgentTask }>(
    profile,
    "/api/agent/v1/tasks/next",
    { method: "POST" },
  );
  return result.body?.task ?? null;
}

async function readAgentStatus(
  profile: AgentProfile,
): Promise<{ id: string; workspaceId: string; displayName: string }> {
  const result = await api<{
    agent?: { id?: string; workspaceId?: string; displayName?: string };
  }>(profile, "/api/agent/v1/status");
  const agent = result.body?.agent;
  if (
    !agent ||
    typeof agent.id !== "string" ||
    typeof agent.workspaceId !== "string" ||
    typeof agent.displayName !== "string"
  ) {
    throw new Error("BloomMD hat keinen gültigen Agenten-Status geliefert.");
  }
  return {
    id: agent.id,
    workspaceId: agent.workspaceId,
    displayName: agent.displayName,
  };
}

async function failClaimedTask(
  profile: AgentProfile,
  taskId: string,
  failureCode: string,
): Promise<void> {
  await api(profile, `/api/agent/v1/tasks/${encodeURIComponent(taskId)}/fail`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ failureCode }),
  });
}

async function submitClaimedTaskResult(
  profile: AgentProfile,
  taskId: string,
  input: AgentResultInput,
): Promise<void> {
  if (!input.summary?.trim())
    throw new Error("OpenClaw hat keine Ergebniszusammenfassung geliefert.");
  if (
    input.proposal &&
    (!input.proposal.rationale?.trim() ||
      (!input.proposal.markdown?.trim() && !input.proposal.nodeContent?.trim() && !input.proposal.childNodes?.length))
  ) {
    throw new Error("OpenClaw hat einen ungültigen Vorschlag geliefert.");
  }
  await api(
    profile,
    `/api/agent/v1/tasks/${encodeURIComponent(taskId)}/result`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    },
  );
}

export async function runWorkspaceAgentTurn(
  options: AgentRunnerOptions,
): Promise<{ status: "idle" | "completed" | "failed"; taskId?: string }> {
  const profile = await loadProfile(options.profile);
  const task = await claimNextTask(profile);
  if (!task) {
    if (options.reportResult !== false)
      output({
        status: "idle",
        profile: profile.profile,
        message: "Keine wartende Aufgabe. Kein Modell-Turn gestartet.",
      });
    return { status: "idle" };
  }

  const taskDirectory = await mkdtemp(join(tmpdir(), "bloommd-agent-task-"));
  try {
    const promptPath = join(taskDirectory, "openclaw-prompt.md");
    const taskPath = join(taskDirectory, "task.json");
    await writeFile(promptPath, runnerPrompt(task), {
      encoding: "utf8",
      mode: 0o600,
    });
    await chmod(promptPath, 0o600);
    // A skill may need the exact, already-authorized task object as structured input. Keep it in
    // the same private, ephemeral directory as the prompt; it is deleted after this one turn and
    // never becomes part of the workspace or an OpenClaw profile.
    await writeFile(taskPath, `${JSON.stringify(task, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    await chmod(taskPath, 0o600);
    // `--local` starts an embedded Gateway and therefore conflicts with the normal local OpenClaw
    // daemon. A workspace agent should use that already-running local Gateway.
    const invocation = [
      options.openClawBin,
      "agent",
      ...(options.openClawAgentId ? ["--agent", options.openClawAgentId] : []),
      "--session-id",
      openClawSessionId(task.id),
      "--message-file",
      promptPath,
      "--timeout",
      String(options.timeoutSeconds),
      "--json",
    ];
    const result = await runCommand(
      invocation,
      undefined,
      options.workingDirectory,
    );
    if (result.exitCode !== 0) {
      await failClaimedTask(profile, task.id, "OPENCLAW_RUNNER_FAILED");
      console.error(
        `[BloomMD] OpenClaw runner failed for task ${task.id}: ${result.stderr.trim() || result.stdout.trim() || `exit ${result.exitCode}`}`,
      );
      if (options.reportResult !== false)
        output({
          status: "failed",
          profile: profile.profile,
          taskId: task.id,
          failureCode: "OPENCLAW_RUNNER_FAILED",
        });
      return { status: "failed", taskId: task.id };
    }
    const input = scopeAgentResultToTask(task, parseOpenClawResult(result.stdout));
    await submitClaimedTaskResult(profile, task.id, input);
    if (options.reportResult !== false)
      output({
        status: "completed",
        profile: profile.profile,
        taskId: task.id,
      });
    return { status: "completed", taskId: task.id };
  } catch (error) {
    try {
      await failClaimedTask(profile, task.id, "OPENCLAW_RUNNER_FAILED");
    } catch (failureError) {
      console.error(
        "[BloomMD] Claimed task could not be marked as failed:",
        failureError,
      );
    }
    throw error;
  } finally {
    await rm(taskDirectory, { recursive: true, force: true });
  }
}

function flags(args: string[]): Map<string, string> {
  const parsed = new Map<string, string>();
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (!flag?.startsWith("--"))
      throw new AgentUsageError(`Unbekanntes Argument: ${flag ?? ""}`);
    const value = args[index + 1];
    if (!value || value.startsWith("--"))
      throw new AgentUsageError(`Wert fehlt für ${flag}.`);
    if (parsed.has(flag))
      throw new AgentUsageError(`${flag} wurde mehrfach angegeben.`);
    parsed.set(flag, value);
    index += 1;
  }
  return parsed;
}

function requiredFlag(parsed: Map<string, string>, name: string): string {
  const value = parsed.get(name);
  if (!value) throw new AgentUsageError(`${name} ist erforderlich.`);
  return value;
}

function rejectUnknownFlags(
  parsed: Map<string, string>,
  allowed: string[],
): void {
  for (const flag of parsed.keys())
    if (!allowed.includes(flag))
      throw new AgentUsageError(`Unbekannte Option: ${flag}`);
}

function runnerOptions(parsed: Map<string, string>): AgentRunnerOptions {
  const profile = profileName(requiredFlag(parsed, "--profile"));
  const openClawBin = parsed.get("--openclaw-bin") ?? "openclaw";
  if (!openClawBin.trim())
    throw new AgentUsageError("--openclaw-bin darf nicht leer sein.");
  const workingDirectory = parsed.get("--working-directory") ?? process.cwd();
  const timeoutSeconds = positiveInteger(
    parsed.get("--timeout-seconds") ?? "600",
    "--timeout-seconds",
    3_600,
  );
  const openClawAgentId = parsed.get("--openclaw-agent-id");
  return {
    profile,
    openClawBin,
    ...(openClawAgentId ? { openClawAgentId } : {}),
    workingDirectory,
    timeoutSeconds,
  };
}

function cronDeclarationKey(profile: string): string {
  return `bloommd:workspace-agent:${profile}`;
}

function bloommdInvocation(override?: string): string[] {
  if (override) return [override];
  const entrypoint = process.argv[1];
  if (entrypoint && entrypoint !== process.execPath)
    return [process.execPath, entrypoint];
  return [process.execPath];
}

function cronOptions(parsed: Map<string, string>): CronOptions {
  const profile = profileName(requiredFlag(parsed, "--profile"));
  const openClawBin = parsed.get("--openclaw-bin") ?? "openclaw";
  if (!openClawBin.trim())
    throw new AgentUsageError("--openclaw-bin darf nicht leer sein.");
  const intervalSeconds = positiveInteger(
    parsed.get("--interval-seconds") ?? "60",
    "--interval-seconds",
    3_600,
  );
  if (intervalSeconds < 60)
    throw new AgentUsageError(
      "--interval-seconds muss für den OpenClaw-Cron mindestens 60 betragen.",
    );
  return {
    profile,
    openClawBin,
    workingDirectory: parsed.get("--working-directory") ?? process.cwd(),
    intervalSeconds,
    bloommdBin: bloommdInvocation(parsed.get("--bloommd-bin")),
  };
}

async function installOpenClawCron(options: CronOptions): Promise<void> {
  const profile = await loadProfile(options.profile);
  const agent = await readAgentStatus(profile);
  const commandArgv = [
    ...options.bloommdBin,
    "run",
    "--profile",
    options.profile,
  ];
  const result = await runCommand([
    options.openClawBin,
    "cron",
    "add",
    "--name",
    `BloomMD Workspace Agent (${options.profile})`,
    "--description",
    "Polls one BloomMD workspace-agent task. A model turn starts only after a task is claimed.",
    "--every",
    `${options.intervalSeconds}s`,
    "--command-argv",
    JSON.stringify(commandArgv),
    "--command-cwd",
    options.workingDirectory,
    "--no-deliver",
    "--declaration-key",
    cronDeclarationKey(options.profile),
  ]);
  if (result.exitCode !== 0)
    throw new Error(
      `OpenClaw-Cron konnte nicht installiert werden: ${result.stderr.trim() || result.stdout.trim() || `exit ${result.exitCode}`}`,
    );
  const job = await findOpenClawCron(options);
  if (!job)
    throw new Error(
      "OpenClaw-Cron wurde angelegt, konnte danach aber nicht gefunden werden.",
    );
  if (!job.enabled) {
    const enabled = await runCommand([
      options.openClawBin,
      "cron",
      "enable",
      job.id,
    ]);
    if (enabled.exitCode !== 0)
      throw new Error(
        `OpenClaw-Cron konnte nicht aktiviert werden: ${enabled.stderr.trim() || enabled.stdout.trim() || `exit ${enabled.exitCode}`}`,
      );
  }
  output({
    status: "installed",
    profile: options.profile,
    agent,
    jobId: job.id,
    declarationKey: cronDeclarationKey(options.profile),
    intervalSeconds: options.intervalSeconds,
    command: commandArgv,
  });
}

async function findOpenClawCron(
  options: CronOptions,
): Promise<OpenClawCronJob | null> {
  const result = await runCommand([
    options.openClawBin,
    "cron",
    "list",
    "--all",
    "--json",
  ]);
  if (result.exitCode !== 0)
    throw new Error(
      `OpenClaw-Cron-Status konnte nicht gelesen werden: ${result.stderr.trim() || result.stdout.trim() || `exit ${result.exitCode}`}`,
    );
  let data: { jobs?: OpenClawCronJob[] };
  try {
    data = JSON.parse(result.stdout) as { jobs?: OpenClawCronJob[] };
  } catch {
    throw new Error("OpenClaw-Cron hat keinen lesbaren JSON-Status geliefert.");
  }
  return (
    data.jobs?.find(
      (candidate) =>
        candidate.declarationKey === cronDeclarationKey(options.profile),
    ) ?? null
  );
}

async function openClawCronStatus(options: CronOptions): Promise<void> {
  await loadProfile(options.profile);
  const job = await findOpenClawCron(options);
  output(
    job
      ? {
          status: "installed",
          profile: options.profile,
          job: {
            id: job.id,
            enabled: job.enabled ?? false,
            intervalSeconds:
              job.schedule?.kind === "every" && job.schedule.everyMs
                ? job.schedule.everyMs / 1_000
                : null,
            nextRunAtMs: job.state?.nextRunAtMs ?? null,
            lastRunAtMs: job.state?.lastRunAtMs ?? null,
            lastRunStatus: job.state?.lastRunStatus ?? null,
            lastError: job.state?.lastError ?? null,
          },
        }
      : {
          status: "missing",
          profile: options.profile,
          declarationKey: cronDeclarationKey(options.profile),
        },
  );
}

async function removeOpenClawCron(options: CronOptions): Promise<void> {
  await loadProfile(options.profile);
  const job = await findOpenClawCron(options);
  if (!job) {
    output({
      status: "missing",
      profile: options.profile,
      declarationKey: cronDeclarationKey(options.profile),
    });
    return;
  }
  const result = await runCommand([options.openClawBin, "cron", "rm", job.id]);
  if (result.exitCode !== 0)
    throw new Error(
      `OpenClaw-Cron konnte nicht entfernt werden: ${result.stderr.trim() || result.stdout.trim() || `exit ${result.exitCode}`}`,
    );
  output({ status: "removed", profile: options.profile, jobId: job.id });
}

async function runAgentService(
  options: AgentRunnerOptions,
  intervalSeconds: number,
): Promise<void> {
  let active = true;
  const stop = () => {
    active = false;
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  output({
    status: "listening",
    profile: options.profile,
    intervalSeconds,
    message: "Lokaler Agent-Runner gestartet. Mit Ctrl+C beenden.",
  });
  try {
    while (active) {
      try {
        await runWorkspaceAgentTurn(options);
      } catch (error) {
        console.error("[BloomMD] Agent runner cycle failed:", error);
      }
      if (!active) break;
      await new Promise<void>((resolve) =>
        setTimeout(resolve, intervalSeconds * 1_000),
      );
    }
  } finally {
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
  }
}

function output(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

export const AGENT_USAGE = `bloommd-agent — lokaler BloomMD Workspace-Agent

Beispiele:
  bloommd-agent pair --server https://bloommd.app --profile research --pairing-code-file ./pairing-code
  bloommd-agent next --profile research
  bloommd-agent result --profile research --task <task-id> --input ./result.json
  bloommd-agent run --profile research
  bloommd-agent serve --profile research --interval-seconds 20
  bloommd-agent status --profile research
  bloommd-agent cron install --profile research --interval-seconds 60
  bloommd-agent cron status --profile research
  bloommd-agent cron remove --profile research
  bloommd-agent forget --profile research

Befehle:
  pair    Pairing-Code sicher aus Datei lesen, Token im OS-Secret-Store speichern
  next    Nächste eigene Aufgabe als JSON ausgeben; keine Aufgabe = {"task":null}
  result  Ergebnis oder Vorschlag aus einer JSON-Datei übermitteln
  fail    Aufgabe mit einem Fehlercode abschließen
  run     Genau eine wartende Aufgabe sicher an einen lokalen OpenClaw-Turn übergeben
  serve   Lokalen, stoppbaren Runner starten; ruft nur bei wartender Aufgabe ein Modell auf
  status  Lokales Pairing prüfen, ohne eine Aufgabe zu beanspruchen
  cron    OpenClaw-Command-Cron installieren, prüfen oder entfernen
  forget  Lokales Profil und zugehöriges Token löschen

Secrets:
  Pairing-Codes und Tokens niemals als CLI-Argumente übergeben. pair erwartet deshalb --pairing-code-file.
  Auf macOS wird der Schlüsselbund verwendet, auf Linux der Secret Service (libsecret).
`;

export async function runAgentCommand(args: string[]): Promise<number> {
  // Accept the old internal `agent` prefix during the migration. The standalone binary does not
  // need it, while the compatibility path keeps existing automation from failing abruptly.
  const commandArgs = args[0] === "agent" ? args.slice(1) : args;
  if (commandArgs.includes("-h") || commandArgs.includes("--help") || commandArgs.length === 0) {
    console.log(AGENT_USAGE);
    return 0;
  }
  const [command, ...rest] = commandArgs;

  if (command === "cron") {
    const [cronCommand, ...cronArgs] = rest;
    const parsed = flags(cronArgs);
    if (cronCommand === "install") {
      rejectUnknownFlags(parsed, [
        "--profile",
        "--interval-seconds",
        "--openclaw-bin",
        "--working-directory",
        "--bloommd-bin",
      ]);
      await installOpenClawCron(cronOptions(parsed));
      return 0;
    }
    if (cronCommand === "status") {
      rejectUnknownFlags(parsed, ["--profile", "--openclaw-bin"]);
      await openClawCronStatus(cronOptions(parsed));
      return 0;
    }
    if (cronCommand === "remove") {
      rejectUnknownFlags(parsed, ["--profile", "--openclaw-bin"]);
      await removeOpenClawCron(cronOptions(parsed));
      return 0;
    }
    throw new AgentUsageError(
      `Unbekannter Cron-Befehl: ${cronCommand ?? ""}. Verwende install, status oder remove.`,
    );
  }
  const parsed = flags(rest);

  if (command === "pair") {
    rejectUnknownFlags(parsed, [
      "--server",
      "--profile",
      "--pairing-code-file",
    ]);
    const serverUrl = normalizeServerUrl(requiredFlag(parsed, "--server"));
    const profile = profileName(requiredFlag(parsed, "--profile"));
    const pairingCode = (
      await readFile(requiredFlag(parsed, "--pairing-code-file"), "utf8")
    ).trim();
    if (!pairingCode) throw new AgentUsageError("Pairing-Code-Datei ist leer.");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(`${serverUrl}/api/agent/v1/pair`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pairingCode }),
        signal: controller.signal,
      });
      const body = (await response.json()) as Partial<PairingResponse> & {
        error?: string;
      };
      if (!response.ok || typeof body.token !== "string" || !body.agent) {
        throw new Error(
          `Pairing fehlgeschlagen: ${body.error ?? `HTTP ${response.status}`}`,
        );
      }
      const profileData: AgentProfile = {
        version: AGENT_CONFIG_VERSION,
        profile,
        serverUrl,
        tokenAccount: tokenAccount(profile, serverUrl),
      };
      await storeToken(profileData, body.token);
      await writePrivateFile(
        profilePath(profile),
        `${JSON.stringify(profileData, null, 2)}\n`,
      );
      output({ status: "paired", profile, serverUrl, agent: body.agent });
      return 0;
    } finally {
      clearTimeout(timeout);
    }
  }

  if (command === "next") {
    rejectUnknownFlags(parsed, ["--profile"]);
    const profile = await loadProfile(requiredFlag(parsed, "--profile"));
    const result = await api<{ task?: unknown }>(
      profile,
      "/api/agent/v1/tasks/next",
      { method: "POST" },
    );
    output({
      task:
        result.body && "task" in result.body
          ? (result.body.task ?? null)
          : null,
    });
    return 0;
  }

  if (command === "status") {
    rejectUnknownFlags(parsed, ["--profile"]);
    const profile = await loadProfile(requiredFlag(parsed, "--profile"));
    output({
      status: "paired",
      profile: profile.profile,
      agent: await readAgentStatus(profile),
    });
    return 0;
  }

  if (command === "run") {
    rejectUnknownFlags(parsed, [
      "--profile",
      "--openclaw-bin",
      "--openclaw-agent-id",
      "--working-directory",
      "--timeout-seconds",
    ]);
    const result = await runWorkspaceAgentTurn(runnerOptions(parsed));
    return result.status === "failed" ? 1 : 0;
  }

  if (command === "serve") {
    rejectUnknownFlags(parsed, [
      "--profile",
      "--openclaw-bin",
      "--openclaw-agent-id",
      "--working-directory",
      "--timeout-seconds",
      "--interval-seconds",
    ]);
    const options = runnerOptions(parsed);
    const intervalSeconds = positiveInteger(
      parsed.get("--interval-seconds") ?? "20",
      "--interval-seconds",
      3_600,
    );
    await runAgentService(options, intervalSeconds);
    return 0;
  }

  if (command === "result") {
    rejectUnknownFlags(parsed, ["--profile", "--task", "--input"]);
    const profile = await loadProfile(requiredFlag(parsed, "--profile"));
    const task = requiredFlag(parsed, "--task");
    const input = JSON.parse(
      await readFile(requiredFlag(parsed, "--input"), "utf8"),
    ) as Partial<AgentResultInput>;
    if (typeof input.summary !== "string" || !input.summary.trim())
      throw new AgentUsageError(
        "input.summary muss ein nichtleerer Text sein.",
      );
    if (
      input.proposal &&
      ((typeof input.proposal.markdown !== "string" &&
        typeof input.proposal.nodeContent !== "string") ||
        typeof input.proposal.rationale !== "string")
    ) {
      throw new AgentUsageError(
        "input.proposal braucht nodeContent oder markdown sowie rationale als Text.",
      );
    }
    const result = await api(
      profile,
      `/api/agent/v1/tasks/${encodeURIComponent(task)}/result`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      },
    );
    output(result.body);
    return 0;
  }

  if (command === "fail") {
    rejectUnknownFlags(parsed, ["--profile", "--task", "--code"]);
    const profile = await loadProfile(requiredFlag(parsed, "--profile"));
    const task = requiredFlag(parsed, "--task");
    const failureCode = requiredFlag(parsed, "--code");
    const result = await api(
      profile,
      `/api/agent/v1/tasks/${encodeURIComponent(task)}/fail`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ failureCode }),
      },
    );
    output(result.body);
    return 0;
  }

  if (command === "forget") {
    rejectUnknownFlags(parsed, ["--profile"]);
    const profile = await loadProfile(requiredFlag(parsed, "--profile"));
    await removeToken(profile);
    await rm(profilePath(profile.profile), { force: true });
    output({ status: "forgotten", profile: profile.profile });
    return 0;
  }

  throw new AgentUsageError(`Unbekannter Agent-Befehl: ${command ?? ""}`);
}
