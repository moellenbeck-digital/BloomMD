import { parseKnowledgeNodePatch } from "@bloommd/core/knowledge";
import { applyNodeOperations } from "../../../../../../lib/knowledge-nodes-api";

interface RouteParams {
  params: Promise<{ filename: string; nodeId: string }>;
}

/**
 * PATCH /api/mindmaps/:filename/nodes/:nodeId → change one node partially (agents).
 *
 * Body: `title`, `content` (+ `contentMode`), `kind`, `status`, `decision`, `due`, `assignee`, `note`,
 * `citation`, `url`, `relations` and/or `children` (new nodes, appended at the end of the node).
 * Fields that are not given stay as they are. Same rules as `POST …/nodes`: rights of the token,
 * proposal or direct write, change log, merge into the live document; it never replaces the map.
 */
export async function PATCH(request: Request, { params }: RouteParams) {
  const { filename, nodeId } = await params;
  return applyNodeOperations(request, filename, ({ agentMeta: _agentMeta, ...patch }) => parseKnowledgeNodePatch(patch, nodeId), { tool: "api:node", unknownNode: "not-found" });
}
