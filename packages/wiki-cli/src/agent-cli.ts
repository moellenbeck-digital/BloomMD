/**
 * `bloommd-wiki agent …`: run the knowledge MCP server for an agent and let the owner set its
 * rights, review proposals, read the change log and undo changes.
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import type { KnowledgeAccess } from "@bloommd/core/knowledge";
import { strictAccessConfig } from "@bloommd/core/agent-ledger";
import { CloudAgentError, type CloudAgentToken } from "./cloud-agent";
import { isLearningCommand, LEARNING_USAGE, LearningCliError, runLearningCommand, type LearningDeps } from "./agent-learnings";
import { announceLegacyCloudState, describeRights, readLegacyCloudState, readMigrationMarker, takeOverRights, writeMigrationMarker } from "./cloud-migration";
import { knowledgeServerOptions, type KnowledgeTargets } from "./knowledge-mcp";
import { KnowledgeService } from "./knowledge-service";
import { CloudKnowledgeStore, readAccessConfig, VaultKnowledgeStore, writeAccessConfig, type AgentAccessConfig } from "./knowledge-store";
import { runMcpServer } from "./mcp";

export const AGENT_USAGE = `Agent-Befehle (Wissen in BloomMD-Maps ablegen):
  agent mcp --vault <ordner> [--cloud <url> --workspace <id>] [--name <agent>]
        MCP-Server für OpenClaw/Claude. Cloud-Token aus BLOOMMD_TOKEN.
  agent setup <ziel> --access <read|propose|write> [--area <Bereich>=<recht> …] [--agent <name|id>]
        Rechte des Agenten festlegen (Standard ohne Einstellung: propose). Bereiche dürfen
        Unterbereiche sein (--area Learnings/dev-team=write); der längste passende Bereich gilt.
  agent rights <ziel> [--agent <name|id>]   Aktuelle Rechte anzeigen
  agent proposals <ziel>                    Offene Vorschläge des Agenten
  agent approve <ziel> <id> [--reviewer <name>] [--overwrite]
  agent reject <ziel> <id> [--reviewer <name>] [--reason <text>]
  agent due <ziel> [--days <n>]             Fällige und überfällige Aufgaben (für Routinen;
                                            ohne Treffer: NO_REPLY)
  agent stale <ziel> [--days <n>]           Maps mit abgelaufenem stale_after, mit --days auch
                                            die der nächsten n Tage (ohne Treffer: NO_REPLY)
  agent log <ziel> [--limit <n>] [--agent <name|id>]
                                            Änderungsprotokoll
  agent undo <ziel> <change-id>             Änderung zurücknehmen (auch freigegebene)
  agent update-node <ziel> <map-pfad> <knoten-id> --patch <json|-> [--version <v>] [--reason <text>] [--source <text>]
        Einen Knoten teilweise ändern: --patch ist ein JSON-Objekt mit title, content (+ contentMode),
        kind, status, decision, due, assignee, note, citation, url, relations und/oder children (neue
        Knoten, ans Ende des Knotens); nicht genannte Felder bleiben. "-" liest das JSON von stdin.
        Gleiche Rechte und gleiches Protokoll wie bloommd_update_node: Vorschlag oder direkt.
  agent migrate <ziel> --agent <name|id> [--apply | --discard]
                                            Alte lokale Cloud-Rechte (agent.json) auf den Server
                                            übernehmen (höchstens diese Rechte) oder verwerfen

  <ziel> ist ein Vault-Ordner oder --cloud <url> [--workspace <id>] wie bei agent mcp.
  Bei --cloud liegen Rechte, Vorschläge und Protokoll je Agent-Token auf dem Server und werden dort
  erzwungen (auch im Browser unter „Agenten verwalten“ zu sehen und zu setzen). Alle Befehle mit
  --cloud brauchen BLOOMMD_TOKEN: der Besitzer-Token für setup, rights, proposals, approve, reject,
  log, undo und migrate; --agent wählt den Agent-Token (bei nur einem Agent-Token entfällt es).
  approve/reject nennen im Protokoll den Namen des angemeldeten Token-Besitzers; --reviewer gilt nur
  für Vault-Ordner. Ein Vorschlag, dessen Map sich inzwischen geändert hat, wird nur mit --overwrite
  übernommen.
  update-node mit --cloud ruft PATCH /api/mindmaps/<map>/nodes/<id> auf: mit einem Agent-Token gelten
  dessen Rechte (Vorschlag oder direkt, im Protokoll mit Agent und Quelle), mit dem Besitzer-Token
  schreibt es wie der Besitzer.

${LEARNING_USAGE}`;

export class AgentUsageError extends Error {}

export { CloudAgentError };

const ACCESS = new Set(["read", "propose", "write"]);

function flag(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function flags(args: string[], name: string): string[] {
  return args.flatMap((value, index) => (args[index - 1] === name ? [value] : []));
}

function positional(args: string[]): string[] {
  const valued = new Set(["--vault", "--cloud", "--workspace", "--name", "--access", "--area", "--reviewer", "--limit", "--days", "--reason", "--agent", "--patch", "--source", "--version"]);
  return args.filter((value, index) => !value.startsWith("--") && !valued.has(args[index - 1] ?? ""));
}

function vaultService(dir: string | undefined, name = "Owner (CLI)"): KnowledgeService {
  if (!dir) throw new AgentUsageError("Ordner fehlt (oder --cloud <url>).");
  return new KnowledgeService(new VaultKnowledgeStore(resolve(dir)), name);
}

/** Where the requests of a cloud workspace (and the old local rights, see `cloud-migration.ts`) live on this machine. */
export function cloudStateDir(url: string, workspace: string | undefined): string {
  let host: string;
  try {
    host = new URL(url).host.replace(/[^a-z0-9.-]/gi, "_");
  } catch {
    throw new AgentUsageError(`--cloud erwartet eine URL, nicht "${url}".`);
  }
  return join(process.env.HOME?.trim() || homedir(), ".bloommd", "agent-cloud", `${host}-${workspace ?? "personal"}`);
}

