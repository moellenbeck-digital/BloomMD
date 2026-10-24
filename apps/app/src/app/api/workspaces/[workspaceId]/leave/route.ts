import { NextResponse } from "next/server";
import { getApiRequestIdentity } from "../../../../../lib/auth";
import { leaveWorkspace, normalizeUuid } from "../../../../../lib/db";
import { assertRateLimit, assertSameOriginForIdentity } from "../../../../../lib/request-security";
import { workspaceErrorResponse } from "../../../../../lib/workspace-api";

interface RouteParams {
  params: Promise<{ workspaceId: string }>;
}

export async function POST(request: Request, { params }: RouteParams) {
  const identity = await getApiRequestIdentity(request);
  const userId = normalizeUuid(identity?.userId);
  const { workspaceId } = await params;
  if (!identity || !userId) return NextResponse.json({ error: "A cloud session is required." }, { status: 401 });
  try {
    assertSameOriginForIdentity(request, identity);
    await assertRateLimit(request, { action: "workspace-leave", identifier: identity.email ?? userId, limit: 10, windowMs: 60 * 60 * 1000 });
    const left = await leaveWorkspace({ userId, workspaceId });
    return NextResponse.json({ left });
  } catch (error) {
    return workspaceErrorResponse(error, "Workspace could not be left.");
  }
}
