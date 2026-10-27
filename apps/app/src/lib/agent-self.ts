import { NextResponse } from "next/server";
import { isAgentTokenIdentity } from "./agent-gate";
import { getApiRequestIdentity } from "./auth";
import { getWorkspaceForUser, normalizeUuid } from "./db";
import { assertSameOriginForIdentity } from "./request-security";
import { workspaceForIdentity } from "./token-workspace";

function requestedWorkspace(request: Request) {
  const header = request.headers.get("X-BloomMD-Workspace-ID");
  if (header) return header;
  try {
    return new URL(request.url).searchParams.get("workspace");
  } catch {
    return null;
  }
}

/**
 * The calling token and the workspace it works in (header `X-BloomMD-Workspace-ID`, else its first
 * workspace or the personal one). `agent` is null for sessions and tokens without an agent name.
 */
export async function resolveAgentSelf(request: Request, options: { write?: boolean } = {}) {
  const identity = await getApiRequestIdentity(request);
  const userId = normalizeUuid(identity?.userId);
  if (!identity || !userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    if (options.write) assertSameOriginForIdentity(request, identity);
    const workspace = await getWorkspaceForUser(userId, workspaceForIdentity(identity, requestedWorkspace(request)));
    return { workspaceId: workspace.id, agent: isAgentTokenIdentity(identity) ? { tokenId: identity.tokenId, userId: identity.userId, agentName: identity.agentName } : null };
  } catch (error) {
    if (error instanceof Error && error.message === "Workspace not found or access denied.") return NextResponse.json({ error: error.message }, { status: 404 });
    throw error;
  }
}
