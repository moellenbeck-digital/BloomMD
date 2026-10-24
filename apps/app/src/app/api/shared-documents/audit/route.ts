import { NextResponse } from "next/server";
import { getApiRequestIdentity } from "../../../../lib/auth";
import { normalizeUuid, recordSharedDocumentBindingAudit } from "../../../../lib/db";
import { assertRateLimit, assertSameOriginForIdentity, readJsonBody } from "../../../../lib/request-security";
import { workspaceErrorResponse } from "../../../../lib/workspace-api";

export async function POST(request: Request) {
  const identity = await getApiRequestIdentity(request);
  const userId = normalizeUuid(identity?.userId);
  if (!identity || !userId) return NextResponse.json({ error: "A cloud session is required." }, { status: 401 });

  try {
    assertSameOriginForIdentity(request, identity);
    await assertRateLimit(request, { action: "shared-document-audit", identifier: identity.email ?? userId, limit: 60, windowMs: 60 * 60 * 1000 });
    const body = await readJsonBody<{ action?: unknown; documentId?: unknown; workspaceId?: unknown }>(request, 16 * 1024);
    if ((body.action !== "bound" && body.action !== "unbound") || typeof body.documentId !== "string" || typeof body.workspaceId !== "string") {
      return NextResponse.json({ error: "action, documentId, and workspaceId are required" }, { status: 400 });
    }
    await recordSharedDocumentBindingAudit({ userId, workspaceId: body.workspaceId, documentId: body.documentId, action: body.action });
    return NextResponse.json({ recorded: true });
  } catch (error) {
    return workspaceErrorResponse(error, "Shared document audit could not be recorded.");
  }
}
