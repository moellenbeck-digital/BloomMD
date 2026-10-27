import { NextResponse } from "next/server";
import { agentReviewErrorResponse, undoAgentChange } from "../../../../../lib/agent-review";
import { resolveAgentSelf } from "../../../../../lib/agent-self";
import { readJsonBody } from "../../../../../lib/request-security";
import { workspaceErrorResponse } from "../../../../../lib/workspace-api";

/** POST { changeId } → undoes one of the agent's own direct changes within its rights. */
export async function POST(request: Request) {
  try {
    const result = await resolveAgentSelf(request, { write: true });
    if (result instanceof Response) return result;
    if (!result.agent) return NextResponse.json({ error: "Undo with an agent token only; use the workspace owner's tools for other tokens." }, { status: 403 });
    const body = await readJsonBody<{ changeId?: string }>(request, 16 * 1024);
    if (!body.changeId) return NextResponse.json({ error: "changeId is required." }, { status: 400 });
    return NextResponse.json(await undoAgentChange(result.workspaceId, body.changeId, { kind: "agent", userId: result.agent.userId, tokenId: result.agent.tokenId, agentName: result.agent.agentName }));
  } catch (error) {
    return agentReviewErrorResponse(error) ?? workspaceErrorResponse(error, "The change could not be undone.");
  }
}
