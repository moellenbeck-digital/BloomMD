import { NextResponse } from "next/server";
import { agentGate, agentWriteRequiredResponse } from "../../../../../lib/agent-gate";
import { getApiRequestIdentity, type ApiRequestIdentity } from "../../../../../lib/auth";
import { createShareLink, listShareLinks, revokeShareLink } from "../../../../../lib/db";
import { publicAppUrl } from "../../../../../lib/deployment";
import { getMindmapStorage } from "../../../../../lib/mindmap-storage";
import { assertRateLimit, assertSameOriginForIdentity, RateLimitError, readJsonBody, RequestSecurityError } from "../../../../../lib/request-security";

interface RouteParams {
  params: Promise<{ filename: string }>;
}

/** Agent tokens publish content outside BloomMD only when their owner allowed sharing for them. */
function mayShare(identity: ApiRequestIdentity): boolean {
  return !(identity.authKind === "access-token" && identity.agentName && !identity.tokenAllowShare);
}

async function cloudDocument(request: Request, identity: ApiRequestIdentity, filename: string) {
  const store = await getMindmapStorage(request, identity);
  const current = await store.read(filename);
  if (current.storage?.mode !== "database") return null;
  return { documentId: current.storage.documentId, workspaceId: current.storage.workspaceId, filename: current.filePath };
}

function errorResponse(error: unknown) {
  if (error instanceof RequestSecurityError) return NextResponse.json({ error: error.message }, { status: error.status });
  if (error instanceof RateLimitError) return NextResponse.json({ error: error.message }, { status: 429, headers: { "Retry-After": String(error.retryAfterSeconds) } });
  if (error instanceof Error && error.message === "This workspace is read-only.") return NextResponse.json({ error: error.message }, { status: 403 });
  if (error instanceof Error && (error.message === "Shared document not found." || error.message === "Document not found." || error.message === "Workspace not found or access denied.")) {
    return NextResponse.json({ error: "Mindmap not found." }, { status: 404 });
  }
  console.error("[BloomMD] Share link request failed:", error instanceof Error ? error.name : "unknown");
  return NextResponse.json({ error: "Share link request failed." }, { status: 500 });
}

/** GET → the read-only links of this map (no tokens; they are shown only once). */
export async function GET(request: Request, { params }: RouteParams) {
  const identity = await getApiRequestIdentity(request);
  if (!identity?.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const document = await cloudDocument(request, identity, (await params).filename);
    return NextResponse.json({ links: document ? await listShareLinks(identity.userId, document.documentId) : [] });
  } catch (error) {
    return errorResponse(error);
  }
}

/** POST → a new read-only link for people without a BloomMD account. */
export async function POST(request: Request, { params }: RouteParams) {
  const identity = await getApiRequestIdentity(request);
  if (!identity?.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    assertSameOriginForIdentity(request, identity);
    await assertRateLimit(request, { action: "share-link-create", identifier: identity.userId, limit: 30, windowMs: 60 * 60 * 1000 });
    if (!mayShare(identity)) return NextResponse.json({ error: "This agent token may not create share links. Allow sharing for it under Account → Access tokens." }, { status: 403 });
    const body = (await readJsonBody<{ expiresInDays?: number } | null>(request, 16 * 1024).catch(() => null)) ?? {};
    if (body.expiresInDays != null && (!Number.isInteger(body.expiresInDays) || body.expiresInDays < 1 || body.expiresInDays > 365)) {
      return NextResponse.json({ error: "Link expiry must be between 1 and 365 days." }, { status: 400 });
    }
    const document = await cloudDocument(request, identity, (await params).filename);
    if (!document) return NextResponse.json({ error: "Read-only links need a map in a BloomMD cloud workspace." }, { status: 400 });
    // Publishing a map outside BloomMD needs the right to write in its area.
    const gate = await agentGate(identity, document.workspaceId, document.filename);
    if (gate && gate.access !== "write") return agentWriteRequiredResponse(gate, "creating a share link");
    const link = await createShareLink({ userId: identity.userId, documentId: document.documentId, expiresInDays: body.expiresInDays, tokenId: identity.tokenId, agentName: identity.agentName });
    return NextResponse.json({ id: link.id, url: `${publicAppUrl().replace(/\/+$/, "")}/share/${link.token}`, createdAt: link.createdAt, expiresAt: link.expiresAt }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

/** DELETE { id } → the link stops working immediately. */
export async function DELETE(request: Request, { params }: RouteParams) {
  const identity = await getApiRequestIdentity(request);
  if (!identity?.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    assertSameOriginForIdentity(request, identity);
    const { id } = (await readJsonBody<{ id?: string } | null>(request, 16 * 1024)) ?? {};
    const document = await cloudDocument(request, identity, (await params).filename);
    const gate = document ? await agentGate(identity, document.workspaceId, document.filename) : null;
    if (gate && gate.access !== "write") return agentWriteRequiredResponse(gate, "revoking a share link");
    const revoked = Boolean(id && document && await revokeShareLink(identity.userId, document.documentId, id));
    return revoked ? NextResponse.json({ revoked: true }) : NextResponse.json({ error: "Share link not found." }, { status: 404 });
  } catch (error) {
    return errorResponse(error);
  }
}
