import { normalizeMarkdownFilename } from "@bloommd/core/paths";
import { signSyncTicket } from "@bloommd/core/sync-ticket";
import { NextResponse } from "next/server";
import { agentGate } from "../../../lib/agent-gate";
import { getApiRequestIdentity } from "../../../lib/auth";
import { getWorkspaceForUser, normalizeUuid, readCloudDocument } from "../../../lib/db";
import { assertRateLimit, assertSameOriginForIdentity, RateLimitError, readJsonBody, RequestSecurityError } from "../../../lib/request-security";
import { workspaceForIdentity } from "../../../lib/token-workspace";
import { buildSyncTicketWebSocketUrl } from "./sync-ticket-url";

export async function POST(request: Request) {
  const identity = await getApiRequestIdentity(request);
  const userId = normalizeUuid(identity?.userId);
  if (!userId) return NextResponse.json({ error: "A cloud session is required." }, { status: 401 });

  const syncUrl = process.env.NEXT_PUBLIC_SYNC_URL;
  const secret = process.env.BLOOMMD_SYNC_SECRET;
  if (!syncUrl || !secret) {
    return NextResponse.json({ error: "Cloud sync is not configured." }, { status: 503 });
  }

  try {
    assertSameOriginForIdentity(request, identity!);
    await assertRateLimit(request, { action: "sync-ticket", identifier: identity?.email, limit: 60, windowMs: 60 * 1000 });
    const body = await readJsonBody<{ filename?: string; workspaceId?: string }>(request, 16 * 1024);
    if (!body.filename) return NextResponse.json({ error: "filename is required" }, { status: 400 });
    // A workspace-bound token gets tickets only for its own workspaces.
    const workspace = await getWorkspaceForUser(userId, workspaceForIdentity(identity!, body.workspaceId));
    const document = await readCloudDocument(userId, normalizeMarkdownFilename(body.filename), workspace.id);
    if (!document) return NextResponse.json({ error: "Document not found." }, { status: 404 });

    // A live editing session would bypass the rights of an agent token: it edits only where it may write.
    const gate = await agentGate(identity!, workspace.id, document.filename);
    const permission = workspace.role === "viewer" || (gate && gate.access !== "write") ? "read" : "write";

    const exp = Math.floor(Date.now() / 1000) + 5 * 60;
    const ticket = signSyncTicket({
      userId,
      workspaceId: workspace.id,
      documentId: document.id,
      filename: document.filename,
      permission,
      // The sync server checks this token against the database on connect and on every message.
      ...(identity!.authKind === "access-token" && identity!.tokenId ? { tokenId: identity!.tokenId } : {}),
      exp,
    }, secret);

    return NextResponse.json({
      websocketUrl: buildSyncTicketWebSocketUrl(syncUrl, document.id, ticket),
      expiresAt: new Date(exp * 1000).toISOString(),
      permission,
      identity: {
        name: identity?.name ?? null,
        email: identity?.email ?? null,
      },
    });
  } catch (error) {
    if (error instanceof RequestSecurityError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof RateLimitError) {
      return NextResponse.json(
        { error: error.message },
        { status: 429, headers: { "Retry-After": String(error.retryAfterSeconds) } },
      );
    }
    console.error("[BloomMD] Sync ticket denied:", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ error: "Workspace access denied." }, { status: 403 });
  }
}
