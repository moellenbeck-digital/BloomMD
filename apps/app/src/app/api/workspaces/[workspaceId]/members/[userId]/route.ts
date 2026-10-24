import { NextResponse } from "next/server";
import { getApiRequestIdentity } from "../../../../../../lib/auth";
import { changeWorkspaceMemberRole, normalizeUuid, removeWorkspaceMember } from "../../../../../../lib/db";
import { assertRateLimit, assertSameOriginForIdentity, readJsonBody } from "../../../../../../lib/request-security";
import { workspaceErrorResponse } from "../../../../../../lib/workspace-api";

interface RouteParams {
  params: Promise<{ workspaceId: string; userId: string }>;
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const identity = await getApiRequestIdentity(request);
  const actorUserId = normalizeUuid(identity?.userId);
  const { workspaceId, userId: memberUserId } = await params;
  if (!identity || !actorUserId) return NextResponse.json({ error: "A cloud session is required." }, { status: 401 });
  try {
    assertSameOriginForIdentity(request, identity);
    await assertRateLimit(request, { action: "workspace-member-role", identifier: identity.email ?? actorUserId, limit: 30, windowMs: 60 * 1000 });
    const body = await readJsonBody<{ role?: "owner" | "editor" | "viewer" }>(request, 16 * 1024);
    if (!body.role) return NextResponse.json({ error: "role is required" }, { status: 400 });
    const member = await changeWorkspaceMemberRole({ userId: actorUserId, workspaceId, memberUserId, role: body.role });
    return NextResponse.json({ member });
  } catch (error) {
    return workspaceErrorResponse(error, "Member role could not be changed.");
  }
}

export async function DELETE(request: Request, { params }: RouteParams) {
  const identity = await getApiRequestIdentity(request);
  const actorUserId = normalizeUuid(identity?.userId);
  const { workspaceId, userId: memberUserId } = await params;
  if (!identity || !actorUserId) return NextResponse.json({ error: "A cloud session is required." }, { status: 401 });
  try {
    assertSameOriginForIdentity(request, identity);
    await assertRateLimit(request, { action: "workspace-member-remove", identifier: identity.email ?? actorUserId, limit: 20, windowMs: 60 * 1000 });
    const removed = await removeWorkspaceMember({ userId: actorUserId, workspaceId, memberUserId });
    return NextResponse.json({ removed });
  } catch (error) {
    return workspaceErrorResponse(error, "Member could not be removed.");
  }
}
