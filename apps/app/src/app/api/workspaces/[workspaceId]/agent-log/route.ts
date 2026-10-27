import { NextResponse } from "next/server";
import { agentOwnerContext, agentReviewErrorResponse } from "../../../../../lib/agent-review";
import { listAgentTokenChanges } from "../../../../../lib/db";
import { workspaceErrorResponse } from "../../../../../lib/workspace-api";

interface RouteParams {
  params: Promise<{ workspaceId: string }>;
}

/** GET ?tokenId=&limit= → the change log of the agent tokens in this workspace, newest first. */
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const context = await agentOwnerContext(request, (await params).workspaceId, { write: false });
    const search = new URL(request.url).searchParams;
    const limit = Number(search.get("limit") ?? 50);
    const changes = await listAgentTokenChanges({ userId: context.userId, workspaceId: context.workspace.id, tokenId: search.get("tokenId") ?? undefined, limit: Number.isFinite(limit) ? limit : 50 });
    return NextResponse.json({ workspaceId: context.workspace.id, changes });
  } catch (error) {
    return agentReviewErrorResponse(error) ?? workspaceErrorResponse(error, "The agent log could not be loaded.");
  }
}
