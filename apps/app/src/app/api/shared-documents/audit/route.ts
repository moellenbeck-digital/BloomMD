import { NextResponse } from "next/server";
import { getApiRequestIdentity } from "../../../../lib/auth";
import { normalizeUuid, recordSharedDocumentBindingAudit, recordSharedFolderBindingAudit, SHARED_FOLDER_AUDIT_MAX_DOCUMENTS } from "../../../../lib/db";
import { assertRateLimit, assertSameOriginForIdentity, readJsonBody } from "../../../../lib/request-security";
import { workspaceErrorResponse } from "../../../../lib/workspace-api";

export async function POST(request: Request) {
  const identity = await getApiRequestIdentity(request);
  const userId = normalizeUuid(identity?.userId);
  if (!identity || !userId) return NextResponse.json({ error: "A cloud session is required." }, { status: 401 });

  try {
    assertSameOriginForIdentity(request, identity);
    await assertRateLimit(request, { action: "shared-document-audit", identifier: identity.email ?? userId, limit: 60, windowMs: 60 * 60 * 1000 });
    const body = await readJsonBody<{ action?: unknown; documentId?: unknown; documentIds?: unknown; workspaceId?: unknown }>(request, 32 * 1024);
    const validAction = body.action === "bound" || body.action === "unbound";
    if (!validAction || typeof body.workspaceId !== "string") {
      return NextResponse.json({ error: "action, documentId, and workspaceId are required" }, { status: 400 });
    }

    // Folder publication: one request for many documents, still only IDs.
    if (body.documentIds !== undefined) {
      const documentIds = body.documentIds;
      if (body.documentId !== undefined
        || !Array.isArray(documentIds)
        || documentIds.length === 0
        || documentIds.length > SHARED_FOLDER_AUDIT_MAX_DOCUMENTS
        || !documentIds.every((value): value is string => typeof value === "string")) {
        return NextResponse.json({ error: "documentIds must be a non-empty list of document IDs" }, { status: 400 });
      }
      await recordSharedFolderBindingAudit({ userId, workspaceId: body.workspaceId, documentIds, action: body.action as "bound" | "unbound" });
      return NextResponse.json({ recorded: true, count: documentIds.length });
    }

    if (typeof body.documentId !== "string") {
      return NextResponse.json({ error: "action, documentId, and workspaceId are required" }, { status: 400 });
    }
    await recordSharedDocumentBindingAudit({ userId, workspaceId: body.workspaceId, documentId: body.documentId, action: body.action as "bound" | "unbound" });
    return NextResponse.json({ recorded: true });
  } catch (error) {
    return workspaceErrorResponse(error, "Shared document audit could not be recorded.");
  }
}
