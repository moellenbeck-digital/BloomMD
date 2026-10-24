import { NextResponse } from "next/server";
import { getApiRequestIdentity } from "../../../../../lib/auth";
import { getWorkspaceForUser, getWorkspaceInvitationPreviewById, inviteWorkspaceMember, listWorkspaceInvitations, normalizeUuid } from "../../../../../lib/db";
import { sendWorkspaceInvitationEmail } from "../../../../../lib/email";
import type { AuthLocale } from "../../../../../lib/auth-copy";
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
    const invitations = await listWorkspaceInvitations(userId, workspaceId);
    return NextResponse.json({ invitations });
  } catch (error) {
    return workspaceErrorResponse(error, "Workspace invitations could not be loaded.");
  }
}

export async function POST(request: Request, { params }: RouteParams) {
  const identity = await getApiRequestIdentity(request);
  const userId = normalizeUuid(identity?.userId);
  const { workspaceId } = await params;
  if (!identity || !userId) return NextResponse.json({ error: "A cloud session is required." }, { status: 401 });
  try {
    assertSameOriginForIdentity(request, identity);
    await assertRateLimit(request, { action: "workspace-invite", identifier: identity.email ?? userId, limit: 20, windowMs: 60 * 60 * 1000 });
    const body = await readJsonBody<{ email?: string; role?: "editor" | "viewer"; locale?: AuthLocale }>(request, 16 * 1024);
    if (typeof body.email !== "string") return NextResponse.json({ error: "email is required" }, { status: 400 });
    const result = await inviteWorkspaceMember({ userId, workspaceId, email: body.email, role: body.role });
    const workspace = await getWorkspaceForUser(userId, workspaceId);
    const preview = await getWorkspaceInvitationPreviewById(result.invitation.id);
    const mail = await sendWorkspaceInvitationEmail({
      email: result.invitation.email,
      workspaceName: workspace.name,
      role: result.invitation.role === "viewer" ? "viewer" : "editor",
      token: result.token,
      expiresAt: result.invitation.expiresAt,
      inviterName: preview?.inviterName ?? identity.name,
      inviterEmail: preview?.inviterEmail ?? identity.email,
      locale: body.locale === "en" ? "en" : "de",
    });
    return NextResponse.json({ invitation: result.invitation, emailSent: mail.sent }, { status: 201 });
  } catch (error) {
    return workspaceErrorResponse(error, "Workspace invitation could not be created.");
  }
}
