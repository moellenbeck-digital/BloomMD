import { NextResponse } from "next/server";
import { getApiRequestIdentity } from "../../../../../../lib/auth";
import { normalizeUuid, revokeWorkspaceAgent } from "../../../../../../lib/db";
import { assertRateLimit, assertSameOriginForIdentity } from "../../../../../../lib/request-security";
import { workspaceErrorResponse } from "../../../../../../lib/workspace-api";

interface RouteParams {
  params: Promise<{ workspaceId: string; agentId: string }>;
}

export async function DELETE(request: Request, { params }: RouteParams) {
  const identity = await getApiRequestIdentity(request);
  const userId = normalizeUuid(identity?.userId);
  const { workspaceId, agentId } = await params;
  if (!identity || !userId) return NextResponse.json({ error: "A cloud session is required." }, { status: 401 });
  try {
    assertSameOriginForIdentity(request, identity);
    await assertRateLimit(request, { action: "workspace-agent-revoke", identifier: identity.email ?? userId, limit: 10, windowMs: 60 * 60 * 1000 });
    const revoked = await revokeWorkspaceAgent({ userId, workspaceId, agentId });
    if (!revoked) return NextResponse.json({ error: "Workspace agent not found." }, { status: 404 });
    return NextResponse.json({ revoked: agentId });
  } catch (error) {
    return workspaceErrorResponse(error, "Workspace agent could not be revoked.");
  }
}
