import { parseFile } from "@bloommd/core/parser";
import { NextResponse } from "next/server";
import type { AgentChangeMeta, AgentGate } from "./agent-gate";
import { createAgentTokenProposal, recordAgentTokenChange, type AgentTokenChangeInput } from "./db";

/** What a route does after the rights check of `agent-gate`: store a proposal or log a direct change. */
/** Stores a change as a proposal for the workspace owner and answers with 202. */
export async function agentProposalResponse(gate: AgentGate, input: { markdown: string; baseVersion: number | null; defaultSummary: string; meta: AgentChangeMeta; defaultTool: string }) {
  try {
    parseFile(gate.filename, input.markdown);
  } catch {
    return NextResponse.json({ error: "The proposed Markdown could not be parsed.", code: "INVALID_MARKDOWN" }, { status: 400 });
  }
  const proposalId = await createAgentTokenProposal({
    tokenId: gate.tokenId,
    workspaceId: gate.workspaceId,
    agentName: gate.agentName,
    tool: input.meta.tool ?? input.defaultTool,
    filename: gate.filename,
    area: gate.area,
    baseVersion: input.baseVersion,
    markdown: input.markdown,
    summary: input.meta.summary ?? input.defaultSummary,
    reason: input.meta.reason,
    source: input.meta.source,
  });
  return NextResponse.json({ mode: "proposed", proposalId, filename: gate.filename, area: gate.area }, { status: 202 });
}

/** Logs a direct change of an agent token; the returned id is the change id for undo. */
export function logAgentChange(gate: AgentGate, entry: Pick<AgentTokenChangeInput, "event" | "beforeMarkdown" | "createdMap" | "afterVersion"> & { meta: AgentChangeMeta; defaultTool: string; defaultSummary: string; filename?: string }): Promise<string> {
  return recordAgentTokenChange({
    tokenId: gate.tokenId,
    workspaceId: gate.workspaceId,
    agentName: gate.agentName,
    event: entry.event,
    origin: "agent",
    tool: entry.meta.tool ?? entry.defaultTool,
    filename: entry.filename ?? gate.filename,
    area: gate.area,
    summary: entry.meta.summary ?? entry.defaultSummary,
    reason: entry.meta.reason,
    source: entry.meta.source,
    beforeMarkdown: entry.beforeMarkdown,
    createdMap: entry.createdMap,
    afterVersion: entry.afterVersion,
  });
}
