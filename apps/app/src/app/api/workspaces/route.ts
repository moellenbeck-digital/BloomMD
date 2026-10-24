import { NextResponse } from "next/server";
import { getApiRequestIdentity } from "../../../lib/auth";
import { createTeamWorkspace, getWorkspaceForUser, listWorkspacesForUser, normalizeUuid, renameWorkspace } from "../../../lib/db";
import { assertRateLimit, assertSameOriginForIdentity, RateLimitError, readJsonBody, RequestSecurityError } from "../../../lib/request-security";

export async function GET(request: Request) {
  const identity = await getApiRequestIdentity(request);
  const userId = normalizeUuid(identity?.userId);
  if (!identity || !userId) {
    return NextResponse.json({ error: "A cloud session is required." }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const workspaces = await listWorkspacesForUser(userId);
    const requested = searchParams.get("workspaceId");
    const workspace = requested
      ? workspaces.find((item) => item.id === requested) ?? null
      : workspaces.find((item) => item.kind === "personal") ?? workspaces[0] ?? null;
    if (requested && !workspace) return NextResponse.json({ error: "Workspace not found or access denied." }, { status: 404 });
    return NextResponse.json({ workspace, workspaces });
  } catch (error) {
    console.error("[BloomMD] Workspace lookup failed:", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ error: "Workspace not found or access denied." }, { status: 404 });
  }
}

export async function POST(request: Request) {
  const identity = await getApiRequestIdentity(request);
  const userId = normalizeUuid(identity?.userId);
  if (!identity || !userId) {
    return NextResponse.json({ error: "A cloud session is required." }, { status: 401 });
  }

  try {
    assertSameOriginForIdentity(request, identity);
    await assertRateLimit(request, {
      action: "workspace-create",
      identifier: identity.email ?? userId,
      limit: 10,
      windowMs: 60 * 60 * 1000,
    });
    const body = await readJsonBody<{ name?: string }>(request, 16 * 1024);
    if (typeof body.name !== "string") return NextResponse.json({ error: "name is required" }, { status: 400 });
    const workspace = await createTeamWorkspace({ userId, name: body.name });
    return NextResponse.json({ workspace }, { status: 201 });
  } catch (error) {
    if (error instanceof RequestSecurityError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof RateLimitError) {
      return NextResponse.json({ error: error.message }, { status: 429, headers: { "Retry-After": String(error.retryAfterSeconds) } });
    }
    if (error instanceof Error && (error.message === "Workspace name is required." || error.message === "Workspace name must be 80 characters or less.")) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("[BloomMD] Team workspace creation failed:", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ error: "Team workspace could not be created." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const identity = await getApiRequestIdentity(request);
  const userId = normalizeUuid(identity?.userId);
  if (!identity || !userId) {
    return NextResponse.json({ error: "A cloud session is required." }, { status: 401 });
  }

  try {
    assertSameOriginForIdentity(request, identity);
    await assertRateLimit(request, {
      action: "workspace-rename",
      identifier: identity.email ?? userId,
      limit: 20,
      windowMs: 60 * 1000,
    });
    const body = await readJsonBody<{ workspaceId?: string | null; name?: string }>(request, 16 * 1024);
    if (typeof body.name !== "string") {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const workspace = await renameWorkspace({
      userId,
      workspaceId: body.workspaceId,
      name: body.name,
    });
    return NextResponse.json({ workspace });
  } catch (error) {
    if (error instanceof RequestSecurityError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof RateLimitError) {
      return NextResponse.json(
        { error: error.message },
        { status: 429, headers: { "Retry-After": String(error.retryAfterSeconds) } },
      );
    }
    if (error instanceof Error && (
      error.message === "Workspace name is required." ||
      error.message === "Workspace name must be 80 characters or less."
    )) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof Error && error.message === "Only workspace owners can rename a workspace.") {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    console.error("[BloomMD] Workspace rename failed:", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ error: "Workspace could not be renamed." }, { status: 500 });
  }
}
