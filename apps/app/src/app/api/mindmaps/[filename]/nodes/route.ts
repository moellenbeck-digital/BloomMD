import { parseKnowledgeNodeInputs } from "@bloommd/core/knowledge";
import { applyNodeOperations } from "../../../../../lib/knowledge-nodes-api";

interface RouteParams {
  params: Promise<{ filename: string }>;
}

/**
 * POST /api/mindmaps/:filename/nodes → add or update single nodes by id (agents).
 *
 * Unlike PUT, this never replaces the document: cloud documents merge the operations into the
 * live sync room, so it works while people are editing the same map. A partial change of one node
 * is `PATCH …/nodes/:nodeId`.
 */
export async function POST(request: Request, { params }: RouteParams) {
  const { filename } = await params;
  return applyNodeOperations(request, filename, (body) => parseKnowledgeNodeInputs(body.nodes), { tool: "api:nodes", unknownNode: "invalid" });
}
