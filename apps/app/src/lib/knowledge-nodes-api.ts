import { applyKnowledgeNodes, isKnowledgeInputError, KnowledgeInputError, KnowledgeNodeNotFoundError, type KnowledgeNodeInput } from "@bloommd/core/knowledge";
import { parseFile, serializeToMarkdown } from "@bloommd/core/parser";
import { NextResponse } from "next/server";
import { agentProposalResponse, logAgentChange } from "./agent-access";
import { auditAgentWrite } from "./agent-audit";
import { agentGate, agentReadOnlyResponse, readAgentMeta } from "./agent-gate";
import { getApiRequestIdentity } from "./auth";
import { getMindmapStorage } from "./mindmap-storage";
import { assertSameOriginForIdentity, readJsonBody, RequestSecurityError } from "./request-security";
import { applyKnowledgeNodesThroughSyncServer, SyncMutationError } from "./sync-room-status";

export interface NodeOperationsOptions {
  /** Tool name in the change log and in proposals when the agent names none. */
  tool: string;
  /** An unknown node id is a missing resource on the node route (404) and a bad request on the batch route (400). */
  unknownNode: "not-found" | "invalid";
}

function unknownNodeResponse(message: string, options: NodeOperationsOptions) {
  return options.unknownNode === "not-found"
    ? NextResponse.json({ error: message, code: "NODE_NOT_FOUND" }, { status: 404 })
    : NextResponse.json({ error: message, code: "INVALID_NODES" }, { status: 400 });
}

/**
 * The node routes of a map (`POST …/nodes`, `PATCH …/nodes/:nodeId`) share everything after parsing:
 * the rights of the caller (`agentGate`), proposals, the audit, the change log and the merge into the
 * live sync room. `readNodes` turns the JSON body into node operations and throws on invalid input.
 *
 * This never replaces the document: cloud documents merge the operations into the live sync room,
 * so it works while people are editing the same map.
 */
export async function applyNodeOperations(request: Request, filename: string, readNodes: (body: Record<string, unknown>) => KnowledgeNodeInput[], options: NodeOperationsOptions): Promise<NextResponse> {
  const identity = await getApiRequestIdentity(request);
  if (!identity) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    assertSameOriginForIdentity(request, identity);
    const body = await readJsonBody<Record<string, unknown> | null>(request, 2 * 1024 * 1024);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new KnowledgeInputError("The request body must be a JSON object.");
    const nodes = readNodes(body);
    const store = await getMindmapStorage(request, identity);
    const current = await store.read(filename);
    if (current.storage?.permission === "read") return NextResponse.json({ error: "This workspace is read-only." }, { status: 403 });

    if (current.storage?.mode === "database") {
      if (!identity.userId) return NextResponse.json({ error: "Cloud document sync requires an authenticated user.", code: "SYNC_MUTATION_UNAVAILABLE" }, { status: 503 });
      // Agent tokens change nodes only within their rights; the stored file name decides the area.
      const gate = await agentGate(identity, current.storage.workspaceId, current.filePath);
      const meta = readAgentMeta(body.agentMeta);
      if (gate?.access === "read") return agentReadOnlyResponse(gate);
      if (gate?.access === "propose") {
        const change = applyKnowledgeNodes(serializeToMarkdown(current), nodes);
        return agentProposalResponse(gate, { markdown: change.markdown, baseVersion: current.storage.version, defaultSummary: `${change.created.length} node(s) created, ${change.updated.length} updated`, meta, defaultTool: options.tool });
      }
      try {
        const result = await applyKnowledgeNodesThroughSyncServer(current.storage.documentId, {
          filename,
          workspaceId: current.storage.workspaceId,
          userId: identity.userId,
          nodes,
        });
        await auditAgentWrite(identity, result.storage ?? current.storage);
        const changeId = gate ? await logAgentChange(gate, { event: "written", beforeMarkdown: serializeToMarkdown(current), afterVersion: result.version, meta, defaultTool: options.tool, defaultSummary: `${result.created.length} node(s) created, ${result.updated.length} updated` }).catch((error: unknown) => {
          console.error("[BloomMD] Agent change could not be logged:", error instanceof Error ? error.name : "unknown");
          return undefined;
        }) : undefined;
        return NextResponse.json({ ids: result.ids, created: result.created, updated: result.updated, version: result.version, ...(gate ? { mode: "written", changeId } : {}) });
      } catch (error) {
        if (error instanceof SyncMutationError) {
          if (error.code === "NODE_NOT_FOUND") return unknownNodeResponse(error.message, options);
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
    if (error instanceof KnowledgeNodeNotFoundError) return unknownNodeResponse(error.message, options);
    if (isKnowledgeInputError(error)) return NextResponse.json({ error: error.message, code: "INVALID_NODES" }, { status: 400 });
    if (error instanceof Error && error.message === "Workspace not found or access denied.") return NextResponse.json({ error: error.message }, { status: 404 });
    if (error instanceof Error && error.message === "Document not found.") return NextResponse.json({ error: "Mindmap not found." }, { status: 404 });
    console.error("[BloomMD] Node operations failed:", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ error: "Nodes could not be saved." }, { status: 500 });
  }
}