function cloudService(url: string, workspace: string | undefined, token: string, name: string): KnowledgeService {
  return new KnowledgeService(new CloudKnowledgeStore({ url, token, workspaceId: workspace, stateDir: cloudStateDir(url, workspace) }), name);
}

/** The `--cloud … --workspace …` part of a command, for hints. */
function cloudTarget(rest: string[]): string {
  return `--cloud ${flag(rest, "--cloud")}${flag(rest, "--workspace") ? ` --workspace ${flag(rest, "--workspace")}` : ""}`;
}

/** The first start with a cloud target announces old local rights once; stdout stays free for results and MCP. */
async function announceLegacy(rest: string[], service: KnowledgeService): Promise<void> {
  await announceLegacyCloudState(service.store.stateDir, cloudTarget(rest), (text) => process.stderr.write(text));
}

/**
 * The owner's view of a target: `--cloud <url> [--workspace <id>]` or a vault folder as the first
 * positional argument. Returns the service and the remaining positional arguments.
 */
async function ownerTarget(rest: string[], params: string[]): Promise<{ service: KnowledgeService; args: string[] }> {
  const cloud = flag(rest, "--cloud");
  if (cloud) {
    // Rights, proposals and the log are on the server; every command needs the owner's token.
    const service = cloudService(cloud, flag(rest, "--workspace"), process.env.BLOOMMD_TOKEN?.trim() ?? "", "Owner (CLI)");
    await announceLegacy(rest, service);
    return { service, args: params };
  }
  return { service: vaultService(params[0]), args: params.slice(1) };
}

