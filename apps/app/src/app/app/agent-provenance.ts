export interface AgentProvenance {
  tool?: string | null;
  source?: string | null;
  reason?: string | null;
}

/**
 * What the change log says about a change besides the agent's name: where the information came
 * from, why, and through which tool. Empty parts are left out.
 */
export function provenanceParts(entry: AgentProvenance, labels: { source: string; via: string }): string[] {
  return [
    entry.source?.trim() ? `${labels.source}: ${entry.source.trim()}` : "",
    entry.reason?.trim() ? `„${entry.reason.trim()}“` : "",
    entry.tool?.trim() ? `${labels.via} ${entry.tool.trim()}` : "",
  ].filter(Boolean);
}
