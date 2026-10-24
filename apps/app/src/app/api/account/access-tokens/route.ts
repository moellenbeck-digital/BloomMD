import { NextResponse } from "next/server";
import { getSession } from "../../../../lib/auth";
import { createAccessToken, normalizeUuid, revokeAccessToken } from "../../../../lib/db";
import { assertRateLimit, assertSameOrigin, RateLimitError, readJsonBody, RequestSecurityError } from "../../../../lib/request-security";

export async function POST(request: Request) {
  const session = await getSession();
  const userId = normalizeUuid(session?.userId);
  if (!session || !userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    assertSameOrigin(request);
    await assertRateLimit(request, { action: "access-token-create", identifier: session.email, limit: 10, windowMs: 60 * 60 * 1000 });
    const body = await readJsonBody<{ name?: string; expiresInDays?: number; scope?: string; workspaceIds?: unknown; agentName?: string; allowShare?: boolean }>(request, 16 * 1024);
    const name = body.name?.trim() ?? "";
    if (!name || name.length > 80) return NextResponse.json({ error: "Token name must contain 1 to 80 characters." }, { status: 400 });
    if (body.expiresInDays != null && (!Number.isInteger(body.expiresInDays) || body.expiresInDays < 1 || body.expiresInDays > 365)) {
      return NextResponse.json({ error: "Token expiry must be between 1 and 365 days." }, { status: 400 });
    }
    if (body.scope != null && body.scope !== "read" && body.scope !== "write") return NextResponse.json({ error: "Token scope must be read or write." }, { status: 400 });
    const workspaceIds = Array.isArray(body.workspaceIds) ? body.workspaceIds.filter((id): id is string => typeof id === "string").slice(0, 20) : undefined;
    if (body.agentName != null && (typeof body.agentName !== "string" || body.agentName.trim().length > 60)) return NextResponse.json({ error: "Agent name must contain at most 60 characters." }, { status: 400 });
    const result = await createAccessToken({
      userId,
      name,
      expiresInDays: body.expiresInDays,
      scope: body.scope === "read" ? "read" : "write",
      workspaceIds,
      agentName: body.agentName,
      allowShare: body.allowShare === true,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof RequestSecurityError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof RateLimitError) {
      return NextResponse.json({ error: error.message }, { status: 429, headers: { "Retry-After": String(error.retryAfterSeconds) } });
    }
    if (error instanceof Error && (error.message === "Invalid workspace id." || error.message === "Workspace not found or access denied.")) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("[BloomMD] Access token creation failed:", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ error: "Token could not be created." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const session = await getSession();
  const userId = normalizeUuid(session?.userId);
  if (!session || !userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    assertSameOrigin(request);
    const body = await readJsonBody<{ tokenId?: string }>(request, 16 * 1024);
    const revoked = body.tokenId ? await revokeAccessToken(userId, body.tokenId) : false;
    return revoked
      ? NextResponse.json({ revoked: true })
      : NextResponse.json({ error: "Token not found." }, { status: 404 });
  } catch (error) {
    if (error instanceof RequestSecurityError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("[BloomMD] Access token revocation failed:", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ error: "Token could not be revoked." }, { status: 500 });
  }
}
