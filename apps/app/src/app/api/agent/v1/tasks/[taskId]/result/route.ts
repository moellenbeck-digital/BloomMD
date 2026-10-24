import { NextResponse } from "next/server";
import { authenticateWorkspaceAgent, completeWorkspaceAgentTaskByAgent } from "../../../../../../../lib/db";
import { assertRateLimit, readJsonBody } from "../../../../../../../lib/request-security";
import { readWorkspaceAgentBearerToken } from "../../../../../../../lib/workspace-agent-auth";

interface RouteParams { params: Promise<{ taskId: string }>; }

export async function POST(request: Request, { params }: RouteParams) {
  const token = readWorkspaceAgentBearerToken(request);
  if (!token) return NextResponse.json({ error: "A workspace agent token is required." }, { status: 401 });
  try {
    const agent = await authenticateWorkspaceAgent(token);
    await assertRateLimit(request, { action: "workspace-agent-result", identifier: agent.id, limit: 60, windowMs: 60 * 60 * 1000 });
    const body = await readJsonBody<{ summary?: string; proposal?: { markdown?: string; nodeContent?: string; childNodes?: Array<{ title?: string; content?: string; kind?: string }>; rationale?: string } }>(request, 512 * 1024);
    if (typeof body.summary !== "string") return NextResponse.json({ error: "summary is required." }, { status: 400 });
    const childNodes = body.proposal?.childNodes;
    const validChildNodes = childNodes === undefined || (
      Array.isArray(childNodes) && childNodes.length <= 12 && childNodes.every((child) =>
        typeof child?.title === "string" && typeof child.content === "string" &&
        (child.kind === "task" || child.kind === "decision"),
      )
    );
    const proposal = body.proposal && typeof body.proposal.rationale === "string" && validChildNodes && (typeof body.proposal.markdown === "string" || typeof body.proposal.nodeContent === "string" || (Array.isArray(childNodes) && childNodes.length > 0)) ? { markdown: body.proposal.markdown, nodeContent: body.proposal.nodeContent, childNodes: childNodes as Array<{ title: string; content: string; kind: "task" | "decision" }> | undefined, rationale: body.proposal.rationale } : undefined;
    if (body.proposal && !proposal) return NextResponse.json({ error: "proposal requires markdown, node content, or task/decision child nodes and rationale." }, { status: 400 });
    const { taskId } = await params;
    const result = await completeWorkspaceAgentTaskByAgent({ agent, taskId, summary: body.summary, proposal });
    return NextResponse.json({ status: result.proposalId ? "proposed" : "completed", proposalId: result.proposalId });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Agent result could not be saved." }, { status: 400 });
  }
}
