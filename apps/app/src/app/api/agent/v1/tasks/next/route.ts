import { NextResponse } from "next/server";
import { authenticateWorkspaceAgent, claimWorkspaceAgentTask } from "../../../../../../lib/db";
import { assertRateLimit } from "../../../../../../lib/request-security";
import { readWorkspaceAgentBearerToken } from "../../../../../../lib/workspace-agent-auth";

export async function POST(request: Request) {
  const token = readWorkspaceAgentBearerToken(request);
  if (!token) return NextResponse.json({ error: "A workspace agent token is required." }, { status: 401 });
  try {
    const agent = await authenticateWorkspaceAgent(token);
    await assertRateLimit(request, { action: "workspace-agent-poll", identifier: agent.id, limit: 120, windowMs: 60 * 60 * 1000 });
    const task = await claimWorkspaceAgentTask(agent);
    if (!task) return new NextResponse(null, { status: 204 });
    return NextResponse.json({ task });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Agent task could not be claimed." }, { status: 401 });
  }
}