/** The agent token an owner command is about: `--agent <name|id>`, or the only one in the workspace. */
async function agentToken(service: KnowledgeService, selector: string | undefined): Promise<CloudAgentToken> {
  const tokens = await service.cloudAgent().tokens();
  const listed = tokens.map((token) => `${token.agentName} (${token.tokenName}, ${token.tokenId})`).join("; ");
  if (tokens.length === 0) throw new AgentUsageError("In diesem Workspace gibt es keinen Agent-Token. Lege unter Konto → Zugriffstokens einen Token mit Agent-Namen an.");
  if (!selector) {
    if (tokens.length === 1) return tokens[0]!;
    throw new AgentUsageError(`--agent <name|id> fehlt. Agent-Tokens: ${listed}`);
  }
  const wanted = selector.trim().toLowerCase();
  const matches = tokens.filter((token) => token.tokenId === selector || token.agentName.toLowerCase() === wanted || token.tokenName.toLowerCase() === wanted);
  if (matches.length === 1) return matches[0]!;
  throw new AgentUsageError(matches.length === 0 ? `Kein Agent-Token „${selector}“. Agent-Tokens: ${listed}` : `„${selector}“ ist nicht eindeutig; nimm die ID. Agent-Tokens: ${listed}`);
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

/** Where the learning commands (`search`, `read`, `create`, `append`, `stale --json`) get their service and stdin. */
export const learningDeps: LearningDeps = {
  async open({ vault, cloud, workspace, name }) {
    if (vault) return vaultService(vault, name);
    const token = process.env.BLOOMMD_TOKEN?.trim();
    if (!token) throw new LearningCliError(2, "--cloud braucht ein Zugriffstoken in BLOOMMD_TOKEN (nie als Argument).");
    const service = cloudService(cloud!, workspace, token, name);
    await announceLegacy(["--cloud", cloud!, ...(workspace ? ["--workspace", workspace] : [])], service);
    return service;
  },
  stdin: () => readFileSync(0, "utf8"),
};

export async function runAgentCli(args: string[], version: string): Promise<number> {
  const [command, ...rest] = args;
  const params = positional(rest);
  // `agent stale <ordner>` stays the plain-text routine; with --vault or --json (and for --help) it is the JSON command.
  if (isLearningCommand(command) && (command !== "stale" || rest.some((arg) => arg === "--vault" || arg === "--json" || arg === "--help" || arg === "-h"))) {
    return runLearningCommand(command!, rest, learningDeps);
  }
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
        await announceLegacy(rest, targets.cloud);
      }
      if (!targets.vault && !targets.cloud) throw new AgentUsageError("agent mcp braucht --vault <ordner> und/oder --cloud <url>.");
      await runMcpServer(knowledgeServerOptions(targets, version));
      return 0;
    }
    case "setup": {
      const { service } = await ownerTarget(rest, params);
      const config = parseAccessConfig(rest);
      if (service.store.kind === "cloud") {
        const token = await agentToken(service, flag(rest, "--agent"));
        console.log(JSON.stringify({ ok: true, agent: token.agentName, tokenId: token.tokenId, rights: await service.cloudAgent().setRights(token.tokenId, config) }, null, 2));
        return 0;
      }
      await writeAccessConfig(service.store.stateDir, config);
      console.log(JSON.stringify({ ok: true, rights: config }, null, 2));
      return 0;
    }
    case "rights": {
      const { service } = await ownerTarget(rest, params);
      if (service.store.kind === "cloud") {
        const selector = flag(rest, "--agent");
        const tokens = (await service.cloudAgent().tokens()).filter((token) => !selector || token.tokenId === selector || token.agentName.toLowerCase() === selector.trim().toLowerCase());
        console.log(JSON.stringify(tokens.map(({ tokenId, tokenName, agentName, scope, configured, rights }) => ({ agent: agentName, tokenId, tokenName, scope, configured, rights })), null, 2));
        return 0;
      }
      console.log(JSON.stringify(await readAccessConfig(service.store.stateDir), null, 2));
      return 0;
    }
    case "proposals": {
      console.log(JSON.stringify(await (await ownerTarget(rest, params)).service.listProposals(), null, 2));
      return 0;
    }
    case "approve":
    case "reject": {
      const { service, args: [id] } = await ownerTarget(rest, params);
      const reviewer = flag(rest, "--reviewer");
      // A vault has no accounts: the owner names themselves. In the cloud the server names the signed-in owner.
      if (service.store.kind !== "cloud" && !reviewer?.trim()) throw new AgentUsageError("--reviewer <name> fehlt.");
      if (!id) throw new AgentUsageError("Vorschlags-ID fehlt.");
      const result = command === "approve" ? await service.applyProposal(id, reviewer ?? "", { overwrite: rest.includes("--overwrite") }) : await service.rejectProposal(id, reviewer ?? "", flag(rest, "--reason"));
      console.log(JSON.stringify(result, null, 2));
      return 0;
    }
    case "migrate":
      return runMigrate(rest, params);
    case "due": {
      const days = Number(flag(rest, "--days") ?? 0);
      console.log(await dueSummary((await ownerTarget(rest, params)).service, Number.isFinite(days) && days >= 0 ? days : 0));
      return 0;
    }
    case "stale": {
      const days = Number(flag(rest, "--days") ?? 0);
      console.log(await staleSummary((await ownerTarget(rest, params)).service, Number.isInteger(days) && days >= 0 ? days : 0));
      return 0;
    }
    case "log": {
      const limit = Number(flag(rest, "--limit") ?? 20);
      const { service } = await ownerTarget(rest, params);
      const count = Number.isFinite(limit) ? limit : 20;
      if (service.store.kind === "cloud") {
        const selector = flag(rest, "--agent");
        const tokenId = selector ? (await agentToken(service, selector)).tokenId : undefined;
        console.log(JSON.stringify(await service.ownerChanges(count, tokenId), null, 2));
        return 0;
      }
      console.log(JSON.stringify(await service.changes(count), null, 2));
      return 0;
    }
    case "undo": {
      const { service, args: [changeId] } = await ownerTarget(rest, params);
      if (!changeId) throw new AgentUsageError("Change-ID fehlt.");
      // The owner may undo any change, including approved proposals (the agent may not).
      console.log(JSON.stringify(await service.undo(changeId, { asOwner: true }), null, 2));
      return 0;
    }
    case "update-node": {
      const { service, args: [path, nodeId] } = await ownerTarget(rest, params);
      if (!path || !nodeId) throw new AgentUsageError("update-node braucht <map-pfad> und <knoten-id>.");
      const raw = flag(rest, "--patch");
      if (!raw) throw new AgentUsageError("--patch <json> fehlt (oder - für stdin).");
      let patch: unknown;
      try {
        patch = JSON.parse(raw === "-" ? readFileSync(0, "utf8") : raw);
      } catch {
        throw new AgentUsageError("--patch ist kein gültiges JSON.");
      }
      console.log(JSON.stringify(await service.updateNode({ path, nodeId, patch, version: flag(rest, "--version"), reason: flag(rest, "--reason"), source: flag(rest, "--source") }), null, 2));
      return 0;
    }
    default:
      throw new AgentUsageError(`Unbekannter Agent-Befehl: ${command ?? "(keiner)"}\n\n${AGENT_USAGE}`);
  }
}

