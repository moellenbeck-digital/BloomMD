/**
 * `bloommd-wiki agent …`: run the knowledge MCP server for an agent and let the owner set its
 * rights, review proposals, read the change log and undo changes.
 */
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import type { KnowledgeAccess } from "@bloommd/core/knowledge";
import { knowledgeServerOptions, type KnowledgeTargets } from "./knowledge-mcp";
import { KnowledgeService } from "./knowledge-service";
import { CloudKnowledgeStore, readAccessConfig, VaultKnowledgeStore, writeAccessConfig, type AgentAccessConfig } from "./knowledge-store";
import { runMcpServer } from "./mcp";

export const AGENT_USAGE = `Agent-Befehle (Wissen in BloomMD-Maps ablegen):
  agent mcp --vault <ordner> [--cloud <url> --workspace <id>] [--name <agent>]
        MCP-Server für OpenClaw/Claude. Cloud-Token aus BLOOMMD_TOKEN.
  agent setup <ziel> --access <read|propose|write> [--area <Bereich>=<recht> …]
        Rechte des Agenten festlegen (Standard ohne Einstellung: propose).
  agent rights <ziel>                       Aktuelle Rechte anzeigen
  agent proposals <ziel>                    Offene Vorschläge des Agenten
  agent approve <ziel> <id> --reviewer <name>
  agent reject <ziel> <id> --reviewer <name> [--reason <text>]
  agent due <ziel> [--days <n>]             Fällige und überfällige Aufgaben (für Routinen;
                                            ohne Treffer: NO_REPLY)
  agent stale <ziel> [--days <n>]           Maps mit abgelaufenem stale_after, mit --days auch
                                            die der nächsten n Tage (ohne Treffer: NO_REPLY)
  agent log <ziel> [--limit <n>]            Änderungsprotokoll
  agent undo <ziel> <change-id>             Änderung zurücknehmen (auch freigegebene)

  <ziel> ist ein Vault-Ordner oder --cloud <url> [--workspace <id>] wie bei agent mcp
  (Rechte, Protokoll und Vorschläge des Cloud-Workspace liegen auf diesem Rechner).
  approve, undo, due, stale und log mit --cloud brauchen BLOOMMD_TOKEN.`;

export class AgentUsageError extends Error {}

const ACCESS = new Set(["read", "propose", "write"]);

