import { NextResponse } from "next/server";
import { getApiRequestIdentity } from "../../../../../lib/auth";
import { acceptWorkspaceInvitation, acceptWorkspaceInvitationById, normalizeUuid } from "../../../../../lib/db";
import { parseWorkspaceInviteHandoff } from "../../../../../lib/invite-intent";
import { assertRateLimit, assertSameOriginForIdentity } from "../../../../../lib/request-security";
import { workspaceErrorResponse } from "../../../../../lib/workspace-api";

interface RouteParams {
  params: Promise<{ token: string }>;
}

export async function POST(request: Request, { params }: RouteParams) {
  const identity = await getApiRequestIdentity(request);
  const userId = normalizeUuid(identity?.userId);
  const { token } = await params;
  if (!identity || !userId) return NextResponse.json({ error: "Sign in to accept this workspace invitation." }, { status: 401 });
  try {
    assertSameOriginForIdentity(request, identity);
    await assertRateLimit(request, { action: "workspace-invite-accept", identifier: identity.email ?? userId, limit: 10, windowMs: 60 * 60 * 1000 });
    const decodedToken = decodeURIComponent(token);
    if (decodedToken.startsWith("bloom_invite_intent_v1_") && !parseWorkspaceInviteHandoff(decodedToken)) {
      throw new Error("INVITATION_HANDOFF_INVALID");
    }
    const handoff = parseWorkspaceInviteHandoff(decodedToken);
    const result = handoff
      ? await acceptWorkspaceInvitationById({ userId, invitationId: handoff.invitationId })
      : await acceptWorkspaceInvitation({ userId, token: decodedToken });
    return NextResponse.json(result);
  } catch (error) {
    return workspaceErrorResponse(error, "Workspace invitation could not be accepted.");
  }
}
