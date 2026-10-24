import { NextResponse } from "next/server";
import { getApiRequestIdentity } from "../../../../../lib/auth";
import { addWorkspaceAgent, listWorkspaceAgents, normalizeUuid } from "../../../../../lib/db";
import { assertRateLimit, assertSameOriginForIdentity, readJsonBody } from "../../../../../lib/request-security";
import { workspaceErrorResponse } from "../../../../../lib/workspace-api";

interface RouteParams {
  params: Promise<{ workspaceId: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  const identity = await getApiRequestIdentity(request);
  const userId = normalizeUuid(identity?.userId);
  const { workspaceId } = await params;
  if (!identity || !userId) return NextResponse.json({ error: "A cloud session is required." }, { status: 401 });
  try {
    return NextResponse.json({ agents: await listWorkspaceAgents(userId, workspaceId) });
  } catch (error) {
    return workspaceErrorResponse(error, "Workspace agents could not be loaded.");
  }
}

export async function POST(request: Request, { params }: RouteParams) {
  const identity = await getApiRequestIdentity(request);
  const userId = normalizeUuid(identity?.userId);
  const { workspaceId } = await params;
  if (!identity || !userId) return NextResponse.json({ error: "A cloud session is required." }, { status: 401 });
  try {
    assertSameOriginForIdentity(request, identity);
    await assertRateLimit(request, { action: "workspace-agent-add", identifier: identity.email ?? userId, limit: 10, windowMs: 60 * 60 * 1000 });
    const body = await readJsonBody<{ provider?: "openclaw"; displayName?: string }>(request, 16 * 1024);
    const invitation = await addWorkspaceAgent({ userId, workspaceId, provider: body.provider ?? "openclaw", displayName: body.displayName });
    return NextResponse.json(invitation, { status: 201 });
  } catch (error) {
    return workspaceErrorResponse(error, "Workspace agent could not be added.");
  }
}
