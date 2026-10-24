import type { ApiRequestIdentity } from "./auth";
import { normalizeUuid } from "./db";

/**
 * The workspace a request may use. A workspace-bound agent token works in its first workspace by
 * default and nowhere else; sessions and unbound tokens keep the requested workspace (membership is
 * checked in the database).
 */
export function workspaceForIdentity(identity: Pick<ApiRequestIdentity, "tokenWorkspaceIds">, requested: string | null | undefined): string | null | undefined {
  const allowed = identity.tokenWorkspaceIds;
  if (!allowed?.length) return requested;
  const workspaceId = requested || allowed[0]!;
  if (!allowed.includes(normalizeUuid(workspaceId) ?? "")) throw new Error("Workspace not found or access denied.");
  return workspaceId;
}