function flag(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function flags(args: string[], name: string): string[] {
  return args.flatMap((value, index) => (args[index - 1] === name ? [value] : []));
}

function positional(args: string[]): string[] {
  const valued = new Set(["--vault", "--cloud", "--workspace", "--name", "--access", "--area", "--reviewer", "--limit", "--days", "--reason"]);
  return args.filter((value, index) => !value.startsWith("--") && !valued.has(args[index - 1] ?? ""));
}

function vaultService(dir: string | undefined, name = "Owner (CLI)"): KnowledgeService {
  if (!dir) throw new AgentUsageError("Ordner fehlt (oder --cloud <url>).");
  return new KnowledgeService(new VaultKnowledgeStore(resolve(dir)), name);
}

/** Where rights, log, history and proposals of a cloud workspace live on this machine. */
export function cloudStateDir(url: string, workspace: string | undefined): string {
  let host: string;
  try {
    host = new URL(url).host.replace(/[^a-z0-9.-]/gi, "_");
  } catch {
    throw new AgentUsageError(`--cloud erwartet eine URL, nicht "${url}".`);
  }
  return join(homedir(), ".bloommd", "agent-cloud", `${host}-${workspace ?? "personal"}`);
}

function cloudService(url: string, workspace: string | undefined, token: string, name: string): KnowledgeService {
  return new KnowledgeService(new CloudKnowledgeStore({ url, token, workspaceId: workspace, stateDir: cloudStateDir(url, workspace) }), name);
}

/**
 * The owner's view of a target: `--cloud <url> [--workspace <id>]` or a vault folder as the first
 * positional argument. Returns the service and the remaining positional arguments.
 */
function ownerTarget(rest: string[], params: string[]): { service: KnowledgeService; args: string[] } {
  const cloud = flag(rest, "--cloud");
  if (cloud) {
    // Rights and proposals are local files; only commands that reach the server need the token.
    return { service: cloudService(cloud, flag(rest, "--workspace"), process.env.BLOOMMD_TOKEN?.trim() ?? "", "Owner (CLI)"), args: params };
  }
  return { service: vaultService(params[0]), args: params.slice(1) };
}

export function parseAccessConfig(args: string[]): AgentAccessConfig {
  const access = flag(args, "--access");
  if (!access || !ACCESS.has(access)) throw new AgentUsageError("--access braucht read, propose oder write.");
  const areas: Record<string, KnowledgeAccess> = {};
  for (const entry of flags(args, "--area")) {
    const [area, value] = entry.split("=");
    if (!area?.trim() || !value || !ACCESS.has(value)) throw new AgentUsageError(`--area erwartet <Bereich>=<read|propose|write>, nicht "${entry}".`);
    areas[area.trim()] = value as KnowledgeAccess;
  }
  return { access: access as KnowledgeAccess, areas };
}

export async function runAgentCli(args: string[], version: string): Promise<number> {
  const [command, ...rest] = args;
  const params = positional(rest);
  switch (command) {
    case "mcp": {
      const name = flag(rest, "--name") ?? "Agent";
      const targets: KnowledgeTargets = {};
      const vault = flag(rest, "--vault");
      if (vault) targets.vault = vaultService(vault, name);
      const cloud = flag(rest, "--cloud");
      if (cloud) {
        const token = process.env.BLOOMMD_TOKEN?.trim();
        if (!token) throw new AgentUsageError("--cloud braucht ein Zugriffstoken in BLOOMMD_TOKEN (nie als Argument).");
        targets.cloud = cloudService(cloud, flag(rest, "--workspace"), token, name);
      }
      if (!targets.vault && !targets.cloud) throw new AgentUsageError("agent mcp braucht --vault <ordner> und/oder --cloud <url>.");
      await runMcpServer(knowledgeServerOptions(targets, version));
      return 0;
    }
    case "setup": {
      const { service } = ownerTarget(rest, params);
      const config = parseAccessConfig(rest);
      await writeAccessConfig(service.store.stateDir, config);
      console.log(JSON.stringify({ ok: true, rights: config }, null, 2));
      return 0;
    }
    case "rights": {
      const { service } = ownerTarget(rest, params);
      console.log(JSON.stringify(await readAccessConfig(service.store.stateDir), null, 2));
      return 0;
    }
    case "proposals": {
      const proposals = await ownerTarget(rest, params).service.proposals();
      console.log(JSON.stringify(proposals.map(({ markdown: _markdown, ...entry }) => entry), null, 2));
      return 0;
    }
    case "approve":
    case "reject": {
      const reviewer = flag(rest, "--reviewer");
      if (!reviewer?.trim()) throw new AgentUsageError("--reviewer <name> fehlt.");
      const { service, args: [id] } = ownerTarget(rest, params);
      if (!id) throw new AgentUsageError("Vorschlags-ID fehlt.");
      const result = command === "approve" ? await service.applyProposal(id, reviewer) : await service.rejectProposal(id, reviewer, flag(rest, "--reason"));
      console.log(JSON.stringify(result, null, 2));
      return 0;
    }
    case "due": {
      const days = Number(flag(rest, "--days") ?? 0);
      console.log(await dueSummary(ownerTarget(rest, params).service, Number.isFinite(days) && days >= 0 ? days : 0));
      return 0;
    }
    case "stale": {
      const days = Number(flag(rest, "--days") ?? 0);
      console.log(await staleSummary(ownerTarget(rest, params).service, Number.isInteger(days) && days >= 0 ? days : 0));
      return 0;
    }
    case "log": {
      const limit = Number(flag(rest, "--limit") ?? 20);
      console.log(JSON.stringify(await ownerTarget(rest, params).service.changes(Number.isFinite(limit) ? limit : 20), null, 2));
      return 0;
    }
    case "undo": {
      const { service, args: [changeId] } = ownerTarget(rest, params);
      if (!changeId) throw new AgentUsageError("Change-ID fehlt.");
      // The owner may undo any change, including approved proposals (the agent may not).
      console.log(JSON.stringify(await service.undo(changeId, { asOwner: true }), null, 2));
      return 0;
    }
    default:
      throw new AgentUsageError(`Unbekannter Agent-Befehl: ${command ?? "(keiner)"}\n\n${AGENT_USAGE}`);
  }
}

function isoDay(offsetDays: number, from = new Date()): string {
  const date = new Date(from.getFullYear(), from.getMonth(), from.getDate() + offsetDays);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/**
 * Open tasks due within `days` (0 = today) plus overdue ones, as a short message; `NO_REPLY` when
 * there is nothing, so a scheduled routine stays silent.
 */
export async function dueSummary(service: KnowledgeService, days: number, now = new Date()): Promise<string> {
  const today = isoDay(0, now);
  const { tasks } = await service.tasks({ dueBefore: isoDay(days, now) });
  if (tasks.length === 0) return "NO_REPLY";
  const line = (task: (typeof tasks)[number]) => `• ${task.title}${task.assignee ? ` (${task.assignee})` : ""} – ${task.mapTitle}${task.due && task.due < today ? `, seit ${task.due}` : ""}`;
  const overdue = tasks.filter((task) => task.due! < today);
  const due = tasks.filter((task) => task.due! >= today);
  return [
    "📋 BloomMD-Aufgaben",
    ...(overdue.length ? ["", `Überfällig (${overdue.length}):`, ...overdue.map(line)] : []),
    ...(due.length ? ["", days === 0 ? `Heute fällig (${due.length}):` : `Fällig bis ${isoDay(days, now)} (${due.length}):`, ...due.map(line)] : []),
  ].join("\n");
}

/**
 * Maps whose `stale_after` has passed (and, with `days`, those expiring within that many days) as
 * a short message; `NO_REPLY` when there are none, so a scheduled routine stays silent.
 */
export async function staleSummary(service: KnowledgeService, days: number, now = new Date()): Promise<string> {
  const { stale } = await service.stale({ days, now });
  if (stale.length === 0) return "NO_REPLY";
  const line = (entry: (typeof stale)[number]) => `• ${entry.title}${entry.scope ? ` (${entry.scope})` : ""} – ${entry.path}${entry.status ? `, ${entry.status}` : ""}, ${entry.daysOverdue > 0 ? `seit ${entry.stale_after} (${entry.daysOverdue} ${entry.daysOverdue === 1 ? "Tag" : "Tage"} überfällig)` : entry.daysOverdue === 0 ? "heute abgelaufen" : `läuft ab ${entry.stale_after}`}`;
  const expired = stale.filter((entry) => entry.daysOverdue >= 0);
  const expiring = stale.filter((entry) => entry.daysOverdue < 0);
  return [
    "🗂️ BloomMD-Maps zur Prüfung",
    ...(expired.length ? ["", `Abgelaufen (${expired.length}):`, ...expired.map(line)] : []),
    ...(expiring.length ? ["", `Läuft in den nächsten ${days} ${days === 1 ? "Tag" : "Tagen"} ab (${expiring.length}):`, ...expiring.map(line)] : []),
  ].join("\n");
}
