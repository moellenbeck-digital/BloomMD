import { NextResponse } from "next/server";
import { getApiRequestIdentity } from "../../../../../../lib/auth";
import { normalizeUuid, revokeWorkspaceInvitation } from "../../../../../../lib/db";
import { assertRateLimit, assertSameOriginForIdentity } from "../../../../../../lib/request-security";
import { workspaceErrorResponse } from "../../../../../../lib/workspace-api";

interface RouteParams {
  params: Promise<{ workspaceId: string; invitationId: string }>;
}

export async function DELETE(request: Request, { params }: RouteParams) {
  const identity = await getApiRequestIdentity(request);
  const userId = normalizeUuid(identity?.userId);
  const { workspaceId, invitationId } = await params;
  if (!identity || !userId) return NextResponse.json({ error: "A cloud session is required." }, { status: 401 });
  try {
    assertSameOriginForIdentity(request, identity);
    await assertRateLimit(request, { action: "workspace-invite-revoke", identifier: identity.email ?? userId, limit: 30, windowMs: 60 * 60 * 1000 });
    const revoked = await revokeWorkspaceInvitation({ userId, workspaceId, invitationId });
    return NextResponse.json({ revoked });
  } catch (error) {
    return workspaceErrorResponse(error, "Workspace invitation could not be revoked.");
  }
}
