import { NextResponse } from "next/server";
import { authenticateWorkspaceAgent } from "../../../../../lib/db";
import { assertRateLimit } from "../../../../../lib/request-security";
import { readWorkspaceAgentBearerToken } from "../../../../../lib/workspace-agent-auth";

export async function GET(request: Request) {
  const token = readWorkspaceAgentBearerToken(request);
  if (!token) return NextResponse.json({ error: "A workspace agent token is required." }, { status: 401 });
  try {
    const agent = await authenticateWorkspaceAgent(token);
    await assertRateLimit(request, { action: "workspace-agent-status", identifier: agent.id, limit: 120, windowMs: 60 * 60 * 1000 });
    return NextResponse.json({ agent });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Workspace agent status could not be read." }, { status: 401 });
  }
}
