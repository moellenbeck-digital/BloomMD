import { NextResponse } from "next/server";
import { getApiRequestIdentity } from "../../../../../lib/auth";
import { listWorkspaceMembers, normalizeUuid } from "../../../../../lib/db";
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
    const members = await listWorkspaceMembers(userId, workspaceId);
    return NextResponse.json({ members });
  } catch (error) {
    return workspaceErrorResponse(error, "Workspace members could not be loaded.");
  }
}
