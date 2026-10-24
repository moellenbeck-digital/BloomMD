import { NextResponse } from "next/server";
import { authenticateWorkspaceAgent, failWorkspaceAgentTaskByAgent } from "../../../../../../../lib/db";
import { assertRateLimit, readJsonBody } from "../../../../../../../lib/request-security";
import { readWorkspaceAgentBearerToken } from "../../../../../../../lib/workspace-agent-auth";

interface RouteParams { params: Promise<{ taskId: string }>; }

export async function POST(request: Request, { params }: RouteParams) {
  const token = readWorkspaceAgentBearerToken(request);
  if (!token) return NextResponse.json({ error: "A workspace agent token is required." }, { status: 401 });
  try {
    const agent = await authenticateWorkspaceAgent(token);
    await assertRateLimit(request, { action: "workspace-agent-fail", identifier: agent.id, limit: 60, windowMs: 60 * 60 * 1000 });
    const body = await readJsonBody<{ failureCode?: string }>(request, 16 * 1024);
    const { taskId } = await params;
    const failed = await failWorkspaceAgentTaskByAgent({ agent, taskId, failureCode: body.failureCode ?? "AGENT_TASK_FAILED" });
    return NextResponse.json({ status: failed ? "failed" : "unavailable" }, { status: failed ? 200 : 404 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Agent task could not be failed." }, { status: 400 });
  }
}
