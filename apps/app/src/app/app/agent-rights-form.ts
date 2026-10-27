/** Form logic of the agent rights editor, kept apart from the component so it can be tested. */
export type AgentAccessLevel = "read" | "propose" | "write";

export const AGENT_ACCESS_LEVELS: readonly AgentAccessLevel[] = ["read", "propose", "write"];

export interface AgentRights {
  access: AgentAccessLevel;
  areas: Record<string, AgentAccessLevel>;
}

export interface RightsRow {
  area: string;
  access: AgentAccessLevel;
}

export interface RightsDraft {
  access: AgentAccessLevel;
  rows: RightsRow[];
}

/** "Learnings / dev-team" → "Learnings/dev-team": parts trimmed, empty parts dropped. */
export function normalizeAreaName(area: string): string {
  return area.split("/").map((part) => part.trim()).filter(Boolean).join("/");
}

function areaKey(area: string): string {
  return normalizeAreaName(area).normalize("NFC").toLowerCase();
}

export function draftFromRights(rights: AgentRights): RightsDraft {
  return {
    access: rights.access,
    rows: Object.entries(rights.areas).map(([area, access]) => ({ area, access })).sort((a, b) => a.area.localeCompare(b.area)),
  };
}

/**
 * The rights a draft stands for. Empty rows are ignored; a name that appears twice is refused
 * instead of silently keeping one of the two rights.
 */
export function rightsFromDraft(draft: RightsDraft): AgentRights {
  const areas: Record<string, AgentAccessLevel> = {};
  const seen = new Set<string>();
  for (const row of draft.rows) {
    const area = normalizeAreaName(row.area);
    if (!area) continue;
    if (area.length > 200) throw new Error("AREA_TOO_LONG");
    const key = areaKey(area);
    if (seen.has(key)) throw new Error(`DUPLICATE_AREA:${area}`);
    seen.add(key);
    areas[area] = row.access;
  }
  return { access: draft.access, areas };
}

export function sameRights(a: AgentRights, b: AgentRights): boolean {
  const left = Object.entries(a.areas).map(([area, access]) => `${areaKey(area)}=${access}`).sort();
  const right = Object.entries(b.areas).map(([area, access]) => `${areaKey(area)}=${access}`).sort();
  return a.access === b.access && left.length === right.length && left.every((entry, index) => entry === right[index]);
}

/** What the access level means for the owner, in one word per language. */
export function accessLabel(access: AgentAccessLevel, locale: "de" | "en"): string {
  const labels = {
    de: { read: "Nur lesen", propose: "Vorschlagen", write: "Direkt schreiben" },
    en: { read: "Read only", propose: "Propose", write: "Write directly" },
  } as const;
  return labels[locale][access];
}
