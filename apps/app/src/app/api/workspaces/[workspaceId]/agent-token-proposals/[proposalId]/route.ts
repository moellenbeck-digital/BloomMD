import { NextResponse } from "next/server";
import { agentOwnerContext, agentReviewErrorResponse, approveAgentTokenProposal, rejectAgentTokenProposal } from "../../../../../../lib/agent-review";
import { readJsonBody } from "../../../../../../lib/request-security";
import { workspaceErrorResponse } from "../../../../../../lib/workspace-api";

interface RouteParams {
  params: Promise<{ workspaceId: string; proposalId: string }>;
}

/**
 * POST { action: "approve" | "reject", reason?, overwrite? } → the workspace owner decides about a
 * proposal. The change log names the signed-in reviewer. `overwrite` applies a proposal although
 * the map changed since (the owner has seen the difference).
 */
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { workspaceId, proposalId } = await params;
    const context = await agentOwnerContext(request, workspaceId, { write: true });
    const body = await readJsonBody<{ action?: string; reason?: unknown; overwrite?: unknown }>(request, 16 * 1024);
    if (body.action === "approve") return NextResponse.json(await approveAgentTokenProposal(context, proposalId, { overwrite: body.overwrite === true }));
    if (body.action === "reject") return NextResponse.json(await rejectAgentTokenProposal(context, proposalId, typeof body.reason === "string" ? body.reason : undefined));
    return NextResponse.json({ error: "A review action (approve or reject) is required." }, { status: 400 });
  } catch (error) {
    return agentReviewErrorResponse(error) ?? workspaceErrorResponse(error, "Agent proposal could not be reviewed.");
  }
}
