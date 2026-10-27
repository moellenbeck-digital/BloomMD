import { NextResponse } from "next/server";
import { resolveAgentSelf } from "../../../../../lib/agent-self";
import { getAgentTokenRights } from "../../../../../lib/db";

/**
 * GET → the rights of the calling agent token in its workspace, so the agent can tell its owner
 * what it may do. A token without an agent name (a person's own token) is not limited.
 */
export async function GET(request: Request) {
  const result = await resolveAgentSelf(request);
  if (result instanceof Response) return result;
  if (!result.agent) return NextResponse.json({ agent: null, workspaceId: result.workspaceId, unrestricted: true });
  return NextResponse.json({ agent: result.agent.agentName, workspaceId: result.workspaceId, unrestricted: false, rights: await getAgentTokenRights(result.agent.tokenId, result.workspaceId) });
}
