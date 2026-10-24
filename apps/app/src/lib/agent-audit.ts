import type { ApiRequestIdentity } from "./auth";
import { recordAgentDocumentWrite } from "./db";

/**
 * Records a document change made with an agent token (save, rename or delete); ordinary saves are
 * not audited here.
 */
export async function auditAgentWrite(identity: ApiRequestIdentity, storage: unknown, action?: "rename" | "delete"): Promise<void> {
  if (!identity.agentName || !identity.tokenId || !identity.userId) return;
  const { documentId, workspaceId } = (storage ?? {}) as { documentId?: string; workspaceId?: string };
  if (!documentId) return;
  await recordAgentDocumentWrite({ userId: identity.userId, documentId, tokenId: identity.tokenId, agentName: identity.agentName, workspaceId, action });
}
