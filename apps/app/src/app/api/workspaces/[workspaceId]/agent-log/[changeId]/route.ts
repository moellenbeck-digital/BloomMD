import { NextResponse } from "next/server";
import { agentOwnerContext, agentReviewErrorResponse, undoAgentChange } from "../../../../../../lib/agent-review";
import { readJsonBody } from "../../../../../../lib/request-security";
import { workspaceErrorResponse } from "../../../../../../lib/workspace-api";

interface RouteParams {
  params: Promise<{ workspaceId: string; changeId: string }>;
}

/** POST { action: "undo" } → the owner restores the state before a change (any change, also approved ones). */
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { workspaceId, changeId } = await params;
    const context = await agentOwnerContext(request, workspaceId, { write: true });
    const body = await readJsonBody<{ action?: string }>(request, 16 * 1024);
    if (body.action !== "undo") return NextResponse.json({ error: "The action must be undo." }, { status: 400 });
    return NextResponse.json(await undoAgentChange(context.workspace.id, changeId, { kind: "owner", userId: context.userId, name: context.reviewerName }));
  } catch (error) {
    return agentReviewErrorResponse(error) ?? workspaceErrorResponse(error, "The change could not be undone.");
  }
}