/**
 * `agent migrate --cloud … --agent <name> [--apply | --discard]`: decides about the rights an agent had
 * in `agent.json` before they moved to the server. Without a flag nothing changes. `--apply` sets
 * exactly the old local rights, only for an agent token whose rights the owner has not set yet;
 * `--discard` keeps the server's rights. Local log and proposals stay where they are.
 */
async function runMigrate(rest: string[], params: string[]): Promise<number> {
  if (!flag(rest, "--cloud")) throw new AgentUsageError("agent migrate gilt nur für --cloud <url> [--workspace <id>].");
  const apply = rest.includes("--apply");
  const discard = rest.includes("--discard");
  if (apply && discard) throw new AgentUsageError("--apply und --discard schließen sich aus.");
  const { service } = await ownerTarget(rest, params);
  const stateDir = service.store.stateDir;
  const state = await readLegacyCloudState(stateDir);
  if (!state) {
    console.log(`Nichts zu übernehmen: ${stateDir} enthält keine lokalen Rechte, Vorschläge oder Protokolle.`);
    return 0;
  }
  const marker = await readMigrationMarker(stateDir);
  if (marker && marker.decision !== "announced") {
    console.log(`Schon entschieden (${marker.at}): ${marker.decision === "migrated" ? `lokale Rechte wurden für „${marker.agent}“ auf den Server übernommen` : "lokale Rechte wurden verworfen"}. Die Altdaten in ${stateDir} bleiben unverändert liegen.`);
    return 0;
  }
  if (!apply && !discard) {
    console.log([
      `Lokale Rechte in ${stateDir}: ${describeRights(state.rights)}.`,
      "Noch nichts geändert. Auf dem Server gilt bis dahin das dort gesetzte Recht (ohne Eintrag: propose).",
      `  --apply    setzt für den Agent-Token genau diese Rechte (nur wenn der Besitzer dort noch nichts gesetzt hat)`,
      `  --discard  verwirft die lokalen Rechte; Altdaten bleiben liegen`,
    ].join("\n"));
    return 0;
  }
  if (discard) {
    await writeMigrationMarker(stateDir, "discarded");
    console.log(`Verworfen: Die lokalen Rechte (${describeRights(state.rights)}) gelten nicht mehr; auf dem Server gilt das dort gesetzte Recht (ohne Eintrag: propose). ${state.hasLog || state.proposals > 0 ? "Protokoll und Vorschläge in " : "Der Ordner "}${stateDir} bleiben unverändert liegen.`);
    return 0;
  }
  const token = await agentToken(service, flag(rest, "--agent"));
  if (token.configured) {
    throw new AgentUsageError(`Für „${token.agentName}“ sind auf dem Server schon Rechte gesetzt (${describeRights(token.rights)}). Sie werden nicht überschrieben, damit nichts stillschweigend erweitert wird. Ändere sie mit \`agent setup\` oder im Browser, oder verwirf die lokalen Rechte mit --discard.`);
  }
  const rights = await service.cloudAgent().setRights(token.tokenId, strictAccessConfig(takeOverRights(state.rights)));
  await writeMigrationMarker(stateDir, "migrated", token.agentName);
  console.log(`Übernommen für „${token.agentName}“: ${describeRights(rights)} (höchstens die bisherigen lokalen Rechte). ${state.hasLog || state.proposals > 0 ? "Protokoll und Vorschläge in " : "Der Ordner "}${stateDir} bleiben unverändert liegen; sie wurden nicht auf den Server übernommen.`);
  return 0;
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
