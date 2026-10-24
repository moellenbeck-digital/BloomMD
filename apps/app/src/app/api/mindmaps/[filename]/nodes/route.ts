import { applyKnowledgeNodes, isKnowledgeInputError, parseKnowledgeNodeInputs } from "@bloommd/core/knowledge";
import { parseFile, serializeToMarkdown } from "@bloommd/core/parser";
import { NextResponse } from "next/server";
import { auditAgentWrite } from "../../../../../lib/agent-audit";
import { getApiRequestIdentity } from "../../../../../lib/auth";
import { getMindmapStorage } from "../../../../../lib/mindmap-storage";
import { assertSameOriginForIdentity, readJsonBody, RequestSecurityError } from "../../../../../lib/request-security";
import { applyKnowledgeNodesThroughSyncServer, SyncMutationError } from "../../../../../lib/sync-room-status";

interface RouteParams {
  params: Promise<{ filename: string }>;
}

/**
 * POST /api/mindmaps/:filename/nodes → add or update single nodes by id (agents).
 *
 * Unlike PUT, this never replaces the document: cloud documents merge the operations into the
 * live sync room, so it works while people are editing the same map.
 */
export async function POST(request: Request, { params }: RouteParams) {
  const identity = await getApiRequestIdentity(request);
  if (!identity) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    assertSameOriginForIdentity(request, identity);
    const { filename } = await params;
    const body = await readJsonBody<{ nodes?: unknown }>(request, 2 * 1024 * 1024);
    const nodes = parseKnowledgeNodeInputs(body.nodes);
    const store = await getMindmapStorage(request, identity);
    const current = await store.read(filename);
    if (current.storage?.permission === "read") return NextResponse.json({ error: "This workspace is read-only." }, { status: 403 });

    if (current.storage?.mode === "database") {
      if (!identity.userId) return NextResponse.json({ error: "Cloud document sync requires an authenticated user.", code: "SYNC_MUTATION_UNAVAILABLE" }, { status: 503 });
      try {
        const result = await applyKnowledgeNodesThroughSyncServer(current.storage.documentId, {
          filename,
          workspaceId: current.storage.workspaceId,
          userId: identity.userId,
          nodes,
        });
        await auditAgentWrite(identity, result.storage ?? current.storage);
        return NextResponse.json({ ids: result.ids, created: result.created, updated: result.updated, version: result.version });
      } catch (error) {
        if (error instanceof SyncMutationError) {
          const status = error.status === 400 || error.status === 409 ? error.status : 503;
          return NextResponse.json({ error: error.message, code: error.code }, { status });
        }
        throw error;
      }
    }

    const change = applyKnowledgeNodes(serializeToMarkdown(current), nodes);
    const doc = parseFile(filename, change.markdown);
    doc.storage = current.storage;
    const saved = await store.write(doc);
    return NextResponse.json({ ids: change.ids, created: change.created, updated: change.updated, version: saved.storage?.version ?? null });
  } catch (error) {
    if (error instanceof RequestSecurityError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (isKnowledgeInputError(error)) return NextResponse.json({ error: error.message, code: "INVALID_NODES" }, { status: 400 });
    if (error instanceof Error && error.message === "Workspace not found or access denied.") return NextResponse.json({ error: error.message }, { status: 404 });
    if (error instanceof Error && error.message === "Document not found.") return NextResponse.json({ error: "Mindmap not found." }, { status: 404 });
    console.error("[BloomMD] Node operations failed:", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ error: "Nodes could not be saved." }, { status: 500 });
  }
}
