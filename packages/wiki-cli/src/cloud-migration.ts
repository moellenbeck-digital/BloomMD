/**
 * Rights of a cloud workspace used to live in `agent.json` on the agent's machine
 * (`~/.bloommd/agent-cloud/<host>-<workspace>`); now they live on the server, per agent token.
 * Local rights are never carried over silently: the first start with a cloud target announces them
 * once, the server's rights apply until the owner confirms the takeover, and the takeover sets at
 * most what the local file allowed. Local log and proposals are never deleted.
 */
import { areaSegments, parseAccessConfig, type AgentAccessConfig } from "@bloommd/core/agent-ledger";
import { nodeStateFiles } from "./knowledge-store";

export interface LegacyCloudState {
  /** The rights of the old `agent.json`, as they applied before. */
  rights: AgentAccessConfig;
  proposals: number;
  hasLog: boolean;
}

interface MigrationMarker {
  decision: "announced" | "migrated" | "discarded";
  at: string;
  agent?: string;
}

const MARKER = "cloud-migration.json";

export async function readMigrationMarker(stateDir: string): Promise<MigrationMarker | null> {
  const raw = await nodeStateFiles(stateDir).read(MARKER);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as MigrationMarker;
  } catch {
    return null;
  }
}

export function writeMigrationMarker(stateDir: string, decision: MigrationMarker["decision"], agent?: string): Promise<void> {
  const marker: MigrationMarker = { decision, at: new Date().toISOString(), ...(agent ? { agent } : {}) };
  return nodeStateFiles(stateDir).write(MARKER, `${JSON.stringify(marker, null, 2)}\n`);
}

/** The local state from before the move to the server; null when there is nothing to decide about. */
export async function readLegacyCloudState(stateDir: string): Promise<LegacyCloudState | null> {
  const files = nodeStateFiles(stateDir);
  const raw = await files.read("agent.json");
  const proposals = (await files.list("proposals")).filter((name) => name.endsWith(".json")).length;
  const hasLog = (await files.read("agent-log.jsonl")) !== null;
  if (raw === null && proposals === 0 && !hasLog) return null;
  return { rights: parseAccessConfig(raw), proposals, hasLog };
}

export function describeRights(rights: AgentAccessConfig): string {
  const areas = Object.entries(rights.areas ?? {}).map(([area, access]) => `${area}=${access}`);
  return `Standard ${rights.access}${areas.length > 0 ? `, Bereiche: ${areas.join(", ")}` : ""}`;
}

/** The areas of local rights in the stored spelling of the server; rules that name no area are dropped. */
export function takeOverRights(rights: AgentAccessConfig): AgentAccessConfig {
  return {
    access: rights.access,
    areas: Object.fromEntries(Object.entries(rights.areas ?? {}).filter(([area]) => areaSegments(area).length > 0)),
  };
}

function oldData(state: LegacyCloudState, stateDir: string): string {
  const parts = [...(state.hasLog ? ["Protokoll"] : []), ...(state.proposals > 0 ? [`${state.proposals} offene Vorschläge`] : [])];
  return parts.length > 0
    ? `Lokale Altdaten (${parts.join(", ")}) bleiben unverändert in ${stateDir} liegen; sie werden nicht auf den Server übernommen und nicht gelöscht.`
    : `Der Ordner ${stateDir} bleibt unverändert liegen.`;
}

/** What the owner needs to know and do, in one place. `target` is the `--cloud … --workspace …` part of the command. */
export function legacyNotice(state: LegacyCloudState, stateDir: string, target: string): string {
  return [
    `Hinweis: Für diesen Cloud-Workspace liegen noch lokale Agent-Rechte auf diesem Rechner (${describeRights(state.rights)}).`,
    "Rechte, Vorschläge und Protokoll liegen jetzt auf dem Server und werden dort erzwungen. Die lokalen Rechte werden NICHT stillschweigend übernommen:",
    "bis zur Bestätigung gilt das Recht des Servers (ohne Eintrag: propose; Rechte setzt der Workspace-Besitzer im Browser oder mit `agent setup`).",
    `  Übernehmen (setzt höchstens diese lokalen Rechte, Token des Besitzers in BLOOMMD_TOKEN):  bloommd-wiki agent migrate ${target} --agent <name> --apply`,
    `  Verwerfen:                                                                               bloommd-wiki agent migrate ${target} --agent <name> --discard`,
    oldData(state, stateDir),
    "Diese Meldung erscheint nur einmal.",
  ].join("\n");
}

/** Prints the notice on the first start with a cloud target, once (also for a decision made earlier). */
export async function announceLegacyCloudState(stateDir: string, target: string, print: (text: string) => void): Promise<void> {
  if (await readMigrationMarker(stateDir)) return;
  const state = await readLegacyCloudState(stateDir);
  if (!state) return;
  print(`${legacyNotice(state, stateDir, target)}\n`);
  await writeMigrationMarker(stateDir, "announced");
}
