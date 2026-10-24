import { NextResponse } from "next/server";
import { getWorkspaceInvitationPreview } from "../../../../lib/db";
import { createWorkspaceInviteHandoff } from "../../../../lib/invite-intent";
import { assertRateLimit, RateLimitError } from "../../../../lib/request-security";

interface RouteParams {
  params: Promise<{ token: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  try {
    await assertRateLimit(request, { action: "workspace-invite-preview", limit: 30, windowMs: 60 * 60 * 1000 });
    const { token } = await params;
    const preview = await getWorkspaceInvitationPreview(decodeURIComponent(token));
    if (!preview) {
      return NextResponse.json({ error: "INVITATION_NOT_FOUND" }, { status: 404, headers: { "Cache-Control": "no-store" } });
    }
    const handoff = preview.status === "pending"
      ? createWorkspaceInviteHandoff({ invitationId: preview.id, expiresAt: preview.expiresAt })
      : null;
    return NextResponse.json({ invitation: preview, handoff }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof RateLimitError) {
      return NextResponse.json({ error: error.message }, { status: 429, headers: { "Retry-After": String(error.retryAfterSeconds), "Cache-Control": "no-store" } });
    }
    throw error;
  }
}
