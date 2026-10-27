import { NextResponse } from "next/server";
import { agentOwnerContext, agentReviewErrorResponse, describeProposal } from "../../../../../lib/agent-review";
import { listAgentTokenProposals } from "../../../../../lib/db";
import { workspaceErrorResponse } from "../../../../../lib/workspace-api";

interface RouteParams {
  params: Promise<{ workspaceId: string }>;
}

/** GET ?status=pending|approved|rejected|all → proposals of agent tokens with a short outline of what they change. */
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const context = await agentOwnerContext(request, (await params).workspaceId, { write: false });
    const status = new URL(request.url).searchParams.get("status") ?? "pending";
    if (!["pending", "approved", "rejected", "stale", "all"].includes(status)) return NextResponse.json({ error: "Unknown status." }, { status: 400 });
    const proposals = await listAgentTokenProposals({ userId: context.userId, workspaceId: context.workspace.id, status: status as "pending" | "all" });
    return NextResponse.json({ workspaceId: context.workspace.id, proposals: await Promise.all(proposals.map((proposal) => describeProposal(context, proposal))) });
  } catch (error) {
    return agentReviewErrorResponse(error) ?? workspaceErrorResponse(error, "Agent proposals could not be loaded.");
  }
}
