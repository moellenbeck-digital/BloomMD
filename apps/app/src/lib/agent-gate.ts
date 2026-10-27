import { accessFor, cloudAreaOf, type AgentAccess } from "@bloommd/core/agent-ledger";
import { NextResponse } from "next/server";
import type { ApiRequestIdentity } from "./auth";
import { getAgentTokenRights } from "./db";

/**
 * Server-side rights of agent tokens (access tokens with an agent name). The map routes ask for
 * the right of the calling token before they change anything, so a modified client gains nothing:
 * `read` is refused, `propose` stores a proposal for the workspace owner, `write` changes the map.
 * Sessions and tokens without an agent name act as their owner and are not limited here.
 */
export interface AgentGate {
  tokenId: string;
  userId: string;
  agentName: string;
  workspaceId: string;
  filename: string;
  /** The area of the map, derived from its file name ("Learnings/dev-team"). */
  area: string;
  access: AgentAccess;
}

/** What the agent says about a change; only informational, it never decides about rights. */
export interface AgentChangeMeta {
  tool?: string;
  reason?: string;
  source?: string;
  summary?: string;
}

export function isAgentTokenIdentity(identity: ApiRequestIdentity): identity is ApiRequestIdentity & { tokenId: string; userId: string; agentName: string } {
  return identity.authKind === "access-token" && Boolean(identity.agentName && identity.tokenId && identity.userId);
}

/**
 * The right of the calling agent token for a map, read from the database on every call; null for
 * everyone else. Without a workspace no right can be looked up: an agent token then only reads.
 */
export async function agentGate(identity: ApiRequestIdentity, workspaceId: string | undefined, filename: string): Promise<AgentGate | null> {
  if (!isAgentTokenIdentity(identity)) return null;
  const area = cloudAreaOf(filename);
  if (!workspaceId) return { tokenId: identity.tokenId, userId: identity.userId, agentName: identity.agentName, workspaceId: "", filename, area, access: "read" };
  const rights = await getAgentTokenRights(identity.tokenId, workspaceId);
  return { tokenId: identity.tokenId, userId: identity.userId, agentName: identity.agentName, workspaceId, filename, area, access: accessFor(rights, area) };
}

const clip = (value: unknown, max: number) => (typeof value === "string" && value.trim() ? value.trim().slice(0, max) : undefined);

export function readAgentMeta(value: unknown): AgentChangeMeta {
  const body = (typeof value === "object" && value !== null ? value : {}) as Record<string, unknown>;
  return { tool: clip(body.tool, 80), reason: clip(body.reason, 500), source: clip(body.source, 500), summary: clip(body.summary, 300) };
}

function areaLabel(area: string) {
  return area || "(top level)";
}

function denied(gate: AgentGate, message: string, code: string) {
  return NextResponse.json({ error: message, code, area: gate.area, access: gate.access, agent: gate.agentName }, { status: 403 });
}

/** The agent may only read in this area: the change is refused. */
export function agentReadOnlyResponse(gate: AgentGate) {
  return denied(gate, `The agent "${gate.agentName}" may only read in "${areaLabel(gate.area)}". Ask the workspace owner to allow proposals or writing there.`, "AGENT_READ_ONLY");
}

/** Actions that cannot be proposed (rename, delete, share links) need the write right. */
export function agentWriteRequiredResponse(gate: AgentGate, action: string) {
  return denied(gate, `The agent "${gate.agentName}" may ${gate.access === "read" ? "only read" : "only propose changes"} in "${areaLabel(gate.area)}"; ${action} needs the right to write there. Ask the workspace owner.`, "AGENT_WRITE_REQUIRED");
}
